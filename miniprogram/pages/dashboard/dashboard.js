const db = wx.cloud.database()
const baiduOCRUtil = require('../utils/baiduOCR.js')

Page({
  data: {
    overviewData: {
      totalRecords: 0,
      totalEnterprises: 0,
      totalDistricts: 0,
      expiryTotal: 0,
      districtStats: []
    },
    expirySummary: {
      expiredCount: 0,
      expiringCount: 0,
      enterpriseCount: 0
    },
    expiryEnterprises: [],
    conclusionStats: {
      qualified: 0,
      unqualified: 0
    },
    // 管理员信息
    isAdmin: true,
    adminDistrict: null,
    adminName: '',
    // 弹窗控制
    showExpiryModal: false,
    // OCR识别相关
    showOcrModal: false,
    ocrImagePath: '',
    ocrLoading: false,
    ocrSaving: false,
    ocrShowForm: false,
    ocrConclusionIndex: 0,
    ocrDistrictIndex: 0,
    ocrExpiryDateText: '',
    districtOptions: ['大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所'],
    ocrFormData: {
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
    }
  },

  onLoad() {
    this.checkAdminType()
  },

  onShow() {
    // 每次显示时刷新数据
    this.loadAllData()
  },

  // 检查管理员类型
  checkAdminType() {
    const adminInfo = wx.getStorageSync('adminUser')
    if (!adminInfo) {
      wx.redirectTo({
        url: '/pages/admin-login/admin-login'
      })
      return
    }
    
    if (adminInfo.role === 'district' && adminInfo.district) {
      this.setData({
        isAdmin: false,
        adminDistrict: adminInfo.district,
        adminName: adminInfo.district
      }, () => {
        this.loadAllData()
      })
    } else {
      this.setData({
        isAdmin: true,
        adminDistrict: null,
        adminName: '总管理端'
      }, () => {
        this.loadAllData()
      })
    }
  },

  loadAllData() {
    wx.showLoading({ title: '加载中...' })
    
    // 并行加载所有数据
    Promise.all([
      this.loadOverviewData(),
      this.loadExpiryData()
    ]).then(() => {
      wx.hideLoading()
      // 检查是否需要显示到期提醒弹窗
      this.checkAndShowExpiryModal()
    }).catch(err => {
      wx.hideLoading()
      console.error('加载数据失败:', err)
    })
  },

  // 检查并显示到期提醒弹窗
  checkAndShowExpiryModal() {
    const { expiredCount, expiringCount } = this.data.expirySummary
    const total = (expiredCount || 0) + (expiringCount || 0)
    
    // 如果有到期或过期记录，检查今日是否已点击过稍后处理
    if (total > 0) {
      const today = this.formatDate(new Date())
      const lastReminderDate = wx.getStorageSync('adminLastReminderDate')
      
      // 如果今天没有点击过稍后处理，则显示弹窗
      if (lastReminderDate !== today) {
        this.setData({ showExpiryModal: true })
      } else {
        console.log('今日已点击过稍后处理，不再显示弹窗')
      }
    }
  },

  // 阻止事件冒泡（弹窗内容区域点击不关闭弹窗）
  stopPropagation() {},

  // 关闭到期提醒弹窗
  closeExpiryModal() {
    this.setData({ showExpiryModal: false })
    // 记录今日已提醒，当天不再显示弹窗
    const today = this.formatDate(new Date())
    wx.setStorageSync('adminLastReminderDate', today)
    console.log('管理员点击稍后处理，今日不再提醒')
  },

  // 查看到期详情
  viewExpiryDetail() {
    this.setData({ showExpiryModal: false })
    this.goToDetail({ currentTarget: { dataset: { type: 'expiry' } } })
  },

  // 加载概览数据
  loadOverviewData() {
    return new Promise((resolve, reject) => {
      // 构建查询条件
      let query = db.collection('pressure_records')
      if (this.data.adminDistrict) {
        query = query.where({ district: this.data.adminDistrict })
      }
      
      // 统计总记录数
      query.count()
        .then(res => {
          const totalRecords = res.total
          
          // 获取所有记录统计企业和辖区
          let recordsQuery = db.collection('pressure_records')
            .field({ enterpriseName: true, district: true, conclusion: true })
            .limit(1000)
          
          if (this.data.adminDistrict) {
            recordsQuery = recordsQuery.where({ district: this.data.adminDistrict })
          }
          
          return recordsQuery.get()
            .then(result => {
              const records = result.data
              
              // 统计企业数
              const enterpriseSet = new Set()
              records.forEach(r => {
                if (r.enterpriseName) enterpriseSet.add(r.enterpriseName)
              })
              
              // 统计检定结论
              const conclusionStats = {
                qualified: 0,    // 合格
                unqualified: 0  // 不合格
              }
              records.forEach(r => {
                if (r.conclusion === '合格') conclusionStats.qualified++
                else if (r.conclusion === '不合格') conclusionStats.unqualified++
              })
              
              // 统计辖区分布
              const districtMap = {}
              records.forEach(r => {
                const d = r.district || '未设置'
                districtMap[d] = (districtMap[d] || 0) + 1
              })
              
              const districtStats = Object.keys(districtMap)
                .map(district => ({
                  district,
                  count: districtMap[district],
                  percent: records.length > 0 ? Math.round(districtMap[district] / records.length * 100) : 0
                }))
                .sort((a, b) => b.count - a.count)
              
              const totalDistricts = districtStats.filter(d => d.district !== '未设置').length
              
              this.setData({
                'overviewData.totalRecords': totalRecords,
                'overviewData.totalEnterprises': enterpriseSet.size,
                'overviewData.totalDistricts': totalDistricts,
                'overviewData.districtStats': districtStats,
                conclusionStats: conclusionStats
              })
              
              resolve()
            })
        })
        .catch(err => {
          console.error('加载概览数据失败:', err)
          reject(err)
        })
    })
  },

  // 加载到期数据
  loadExpiryData() {
    return new Promise((resolve, reject) => {
      // 构建云函数参数
      const params = {
        name: 'expiryReminder',
        data: {
          action: 'getExpiringSummary',
          days: 30
        }
      }
      
      // 如果是辖区管理员，传递辖区参数
      if (this.data.adminDistrict) {
        params.data.district = this.data.adminDistrict
        console.log('辖区管理员查询到期数据，辖区:', this.data.adminDistrict)
      } else {
        console.log('总管理员查询全部到期数据')
      }
      
      wx.cloud.callFunction({
        ...params,
        success: (res) => {
          if (res.result.success) {
            const summary = res.result.data.summary
            const expiryTotal = (summary.expiredCount || 0) + (summary.expiringCount || 0)
            this.setData({
              expirySummary: summary,
              expiryEnterprises: res.result.data.enterpriseStats,
              'overviewData.expiryTotal': expiryTotal
            })
          }
          resolve()
        },
        fail: (err) => {
          console.error('加载到期数据失败:', err)
          reject(err)
        }
      })
    })
  },

  // 刷新数据
  refreshData() {
    this.loadAllData()
    wx.showToast({ title: '已刷新', icon: 'success' })
  },

  // 跳转到详情页
  goToDetail(e) {
    const type = e.currentTarget.dataset.type
    const name = e.currentTarget.dataset.name
    const district = e.currentTarget.dataset.district
    
    switch (type) {
      case 'all':
        // 跳转到管理端查看全部
        wx.navigateTo({
          url: '/pages/admin/admin?from=dashboard'
        })
        break
      case 'enterprise':
        wx.navigateTo({
          url: '/pages/admin/admin?from=dashboard'
        })
        break
      case 'district':
        wx.navigateTo({
          url: '/pages/admin/admin?from=dashboard'
        })
        break
      case 'expiry':
      case 'expired':
      case 'expiring':
        wx.navigateTo({
          url: `/pages/admin/admin?from=dashboard&filter=${type}`
        })
        break
      case 'qualified':
        // 跳转到管理端查看合格记录
        wx.navigateTo({
          url: '/pages/admin/admin?from=dashboard&conclusion=合格'
        })
        break
      case 'unqualified':
        // 跳转到管理端查看不合格记录
        wx.navigateTo({
          url: '/pages/admin/admin?from=dashboard&conclusion=不合格'
        })
        break
      case 'enterpriseDetail':
        wx.navigateTo({
          url: `/pages/admin/admin?from=dashboard&enterprise=${encodeURIComponent(name)}`
        })
        break
      case 'districtDetail':
        wx.navigateTo({
          url: `/pages/admin/admin?from=dashboard&district=${encodeURIComponent(district)}`
        })
        break
    }
  },

  // 跳转到管理端
  goToAdmin() {
    wx.navigateTo({
      url: '/pages/admin/admin?from=dashboard'
    })
  },

  // 跳转到账号设置页面
  goToAccountSettings() {
    console.log('点击了账号设置')
    wx.navigateTo({
      url: '/pages/account-settings/account-settings',
      success: () => {
        console.log('跳转成功')
      },
      fail: (err) => {
        console.error('跳转失败:', err)
        wx.showToast({ title: '跳转失败', icon: 'none' })
      }
    })
  },

  // 打开OCR识别弹窗
  goToOCR() {
    // 如果是辖区管理员，自动选中辖区
    const adminInfo = wx.getStorageSync('adminUser')
    let districtIndex = 0
    let district = ''
    if (adminInfo && adminInfo.district) {
      const idx = this.data.districtOptions.indexOf(adminInfo.district)
      if (idx > -1) {
        districtIndex = idx
        district = adminInfo.district
      }
    }
    this.setData({ 
      showOcrModal: true,
      ocrDistrictIndex: districtIndex,
      'ocrFormData.district': district
    })
  },

  // 关闭OCR弹窗
  closeOcrModal() {
    this.setData({ 
      showOcrModal: false,
      ocrImagePath: '',
      ocrShowForm: false,
      ocrLoading: false,
      ocrSaving: false
    })
    this.resetOcrForm()
  },

  // 选择图片
  chooseOcrImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({ ocrImagePath: tempFilePath })
      }
    })
  },

  // 重新选择图片
  retakeOcrImage() {
    this.setData({ 
      ocrImagePath: '', 
      ocrShowForm: false 
    })
  },

  // 预览图片
  previewOcrImage() {
    if (this.data.ocrImagePath) {
      wx.previewImage({ urls: [this.data.ocrImagePath] })
    }
  },

  // 开始OCR识别
  startOcrRecognize() {
    if (!this.data.ocrImagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' })
      return
    }

    this.setData({ ocrLoading: true })
    wx.showLoading({ title: '处理图片中...' })

    // 先压缩图片，解决image size error问题
    const that = this
    wx.compressImage({
      src: this.data.ocrImagePath,
      quality: 80,
      compressedWidth: 2000,
      success: function(compressRes) {
        console.log('图片压缩成功')
        that._doAdminOCRUpload(compressRes.tempFilePath)
      },
      fail: function(err) {
        console.log('压缩失败，使用原图')
        that._doAdminOCRUpload(that.data.ocrImagePath)
      }
    })
  },

  // 内部方法：管理员OCR上传
  _doAdminOCRUpload(filePath) {
    const cloudPath = `ocr-temp/admin_${Date.now()}.jpg`
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
            wx.hideLoading()
            this.setData({ ocrLoading: false })
            
            if (res.result && res.result.success && res.result.text) {
              console.log('OCR识别文本:', res.result.text)
              // 解析OCR文本提取字段
              const ocrData = this.parseOcrText(res.result.text)
              this.fillOcrForm(ocrData)
              wx.showToast({ title: '识别成功', icon: 'success' })
            } else {
              this.setData({ ocrShowForm: true })
              wx.showToast({ title: res.result?.error || '识别失败，请手动填写', icon: 'none' })
            }
            // 删除临时文件
            wx.cloud.deleteFile({ fileList: [uploadRes.fileID] })
          },
          fail: (err) => {
            wx.hideLoading()
            this.setData({ ocrLoading: false, ocrShowForm: true })
            console.error('OCR识别失败:', err)
            wx.showToast({ title: '识别失败，请手动填写', icon: 'none' })
            wx.cloud.deleteFile({ fileList: [uploadRes.fileID] })
          }
        })
      },
      fail: (err) => {
        wx.hideLoading()
        this.setData({ ocrLoading: false, ocrShowForm: true })
        console.error('图片上传失败:', err)
        wx.showToast({ title: '上传失败，请手动填写', icon: 'none' })
      }
    })
  },

  // 解析OCR文本提取字段（针对压力表检定证书优化）
  parseOcrText(text) {
    const result = {}
    console.log('原始OCR文本:\n', text)
    
    // 预处理：统一空格和冒号
    const cleanText = text.replace(/\s+/g, ' ').replace(/：/g, ':')
    
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
      // 清理多余字符
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
    // 格式：JJG 52-2013《弹性元件式一般压力表...》
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
      // 备用：匹配 YYYY-MM-DD 或 YYYY/MM/DD 格式
      const dateMatch2 = text.match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/)
      if (dateMatch2) {
        result.verificationDate = `${dateMatch2[1]}-${dateMatch2[2].padStart(2,'0')}-${dateMatch2[3].padStart(2,'0')}`
      }
    }
    
    // ===== 有效期至（可选，用于计算） =====
    const expiryMatch = text.match(/有\s*效\s*期\s*至[：:\s]*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/i)
    if (expiryMatch) {
      const year = expiryMatch[1]
      const month = expiryMatch[2].padStart(2, '0')
      const day = expiryMatch[3].padStart(2, '0')
      result.expiryDate = `${year}-${month}-${day}`
    }
    
    console.log('解析OCR结果:', result)
    return result
  },

  // 用OCR结果填充表单
  fillOcrForm(ocrData) {
    const formData = { ...this.data.ocrFormData }
    
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
        this.setData({ ocrConclusionIndex: index })
      }
    }
    if (ocrData.verificationDate) {
      formData.verificationDate = ocrData.verificationDate
      const expiryDate = this.calculateExpiryDate(ocrData.verificationDate)
      const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
      this.setData({ ocrExpiryDateText: expiryText })
    }

    this.setData({ ocrFormData: formData, ocrShowForm: true })
  },

  // 表单输入
  onOcrInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`ocrFormData.${field}`]: value
    })
  },

  // 检定结论选择
  onOcrConclusionChange(e) {
    const index = e.detail.value
    const conclusions = ['合格', '不合格']
    this.setData({
      ocrConclusionIndex: index,
      'ocrFormData.conclusion': conclusions[index]
    })
  },

  // 检定日期选择
  onOcrDateChange(e) {
    const date = e.detail.value
    const expiryDate = this.calculateExpiryDate(date)
    const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
    this.setData({ 
      'ocrFormData.verificationDate': date, 
      ocrExpiryDateText: expiryText 
    })
  },

  // 辖区选择
  onOcrDistrictChange(e) {
    const index = e.detail.value
    const district = this.data.districtOptions[index]
    this.setData({
      ocrDistrictIndex: index,
      'ocrFormData.district': district
    })
  },

  // 计算到期日期
  calculateExpiryDate(verificationDate) {
    const date = new Date(verificationDate)
    date.setMonth(date.getMonth() + 6)
    date.setDate(date.getDate() - 1) // 检定日期+6个月-1天
    return date
  },

  // 重置表单
  resetOcrForm() {
    this.setData({
      ocrFormData: {
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
      ocrConclusionIndex: 0,
      ocrExpiryDateText: ''
    })
  },

  // 保存OCR记录
  saveOcrRecord() {
    const { ocrFormData, ocrImagePath } = this.data

    if (!ocrFormData.factoryNo.trim()) {
      wx.showToast({ title: '请填写出厂编号', icon: 'none' })
      return
    }
    if (!ocrFormData.verificationDate) {
      wx.showToast({ title: '请选择检定日期', icon: 'none' })
      return
    }
    if (!ocrFormData.district) {
      wx.showToast({ title: '请选择所在辖区', icon: 'none' })
      return
    }

    this.setData({ ocrSaving: true })
    wx.showLoading({ title: '存档中...', mask: true })

    const adminInfo = wx.getStorageSync('adminUser')
    const verifyDate = new Date(ocrFormData.verificationDate)
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1) // 检定日期+6个月-1天

    const mainData = {
      ...ocrFormData,
      expiryDate: this.formatDate(expiryDate),
      status: 'valid',
      createTime: this.formatDateTime(new Date()),
      updateTime: this.formatDateTime(new Date()),
      ocrSource: 'baidu',
      hasImage: !!ocrImagePath,
      // 管理员录入标记
      enterpriseId: 'admin',
      enterpriseName: '管理端录入',
      enterprisePhone: '',
      enterpriseLegalPerson: '',
      createdBy: 'admin',
      adminName: adminInfo ? adminInfo.username : '管理员'
    }

    if (ocrImagePath) {
      const cloudPath = `pressure-certificates/admin_${ocrFormData.factoryNo}_${Date.now()}.jpg`
      wx.cloud.uploadFile({
        cloudPath,
        filePath: ocrImagePath,
        success: (res) => {
          mainData.fileID = res.fileID
          this.saveOcrToDB(mainData)
        },
        fail: (err) => {
          console.error('图片上传失败:', err)
          this.handleOcrFail('图片上传失败')
        }
      })
    } else {
      this.saveOcrToDB(mainData)
    }
  },

  // 保存到数据库
  saveOcrToDB(mainData) {
    db.collection('pressure_records').add({
      data: mainData,
      success: (res) => {
        console.log('✓ 管理端OCR存档成功:', res._id)
        wx.hideLoading()
        wx.showToast({ title: '✓ 存档成功', icon: 'success', duration: 1500 })
        this.setData({ ocrSaving: false })
        // 关闭弹窗并刷新数据
        this.closeOcrModal()
        this.loadAllData()
      },
      fail: (err) => {
        console.error('✗ 保存失败:', err)
        this.handleOcrFail('保存失败')
      }
    })
  },

  // 处理失败
  handleOcrFail(msg) {
    wx.hideLoading()
    this.setData({ ocrSaving: false })
    wx.showToast({ title: msg, icon: 'none', duration: 2000 })
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

  // 下拉刷新
  onPullDownRefresh() {
    console.log('下拉刷新触发')
    this.loadAllData()
    setTimeout(() => {
      wx.stopPullDownRefresh()
      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1500
      })
    }, 1000)
  }
})
