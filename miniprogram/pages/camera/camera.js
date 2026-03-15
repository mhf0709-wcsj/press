// 压力表检定数据填报页面
// 包含 OCR 识别、云函数调用、表单处理等所有功能
const db = wx.cloud.database()
const baiduOCRUtil = require('../utils/baiduOCR.js')

Page({
  data: {
    activeTab: 'ocr', // 'ocr' 或 'manual'
    imagePath: '',
    installPhotoPath: '', // 安装照片路径
    saving: false,
    ocrLoading: false,
    showEditForm: false,
    accessToken: '',
    conclusionIndex: 0,
    expiryDateText: '',
    qualityScore: 0,
    enterpriseUser: null,
    // 来源判断
    fromAdmin: false, // 是否从管理端跳转
    // 到期提醒相关
    showExpiryModal: false,
    expiryReminder: null,
    // 辖区选项
    districtOptions: ['大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所'],
    districtIndex: 0,
    // 设备相关
    devices: [],           // 可选设备列表
    deviceIndex: -1,       // 当前选中设备索引
    selectedDeviceId: '',  // 选中设备ID
    selectedDeviceName: '',// 选中设备名称
    showNewDevice: false,  // 显示新建设备表单
    newDevice: {
      deviceNo: '',
      deviceName: '',
      deviceType: ''
    },
    // 表单数据
    formData: {
      certNo: '',
      sendUnit: '',
      instrumentName: '',
      modelSpec: '',
      factoryNo: '',
      manufacturer: '',
      verificationStd: '',
      conclusion: '',
      verificationDate: '',
      district: '' // 所在辖区
    }
  },

  onLoad(options) {
    console.log('=== 数据填报页面启动 ===')
    // 判断是否从管理端跳转（支持url参数和storage两种方式）
    const cameraFrom = wx.getStorageSync('cameraFrom')
    if (options.from === 'admin' || cameraFrom === 'admin') {
      this.setData({ fromAdmin: true })
      // 清除storage中的标记
      wx.removeStorageSync('cameraFrom')
      // 从管理端跳转时，加载管理员信息
      this.loadAdminInfo()
    } else {
      this.loadEnterpriseInfo()
    }
    this.initOCRService()
    // 初始化手动填报的默认值
    this.initManualForm()
    // 加载设备列表
    this.loadDevices()
  },

  onShow() {
    // 检查是否从管理端跳转（支持从tabBar再次进入的情况）
    const cameraFrom = wx.getStorageSync('cameraFrom')
    if (cameraFrom === 'admin') {
      this.setData({ fromAdmin: true })
      wx.removeStorageSync('cameraFrom')
      this.loadAdminInfo()
    } else if (!this.data.fromAdmin) {
      // 只有企业用户才检查到期提醒
      this.loadEnterpriseInfo()
      this.checkExpiryReminder()
    }
  },

  // 加载企业信息
  loadEnterpriseInfo() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser: enterpriseUser })
  },

  // 加载管理员信息（从管理端跳转时使用）
  loadAdminInfo() {
    const adminUser = wx.getStorageSync('adminUser')
    if (adminUser) {
      // 管理员创建记录时，使用管理员信息
      this.setData({ 
        enterpriseUser: {
          companyName: '管理端录入',
          contact: adminUser.username,
          isAdmin: true,
          district: adminUser.district || null
        }
      })
      // 如果是辖区管理员，自动选中辖区
      if (adminUser.district) {
        const districtIndex = this.data.districtOptions.indexOf(adminUser.district)
        if (districtIndex > -1) {
          this.setData({
            districtIndex: districtIndex,
            'formData.district': adminUser.district
          })
        }
      }
    }
  },

  // 加载设备列表
  loadDevices() {
    const { enterpriseUser, fromAdmin } = this.data
    if (!enterpriseUser) return
    
    let whereCondition = {}
    
    if (fromAdmin) {
      // 管理员模式：按辖区筛选
      const adminUser = wx.getStorageSync('adminUser')
      if (adminUser && adminUser.district) {
        whereCondition.district = adminUser.district
      }
    } else {
      // 企业用户：只看本企业设备
      whereCondition.enterpriseName = enterpriseUser.companyName
    }
    
    db.collection('devices').where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
      .then(res => {
        this.setData({ devices: res.data })
      })
      .catch(err => {
        console.error('加载设备失败:', err)
      })
  },

  // 设备选择
  onDeviceChange(e) {
    const index = e.detail.value
    const device = this.data.devices[index]
    if (device) {
      this.setData({
        deviceIndex: index,
        selectedDeviceId: device._id,
        selectedDeviceName: device.deviceName,
        showNewDevice: false
      })
    }
  },

  // 显示新建设备表单
  showNewDeviceForm() {
    this.setData({
      showNewDevice: true,
      newDevice: {
        deviceNo: '',
        deviceName: '',
        deviceType: '压力表'
      }
    })
  },

  // 隐藏新建设备表单
  hideNewDeviceForm() {
    this.setData({ showNewDevice: false })
  },

  // 返回上一页
  goBack() {
    this.setData({
      showEditForm: false,
      imagePath: '',
      qualityScore: 0
    })
  },

  // 新建设备输入
  onNewDeviceInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`newDevice.${field}`]: value })
  },

  // 保存新设备
  saveNewDevice() {
    const { newDevice, enterpriseUser, formData, fromAdmin } = this.data
    
    if (!newDevice.deviceName.trim()) {
      wx.showToast({ title: '请输入设备名称', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '创建中...' })
    
    const deviceData = {
      deviceNo: newDevice.deviceNo || `DEV-${Date.now()}`,
      deviceName: newDevice.deviceName,
      deviceType: newDevice.deviceType || '压力表',
      enterpriseId: enterpriseUser._id || enterpriseUser.companyName,
      enterpriseName: fromAdmin ? '管理端录入' : enterpriseUser.companyName,
      district: formData.district || '',
      factoryNo: '', // 关联的出厂编号，后续录入时更新
      createTime: this.formatDateTime(new Date()),
      updateTime: this.formatDateTime(new Date()),
      recordCount: 0
    }
    
    db.collection('devices').add({
      data: deviceData
    }).then(res => {
      wx.hideLoading()
      wx.showToast({ title: '创建成功', icon: 'success' })
      
      // 刷新设备列表并选中新设备
      this.loadDevices()
      this.setData({
        showNewDevice: false,
        selectedDeviceId: res._id,
        selectedDeviceName: newDevice.deviceName,
        deviceIndex: 0 // 新设备在列表开头
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('创建设备失败:', err)
      wx.showToast({ title: '创建失败', icon: 'none' })
    })
  },

  // 检查到期提醒
  checkExpiryReminder() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    if (!enterpriseUser || !enterpriseUser.companyName) return

    // 检查今日是否已提醒
    const today = this.formatDate(new Date())
    const lastReminderDate = wx.getStorageSync('lastReminderDate')
    if (lastReminderDate === today) {
      console.log('今日已提醒过，跳过')
      return
    }

    // 调用云函数查询临期记录
    wx.cloud.callFunction({
      name: 'expiryReminder',
      data: {
        action: 'getEnterpriseExpiring',
        enterpriseName: enterpriseUser.companyName,
        days: 30
      },
      success: (res) => {
        console.log('到期提醒查询结果:', res.result)
        if (res.result.success) {
          const { expired, expiring, totalCount } = res.result.data
          if (totalCount > 0) {
            // 显示提醒弹窗
            this.setData({
              showExpiryModal: true,
              expiryReminder: {
                expiredCount: expired.length,
                expiringCount: expiring.length,
                totalCount: totalCount,
                expiredList: expired.slice(0, 5),
                expiringList: expiring.slice(0, 5)
              }
            })
            // 记录今日已提醒
            wx.setStorageSync('lastReminderDate', today)
          }
        }
      },
      fail: (err) => {
        console.error('查询到期提醒失败:', err)
      }
    })
  },

  // 关闭到期提醒弹窗（稍后处理）
  closeExpiryModal() {
    this.setData({ showExpiryModal: false })
    // 记录今日已提醒，当天不再显示
    const today = this.formatDate(new Date())
    wx.setStorageSync('lastReminderDate', today)
    console.log('用户点击稍后处理，今日不再提醒')
  },

  // 查看到期记录
  viewExpiryRecords() {
    this.setData({ showExpiryModal: false })
    // 记录今日已提醒
    const today = this.formatDate(new Date())
    wx.setStorageSync('lastReminderDate', today)
    wx.switchTab({
      url: '/pages/archive/archive'
    })
  },

  // Tab切换
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab === 'manual') {
      this.initManualForm()
    }
  },

  // 初始化手动填报表单
  initManualForm() {
    // 不设置默认值，用户需要手动填写所有字段
    // 仅设置检定日期为今天
    if (!this.data.formData.verificationDate) {
      const today = new Date()
      const dateStr = this.formatDate(today)
      const expiryDate = this.calculateExpiryDate(dateStr)
      const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
      this.setData({ 
        'formData.verificationDate': dateStr, 
        expiryDateText: expiryText 
      })
    }
  },

  // 辖区选择
  onDistrictChange(e) {
    const index = e.detail.value
    const district = this.data.districtOptions[index]
    this.setData({
      districtIndex: index,
      'formData.district': district
    })
  },

  // 检定结论选择
  onConclusionChange(e) {
    const index = e.detail.value
    const conclusions = ['合格', '不合格']
    this.setData({
      conclusionIndex: index,
      'formData.conclusion': conclusions[index]
    })
  },

  // 检定日期选择
  onDateChange(e) {
    const date = e.detail.value
    const expiryDate = this.calculateExpiryDate(date)
    const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
    this.setData({ 
      'formData.verificationDate': date, 
      expiryDateText: expiryText 
    })
  },

  // 计算到期日期（检定日期+6个月）
  calculateExpiryDate(verificationDate) {
    const date = new Date(verificationDate)
    date.setMonth(date.getMonth() + 6)
    date.setDate(date.getDate() - 1) // 检定日期+6个月-1天
    return date
  },

  // 初始化OCR服务
  initOCRService() {
    wx.showLoading({ title: '初始化OCR服务...' })
    wx.getStorage({
      key: 'baidu_access_token',
      success: (res) => {
        const { token, expireTime } = res.data
        if (Date.now() < expireTime) {
          this.setData({ accessToken: token })
          console.log('✓ 使用缓存token')
          wx.hideLoading()
        } else {
          console.log('⚠ 缓存token已过期，重新获取')
          this.refreshToken()
        }
      },
      fail: (err) => {
        console.log('⚠ 无缓存token，首次获取')
        this.refreshToken()
      }
    })
  },

  // 刷新Token
  refreshToken() {
    baiduOCRUtil.getAccessToken()
      .then(token => {
        const expireTime = Date.now() + 25 * 24 * 60 * 60 * 1000
        wx.setStorage({
          key: 'baidu_access_token',
          data: { token, expireTime },
          success: () => {
            this.setData({ accessToken: token })
            wx.hideLoading()
            console.log('✓ Token获取成功')
          }
        })
      })
      .catch(err => {
        wx.hideLoading()
        console.error('✗ Token获取失败:', err)
        wx.showToast({ title: 'OCR服务初始化失败', icon: 'none' })
      })
  },

  // 拍照/选择图片
  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({ imagePath: tempFilePath })
      }
    })
  },

  // 重新拍照
  retakePhoto() {
    this.setData({ 
      imagePath: '', 
      showEditForm: false,
      qualityScore: 0 
    })
  },

  // 开始OCR识别
  startOCR() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先拍摄图片', icon: 'none' })
      return
    }
    this.performOCR(this.data.imagePath)
  },

  // 上传图片（手动模式）
  uploadImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({ imagePath: tempFilePath })
      }
    })
  },

  // 执行OCR识别
  performOCR(imagePath) {
    this.setData({ ocrLoading: true })
    wx.showLoading({ title: '处理图片中...' })

    // 先压缩图片，解决image size error问题
    const that = this
    wx.compressImage({
      src: imagePath,
      quality: 80,
      compressedWidth: 2000,
      success: function(compressRes) {
        console.log('图片压缩成功')
        that._doOCRUpload(compressRes.tempFilePath)
      },
      fail: function(err) {
        console.log('压缩失败，使用原图')
        that._doOCRUpload(imagePath)
      }
    })
  },

  // 内部方法：上传并执行OCR
  _doOCRUpload(filePath) {
    const cloudPath = `ocr-temp/enterprise_${Date.now()}.jpg`
    const that = this
    
    console.log('开始上传图片:', filePath)
    
    wx.cloud.uploadFile({
      cloudPath,
      filePath: filePath,
      success: (uploadRes) => {
        console.log('图片上传成功:', uploadRes.fileID)
        
        // 调用云函数进行OCR识别
        wx.cloud.callFunction({
          name: 'baiduOcr',
          data: {
            fileID: uploadRes.fileID
          },
          success: (res) => {
            console.log('云函数返回:', JSON.stringify(res))
            wx.hideLoading()
            that.setData({ ocrLoading: false })
            
            if (res.result) {
              if (res.result.success && res.result.text) {
                // 解析OCR文本提取字段
                const ocrData = that.parseOcrText(res.result.text)
                that.fillFormWithOCR(ocrData)
                wx.showToast({ title: '识别成功', icon: 'success' })
              } else {
                console.error('OCR识别失败:', res.result.error)
                wx.showToast({ title: res.result.error || '识别失败', icon: 'none', duration: 3000 })
              }
            } else {
              console.error('云函数返回异常:', res)
              wx.showToast({ title: '服务异常，请重试', icon: 'none' })
            }
            
            // 删除临时文件
            wx.cloud.deleteFile({ fileList: [uploadRes.fileID] })
          },
          fail: (err) => {
            wx.hideLoading()
            that.setData({ ocrLoading: false })
            console.error('云函数调用失败:', JSON.stringify(err))
            wx.showToast({ 
              title: err.errMsg || '云函数调用失败', 
              icon: 'none',
              duration: 3000
            })
            wx.cloud.deleteFile({ fileList: [uploadRes.fileID] })
          }
        })
      },
      fail: (err) => {
        wx.hideLoading()
        that.setData({ ocrLoading: false })
        console.error('图片上传失败:', JSON.stringify(err))
        wx.showToast({ 
          title: err.errMsg || '上传失败', 
          icon: 'none',
          duration: 3000
        })
      }
    })
  },

  // 解析OCR文本提取字段（针对压力表检定证书优化）
  parseOcrText(text) {
    const result = {}
    console.log('原始OCR文本:\n', text)
    
    // ===== 证书编号 =====
    // 格式：FP2603144（字母+数字）
    const certNoMatch = text.match(/证书编号[：:\s]*([A-Za-z]{1,3}\d{5,})/i) ||
                        text.match(/([A-Z]{1,3}\d{6,})/i)
    if (certNoMatch) result.certNo = certNoMatch[1].trim()
    
    // ===== 出厂编号 =====
    // 格式：24121201（纯数字或字母数字混合）
    const factoryNoMatch = text.match(/出\s*厂\s*编\s*号[：:\s]*([A-Za-z0-9\-]+)/i) ||
                           text.match(/厂.*编.*号[：:\s]*([A-Za-z0-9\-]+)/i)
    if (factoryNoMatch) result.factoryNo = factoryNoMatch[1].trim()
    
    // ===== 送检单位 =====
    // 格式：浙江交工集团股份有限公司（青文高速）
    const sendUnitMatch = text.match(/送\s*检\s*单\s*位[：:\s]*(.+?)(?:\n|计量|型号|$)/i) ||
                          text.match(/委托单位[：:\s]*(.+?)(?:\n|$)/i)
    if (sendUnitMatch) {
      let unit = sendUnitMatch[1].trim()
      unit = unit.replace(/计量.*$/, '').trim()
      result.sendUnit = unit
    }
    
    // ===== 计量器具名称 =====
    // 格式：耐震压力表
    const instrumentMatch = text.match(/计\s*量\s*器\s*具\s*名\s*称[：:\s]*(.+?)(?:\n|型|$)/i) ||
                            text.match(/器具名称[：:\s]*(.+?)(?:\n|$)/i) ||
                            text.match(/仪器名称[：:\s]*(.+?)(?:\n|$)/i)
    if (instrumentMatch) {
      let name = instrumentMatch[1].trim()
      name = name.replace(/型.*$/, '').trim()
      result.instrumentName = name
    } else if (text.includes('耐震压力表')) {
      result.instrumentName = '耐震压力表'
    } else if (text.includes('压力表')) {
      result.instrumentName = '压力表'
    }
    
    // ===== 型号/规格 =====
    // 格式：(0-1.6) Mpa
    const modelMatch = text.match(/型\s*号[\/\s]*规\s*格[：:\s]*(.+?)(?:\n|制造|$)/i) ||
                       text.match(/规格型号[：:\s]*(.+?)(?:\n|$)/i) ||
                       text.match(/(\(\d[\d\.\-~～]+\)\s*[Mm][Pp]a)/i) ||
                       text.match(/([\d\.\-~～]+\s*[Mm][Pp]a)/i)
    if (modelMatch) {
      let spec = modelMatch[1].trim()
      spec = spec.replace(/制造.*$/, '').trim()
      result.modelSpec = spec
    }
    
    // ===== 制造单位 =====
    // 格式：上海亭山仪表厂
    const manuMatch = text.match(/制\s*造\s*单\s*位[：:\s]*(.+?)(?:\n|出|$)/i) ||
                      text.match(/生产厂家[：:\s]*(.+?)(?:\n|$)/i)
    if (manuMatch) {
      let manu = manuMatch[1].trim()
      manu = manu.replace(/出.*$/, '').trim()
      result.manufacturer = manu
    }
    
    // ===== 检定依据 =====
    // 格式：JJG 52-2013
    const stdMatch = text.match(/检\s*定\s*依\s*据[：:\s]*(JJG\s*\d+[\-\d]*)/i) ||
                     text.match(/(JJG\s*\d+[\s\-]*\d*)/i)
    if (stdMatch) result.verificationStd = stdMatch[1].replace(/\s+/g, ' ').trim()
    
    // ===== 检定结论 =====
    // 格式：该压力表合格
    if (text.includes('不合格')) {
      result.conclusion = '不合格'
    } else if (text.match(/合\s*格/)) {
      result.conclusion = '合格'
    }
    
    // ===== 检定日期 =====
    // 格式：2026年3月6日
    const dateMatch = text.match(/检\s*定\s*日\s*期[：:\s]*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/i)
    if (dateMatch) {
      const year = dateMatch[1]
      const month = dateMatch[2].padStart(2, '0')
      const day = dateMatch[3].padStart(2, '0')
      result.verificationDate = `${year}-${month}-${day}`
    } else {
      // 备用格式
      const dateMatch2 = text.match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/)
      if (dateMatch2) {
        result.verificationDate = `${dateMatch2[1]}-${dateMatch2[2].padStart(2,'0')}-${dateMatch2[3].padStart(2,'0')}`
      }
    }
    
    // ===== 有效期至 =====
    const expiryMatch = text.match(/有\s*效\s*期\s*至[：:\s]*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/i)
    if (expiryMatch) {
      result.expiryDate = `${expiryMatch[1]}-${expiryMatch[2].padStart(2,'0')}-${expiryMatch[3].padStart(2,'0')}`
    }
    
    console.log('解析OCR结果:', result)
    return result
  },

  // 用OCR结果填充表单
  fillFormWithOCR(ocrData) {
    const formData = { ...this.data.formData }
    
    if (ocrData.certNo) formData.certNo = ocrData.certNo
    if (ocrData.sendUnit) formData.sendUnit = ocrData.sendUnit
    if (ocrData.instrumentName) formData.instrumentName = ocrData.instrumentName
    if (ocrData.modelSpec) formData.modelSpec = ocrData.modelSpec
    if (ocrData.factoryNo) formData.factoryNo = ocrData.factoryNo
    if (ocrData.manufacturer) formData.manufacturer = ocrData.manufacturer
    if (ocrData.verificationStd) formData.verificationStd = ocrData.verificationStd
    if (ocrData.conclusion) {
      formData.conclusion = ocrData.conclusion
      const conclusions = ['合格', '不合格']
      const index = conclusions.indexOf(ocrData.conclusion)
      if (index > -1) {
        this.setData({ conclusionIndex: index })
      }
    }
    if (ocrData.verificationDate) {
      formData.verificationDate = ocrData.verificationDate
      const expiryDate = this.calculateExpiryDate(ocrData.verificationDate)
      const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
      this.setData({ expiryDateText: expiryText })
    }

    this.setData({ formData, showEditForm: true })
  },

  // 表单输入处理
  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`formData.${field}`]: value
    })
  },

  // 预览图片
  previewImage() {
    if (this.data.imagePath) {
      wx.previewImage({ urls: [this.data.imagePath] })
    }
  },

  // 删除图片
  deleteImage() {
    this.setData({ imagePath: '' })
  },

  // 上传安装照片
  uploadInstallPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({ installPhotoPath: tempFilePath })
      }
    })
  },

  // 预览安装照片
  previewInstallPhoto() {
    if (this.data.installPhotoPath) {
      wx.previewImage({ urls: [this.data.installPhotoPath] })
    }
  },

  // 删除安装照片
  deleteInstallPhoto() {
    this.setData({ installPhotoPath: '' })
  },

  // 保存记录
  saveRecord() {
    const { formData, imagePath, installPhotoPath, activeTab, fromAdmin, enterpriseUser } = this.data

    // 验证用户信息
    if (!enterpriseUser || !enterpriseUser.companyName) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    // 手动填报模式必须上传图片
    if (activeTab === 'manual' && !imagePath) {
      wx.showToast({ title: '请上传检定表图片', icon: 'none' })
      return
    }

    // 必须上传安装照片
    if (!installPhotoPath) {
      wx.showToast({ title: '请上传安装照片', icon: 'none' })
      return
    }

    if (!formData.factoryNo.trim()) {
      wx.showToast({ title: '请填写出厂编号', icon: 'none' })
      return
    }
    if (!formData.verificationDate) {
      wx.showToast({ title: '请选择检定日期', icon: 'none' })
      return
    }
    if (!formData.district) {
      wx.showToast({ title: '请选择所在辖区', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '存档中...', mask: true })

    const verifyDate = new Date(formData.verificationDate)
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1) // 检定日期+6个月-1天

    const mainData = {
      ...formData,
      expiryDate: this.formatDate(expiryDate),
      status: 'valid',
      createTime: this.formatDateTime(new Date()),
      updateTime: this.formatDateTime(new Date()),
      ocrSource: activeTab === 'manual' ? 'manual' : 'baidu',
      hasImage: !!imagePath,
      hasInstallPhoto: true,
      // 添加企业关联信息
      enterpriseId: enterpriseUser._id || enterpriseUser.companyName,
      enterpriseName: enterpriseUser.companyName,
      enterprisePhone: enterpriseUser.phone || '',
      enterpriseLegalPerson: enterpriseUser.legalPerson || '',
      // 标记创建来源
      createdBy: fromAdmin ? 'admin' : 'enterprise',
      // 设备关联
      deviceId: this.data.selectedDeviceId || '',
      deviceName: this.data.selectedDeviceName || '',
      deviceNo: this.data.selectedDeviceId ? (this.data.devices[this.data.deviceIndex]?.deviceNo || '') : ''
    }

    // 先上传安装照片，再上传证书图片
    const installCloudPath = `install-photos/${formData.factoryNo}_${Date.now()}.jpg`
    wx.cloud.uploadFile({
      cloudPath: installCloudPath,
      filePath: installPhotoPath,
      success: (installRes) => {
        mainData.installPhotoFileID = installRes.fileID
        
        // 再上传证书图片
        if (imagePath) {
          const cloudPath = `pressure-certificates/${formData.factoryNo}_${Date.now()}.jpg`
          wx.cloud.uploadFile({
            cloudPath,
            filePath: imagePath,
            success: (res) => {
              mainData.fileID = res.fileID
              this.saveToDB(mainData)
            },
            fail: (err) => {
              console.error('证书图片上传失败:', err)
              this.handleFail('证书图片上传失败')
            }
          })
        } else {
          this.saveToDB(mainData)
        }
      },
      fail: (err) => {
        console.error('安装照片上传失败:', err)
        this.handleFail('安装照片上传失败')
      }
    })
  },

  // 保存到数据库
  saveToDB(mainData) {
    const { fromAdmin, selectedDeviceId } = this.data
    db.collection('pressure_records').add({
      data: mainData,
      success: (res) => {
        console.log('✓ 存档成功:', res._id)
        
        // 更新设备记录数
        if (selectedDeviceId) {
          this.updateDeviceRecordCount(selectedDeviceId)
        }
        
        wx.hideLoading()
        wx.showToast({ title: '✓ 存档成功', icon: 'success', duration: 1500 })
        this.resetForm()
        
        // 请求订阅消息授权（企业用户）
        if (!fromAdmin) {
          this.requestSubscribeMessage()
        }
        
        // 根据来源跳转到不同页面
        if (fromAdmin) {
          // 管理员创建，返回管理端
          wx.navigateBack()
        } else {
          // 企业用户，跳转到存档页面
          wx.switchTab({
            url: '/pages/archive/archive'
          })
        }
      },
      fail: (err) => {
        console.error('✗ 保存失败:', err)
        this.handleFail('保存失败')
      }
    })
  },

  // 更新设备记录数
  updateDeviceRecordCount(deviceId) {
    db.collection('pressure_records').where({
      deviceId: deviceId
    }).count().then(res => {
      db.collection('devices').doc(deviceId).update({
        data: {
          recordCount: res.total,
          updateTime: this.formatDateTime(new Date())
        }
      })
    })
  },

  // 请求订阅消息授权
  requestSubscribeMessage() {
    // 模板ID需要在微信公众平台申请，这里使用占位符
    const templateIds = ['TEMPLATE_ID_PLACEHOLDER']
    
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      success: (res) => {
        console.log('订阅消息授权结果:', res)
        // 如果用户同意，保存授权状态
        if (res[templateIds[0]] === 'accept') {
          console.log('用户同意接收到期提醒')
          // 可以保存用户的订阅状态到数据库
          this.saveSubscribeStatus(true)
        }
      },
      fail: (err) => {
        console.log('订阅消息授权失败:', err)
      }
    })
  },

  // 保存订阅状态
  saveSubscribeStatus(subscribed) {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    if (enterpriseUser && enterpriseUser._id) {
      db.collection('enterprises').doc(enterpriseUser._id).update({
        data: {
          subscribeMessage: subscribed,
          subscribeTime: new Date().toISOString()
        }
      })
    }
  },

  // 重置表单
  resetForm() {
    this.setData({
      imagePath: '',
      installPhotoPath: '',
      saving: false,
      showEditForm: false,
      expiryDateText: '',
      qualityScore: 0,
      formData: {
        certNo: '',
        sendUnit: '',
        instrumentName: '',
        modelSpec: '',
        factoryNo: '',
        manufacturer: '',
        verificationStd: '',
        conclusion: '',
        verificationDate: '',
        district: ''
      },
      conclusionIndex: 0,
      districtIndex: 0,
      deviceIndex: -1,
      selectedDeviceId: '',
      selectedDeviceName: '',
      showNewDevice: false,
      newDevice: {
        deviceNo: '',
        deviceName: '',
        deviceType: ''
      }
    })
    // 如果是手动填报模式，重新初始化默认值
    if (this.data.activeTab === 'manual') {
      this.initManualForm()
    }
  },

  // 格式化日期
  formatDate(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`
  },

  // 格式化日期时间
  formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${this.formatDate(date)} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`
  },

  // 处理失败
  handleFail(msg) {
    wx.hideLoading()
    this.setData({ saving: false })
    wx.showToast({ title: msg, icon: 'none', duration: 2000 })
  }
})
