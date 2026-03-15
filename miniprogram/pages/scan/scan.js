const db = wx.cloud.database()
const baiduOCRUtil = require('../utils/baiduOCR.js')

Page({
   data:{
    imagePath: '',
    saving: false,
    records: [],
    ocrLoading: false,
    showEditForm: false,
    accessToken: '',
    conclusionIndex: 0,
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
      verificationDate: ''
    }
  },

  onLoad(options) {
    console.log('=== 压力表检定智能体启动 ===')
    
    // 检查是否为编辑模式
    if (options.editId) {
      this.loadRecordForEdit(options.editId)
    } else {
      this.loadRecords()
      this.initOCRService()
    }
  },

  loadRecordForEdit(recordId) {
    wx.showLoading({ title: '加载记录...' })
    db.collection('pressure_records').doc(recordId).get()
      .then(res => {
        wx.hideLoading()
        if (res.data) {
          const record = res.data
          this.setData({
            showEditForm: true,
            formData: {
              certNo: record.certNo || '',
              sendUnit: record.sendUnit || '',
              instrumentName: record.instrumentName || '压力表',
              modelSpec: record.modelSpec || '',
              factoryNo: record.factoryNo || '',
              manufacturer: record.manufacturer || '',
              verificationStd: record.verificationStd || 'JJG52-2013',
              conclusion: record.conclusion || '合格',
              verificationDate: record.verificationDate || ''
            },
            expiryDateText: record.expiryDate ? 
              `${new Date(record.expiryDate).getFullYear()}年${new Date(record.expiryDate).getMonth()+1}月${new Date(record.expiryDate).getDate()}日` : 
              '',
            imagePath: record.fileID || '',
            qualityScore: 1 // 编辑模式默认质量满分
          })
          
          // 设置结论索引
          let conclusionIndex = 0
          if (record.conclusion === '不合格') conclusionIndex = 1
          else if (record.conclusion === '准用') conclusionIndex = 1
          this.setData({ conclusionIndex: conclusionIndex })
        }
      })
      .catch(err => {
        wx.hideLoading()
        console.error('加载编辑记录失败:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 2000)
      })
  },

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

  refreshToken() {
    baiduOCRUtil.getAccessToken()
      .then(token => {
        const expireTime = Date.now() + 25 * 24 * 60 * 60 * 1000
        wx.setStorage({
          key: 'baidu_access_token',
           data:{ token, expireTime },
          success: () => {
            this.setData({ accessToken: token })
            wx.hideLoading()
            wx.showToast({ title: 'OCR服务就绪', icon: 'success', duration: 1000 })
          }
        })
      })
      .catch(err => {
        wx.hideLoading()
        console.error('✗ Token获取失败:', err)
        wx.showModal({
          title: 'OCR初始化失败',
          content: '原因：' + err + '\n\n请检查：\n1. utils/baiduOCR.js中的API密钥是否正确\n2. 是否开启"不校验合法域名"\n3. 网络连接是否正常',
          showCancel: false
        })
      })
  },

  takePhoto() {
    wx.chooseImage({
      count: 1,
      sizeType: ['original', 'compressed'],
      sourceType: ['camera'],
      success: (res) => {
        if (!res.tempFilePaths || res.tempFilePaths.length === 0) {
          wx.showToast({ title: '未获取到图片', icon: 'none' })
          return
        }
        
        const imagePath = res.tempFilePaths[0]
        
        this.detectImageQuality(imagePath)
          .then(qualityScore => {
            this.setData({ qualityScore: qualityScore })
            if (qualityScore >= 0.4) {
              this.setData({ imagePath: imagePath, showEditForm: false })
              wx.showToast({ title: '✓ 拍摄成功', icon: 'success', duration: 1000 })
            } else {
              this.setData({ imagePath: imagePath, showEditForm: false })
              wx.showToast({ title: '图片质量较低，建议重新拍摄', icon: 'none', duration: 2500 })
            }
          })
      },
      fail: (err) => {
        console.log('✗ 拍照失败:', err)
        wx.showToast({ title: '拍摄取消', icon: 'none', duration: 1500 })
      }
    })
  },

  detectImageQuality(imagePath) {
    return new Promise((resolve) => {
      wx.getFileSystemManager().readFile({
        filePath: imagePath,
        success: (res) => {
          const fileSize = res.fileSize
          let qualityScore = 0.6
          if (fileSize >= 50 * 1024 && fileSize <= 5 * 1024 * 1024) {
            qualityScore += 0.3
          } else if (fileSize >= 30 * 1024 && fileSize <= 8 * 1024 * 1024) {
            qualityScore += 0.1
          }
          qualityScore = Math.min(1, Math.max(0, qualityScore))
          console.log('图片质量评分:', qualityScore.toFixed(2), '文件大小:', (fileSize/1024).toFixed(1) + 'KB')
          resolve(qualityScore)
        },
        fail: () => {
          resolve(0.6)
        }
      })
    })
  },

  deleteImage() {
    this.setData({ imagePath: '' })
  },

  retakePhoto() {
    this.setData({ imagePath: '', showEditForm: false, qualityScore: 0 })
  },

  // ========== 核心：OCR识别（云存储方案） ==========
  startOCR() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先拍摄照片', icon: 'none' })
      return
    }

    this.setData({ ocrLoading: true })
    wx.showLoading({ title: '智能识别中...', mask: true })

    // 1. 上传图片到云存储
    const cloudPath = `ocr-temp/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: this.data.imagePath,
      success: (uploadRes) => {
        console.log('✓ 图片上传成功:', uploadRes.fileID)
        
        // 2. 调用云函数（只传文件ID）
        wx.cloud.callFunction({
          name: 'baiduOcr',
           data:{ fileID: uploadRes.fileID },
          success: (callRes) => {
            console.log('OCR结果:', callRes.result)
            if (callRes.result.success) {
              this.handleOCRResult(callRes.result)
            } else {
              this.ocrFailHandler('识别失败：' + (callRes.result.error || '未知错误'))
            }
          },
          fail: (err) => {
            console.error('云函数调用失败:', err)
            let errorMsg = '网络错误，请重试'
            if (err.errCode === -504002) {
              errorMsg = '云函数执行失败'
            } else if (err.errCode === -501000) {
              errorMsg = '云函数未找到，请检查环境配置'
            } else if (err.errMsg && err.errMsg.includes('data exceed max size')) {
              errorMsg = '图片过大，请重新拍摄'
            }
            this.ocrFailHandler(errorMsg)
          },
          complete: () => {
            wx.hideLoading()
            this.setData({ ocrLoading: false })
            
            // 3. 清理临时文件
            wx.cloud.deleteFile({
              fileList: [cloudPath],
              success: () => console.log('✓ 临时文件已清理'),
              fail: () => console.log('⚠ 临时文件清理失败')
            })
          }
        })
      },
      fail: (err) => {
        console.error('图片上传失败:', err)
        wx.hideLoading()
        this.setData({ ocrLoading: false })
        wx.showToast({ title: '图片上传失败', icon: 'none' })
      }
    })
  },

  handleOCRResult(result) {
    if (!result.success || !result.text) {
      this.ocrFailHandler('未识别到有效文字')
      return
    }

    console.log('✓ 开始提取字段')
    const extractedData = this.extractFieldsFromText(result.text)
    console.log('✓ 提取结果:', extractedData)
    
    if (!extractedData.verificationDate) {
      extractedData.verificationDate = this.formatDate(new Date())
    }

    const expiryDate = this.calculateExpiryDate(extractedData.verificationDate)
    const expiryDateText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`

    let conclusionIndex = 0
    if (extractedData.conclusion === '不合格') conclusionIndex = 1
    else if (extractedData.conclusion === '准用') conclusionIndex = 1

    // ===== 核心：确保状态更新 =====
    console.log('✓ 准备更新页面状态: showEditForm = true')
    this.setData({
      formData: { ...this.data.formData, ...extractedData },
      conclusionIndex: conclusionIndex,
      expiryDateText: expiryDateText,
      showEditForm: true
    })
    console.log('✓ 状态更新完成，showEditForm =', this.data.showEditForm)
    // ===================================

    wx.showToast({
      title: `✓ 识别成功（${this.countFilledFields(extractedData)}/8项）`,
      icon: 'success',
      duration: 2000
    })
  },

  ocrFailHandler(msg) {
    wx.hideLoading()
    this.setData({ ocrLoading: false })
    
    wx.showToast({
      title: msg,
      icon: 'none',
      duration: 3000
    })
    
    console.error('OCR失败:', msg)
    
    // 3秒后进入手动输入模式
    setTimeout(() => this.enterManualInput(), 3000)
  },

  enterManualInput() {
    if (!this.data.imagePath) return
    if (!this.data.formData.verificationDate) {
      const today = new Date()
      const dateStr = this.formatDate(today)
      const expiryDate = this.calculateExpiryDate(dateStr)
      const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
      this.setData({ 'formData.verificationDate': dateStr, expiryDateText: expiryText })
    }
    this.setData({ showEditForm: true })
  },

  calculateExpiryDate(verifyDateStr) {
    const date = new Date(verifyDateStr)
    date.setMonth(date.getMonth() + 6)
    date.setDate(date.getDate() - 1) // 检定日期+6个月-1天
    return date
  },

  extractFieldsFromText(text) {
  const result = {}
  console.log('OCR原始文本:\n', text)
  
  // 步骤1：清理文本 - 合并被分割的词语
  let cleanText = text
    .replace(/\n/g, ' ')           // 所有换行替换为空格
    .replace(/\s+/g, ' ')          // 多个空格合并为一个
    .replace(/送\s+检\s+单\s+位/g, '送检单位')
    .replace(/制\s+造\s+单\s+位/g, '制造单位')
    .replace(/出\s+编\s+号/g, '出厂编号')
    .replace(/型\s+号\/规\s+格/g, '型号/规格')
    .replace(/检\s+定依\s+据/g, '检定依据')
    .replace(/检\s+定结\s+论/g, '检定结论')
    .replace(/检\s+定日\s+期/g, '检定日期')
    .replace(/有效\s+期\s+至/g, '有效期至')
    .trim()

  console.log('清理后文本:', cleanText)

  // 步骤2：按字段精确提取
  const lines = cleanText.split(' ').filter(line => line.trim())
  
  // 1. 证书编号：格式 "证书编号：P2601008"
  const certNoMatch = cleanText.match(/证书编号[:：]\s*([A-Z0-9]+)/)
  if (certNoMatch) {
    result.certNo = certNoMatch[1].trim()
  } else {
    // 尝试从文本中查找 P 开头的编号
    const pNumber = cleanText.match(/P\d+/)
    if (pNumber) result.certNo = pNumber[0]
  }

  // 2. 送检单位：格式 "送检单位 温州燃气集团文成有限公司"
  const sendUnitMatch = cleanText.match(/送检单位\s+([^\s]+(?:\s+[^\s]+)*)(?=\s+计量器具名称|$)/)
  if (sendUnitMatch) {
    result.sendUnit = sendUnitMatch[1].trim()
  } else {
    // 尝试模糊匹配
    const sendUnitLine = cleanText.split(' ').find((line, i) => 
      line.includes('温州') || line.includes('燃气') || line.includes('集团')
    )
    if (sendUnitLine) {
      result.sendUnit = sendUnitLine
    }
  }

  // 3. 计量器具名称：格式 "计量器具名称 压力表"
  const instrumentMatch = cleanText.match(/计量器具名称\s+([^\s]+)/)
  if (instrumentMatch) {
    result.instrumentName = instrumentMatch[1].trim()
  } else {
    // 尝试查找"压力表"
    if (cleanText.includes('压力表')) {
      result.instrumentName = '压力表'
    }
  }

  // 4. 型号/规格：格式 "型号/规格 (0-0.6)MPa"
  const modelMatch = cleanText.match(/型号\/规格\s+([^\s]+)/)
  if (modelMatch) {
    result.modelSpec = modelMatch[1].trim()
  } else {
    // 尝试查找 MPa
    const mpMatch = cleanText.match(/\(\d+[-\.]\d+\)\s*MPa/)
    if (mpMatch) {
      result.modelSpec = mpMatch[0]
    }
  }

  // 5. 制造单位：格式 "制造单位 安微天康（集团）股份有限公司"
  const manufacturerMatch = cleanText.match(/制造单位\s+([^\s]+(?:\s+[^\s]+)*)(?=\s+出厂编号|$)/)
  if (manufacturerMatch) {
    result.manufacturer = manufacturerMatch[1].trim()
  } else {
    // 尝试查找"天康"
    const tiankang = cleanText.match(/天康[^，。]*股份有限公司/)
    if (tiankang) {
      result.manufacturer = tiankang[0]
    }
  }

  // 6. 出厂编号：格式 "出厂编号 24013931"
  const factoryMatch = cleanText.match(/出厂编号\s+(\d+)/)
  if (factoryMatch) {
    result.factoryNo = factoryMatch[1].trim()
  } else {
    // 尝试查找纯数字编号
    const numMatch = cleanText.match(/\d{6,8}/)
    if (numMatch) {
      result.factoryNo = numMatch[0]
    }
  }

  // 7. 检定依据：格式 "JJG52-2013" + "弹性元件式..."
  const stdMatch1 = cleanText.match(/JJG\s*\d+-\d+/)
  if (stdMatch1) {
    result.verificationStd = stdMatch1[0].trim()
  } else {
    // 尝试其他标准格式
    const stdMatch2 = cleanText.match(/JJG[\d\-]+/)
    if (stdMatch2) result.verificationStd = stdMatch2[0]
  }

  // 8. 检定结论：格式 "检定结论 该压力表合格"
  const conclusionMatch = cleanText.match(/检定结论\s+.*?(合格|不合格)/)
  if (conclusionMatch) {
    result.conclusion = conclusionMatch[1].trim()
  } else {
    // 直接搜索关键词
    if (cleanText.includes('合格')) result.conclusion = '合格'
    else if (cleanText.includes('不合格')) result.conclusion = '不合格'
    else if (cleanText.includes('准用')) result.conclusion = '不合格'
  }

  // 9. 检定日期：格式 "检定日期 2026年1月12日"
  const dateMatch = cleanText.match(/检定日期\s+(\d{4}年\d{1,2}月\d{1,2}日)/)
  if (dateMatch) {
    const dateStr = dateMatch[1]
    // 转换为标准格式
    const year = dateStr.match(/(\d{4})年/)[1]
    const month = dateStr.match(/年(\d{1,2})月/)[1].padStart(2, '0')
    const day = dateStr.match(/月(\d{1,2})日/)[1].padStart(2, '0')
    result.verificationDate = `${year}-${month}-${day}`
  } else {
    // 尝试其他日期格式
    const simpleDate = cleanText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (simpleDate) {
      result.verificationDate = `${simpleDate[1]}-${simpleDate[2].padStart(2,'0')}-${simpleDate[3].padStart(2,'0')}`
    }
  }

  // 10. 有效期至：格式 "有效期至 2026年7月11日"
  const expiryMatch = cleanText.match(/有效期至\s+(\d{4}年\d{1,2}月\d{1,2}日)/)
  if (expiryMatch) {
    this.setData({
      expiryDateText: expiryMatch[1].trim()
    })
  }

  // 设置默认值
  result.instrumentName = result.instrumentName || ''
  result.verificationStd = result.verificationStd || ''
  result.conclusion = result.conclusion || ''
  
  return result
},

  countFilledFields(data) {
    const fields = ['certNo', 'sendUnit', 'factoryNo', 'conclusion', 'verificationDate']
    return fields.filter(f => (data[f] || this.data.formData[f])?.trim()).length
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`formData.${field}`]: value })
    if (field === 'verificationDate' && value) {
      const expiryDate = this.calculateExpiryDate(value)
      const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
      this.setData({ expiryDateText: expiryText })
    }
  },

  onConclusionChange(e) {
    const conclusions = ['合格', '不合格']
    const index = e.detail.value
    this.setData({ conclusionIndex: index, 'formData.conclusion': conclusions[index] })
  },

  onDateChange(e) {
    const dateStr = e.detail.value
    this.setData({ 'formData.verificationDate': dateStr })
    const expiryDate = this.calculateExpiryDate(dateStr)
    const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
    this.setData({ expiryDateText: expiryText })
  },

  saveRecord() {
    const { formData, imagePath } = this.data
    
    // 获取页面参数（检查是否为编辑模式）
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    const editId = currentPage.options?.editId
    
    if (!formData.factoryNo.trim()) {
      wx.showToast({ title: '请填写出厂编号', icon: 'none' })
      return
    }
    if (!formData.verificationDate) {
      wx.showToast({ title: '请选择检定日期', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: editId ? '更新中...' : '存档中...', mask: true })

    const verifyDate = new Date(formData.verificationDate)
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1) // 检定日期+6个月-1天

    const mainData = {
      ...formData,
      expiryDate: this.formatDate(expiryDate),
      status: 'valid',
      updateTime: this.formatDateTime(new Date()),
      ocrSource: editId ? 'manual' : 'baidu', // 编辑模式标记为手动
      hasImage: !!imagePath
    }

    if (imagePath && !imagePath.startsWith('cloud://')) {
      // 新上传图片
      const cloudPath = `pressure-certificates/${formData.factoryNo}_${Date.now()}.jpg`
      wx.cloud.uploadFile({
        cloudPath,
        filePath: imagePath,
        success: (res) => {
          mainData.fileID = res.fileID
          if (editId) {
            this.updateRecord(editId, mainData)
          } else {
            this.saveToDB(mainData)
          }
        },
        fail: (err) => {
          console.error('图片上传失败:', err)
          this.handleFail('图片上传失败')
        }
      })
    } else {
      // 使用现有图片或无图片
      if (imagePath && imagePath.startsWith('cloud://')) {
        mainData.fileID = imagePath
      }
      if (editId) {
        this.updateRecord(editId, mainData)
      } else {
        this.saveToDB(mainData)
      }
    }
  },

  // 更新记录方法
  updateRecord(recordId, data) {
    db.collection('pressure_records').doc(recordId).update({
       data:{ ...data }
    })
    .then(res => {
      console.log('✓ 更新成功:', recordId)
      wx.hideLoading()
      wx.showToast({ title: '✓ 更新成功', icon: 'success', duration: 1500 })
      this.resetForm()
      // 返回并刷新列表
      const pages = getCurrentPages()
      if (pages.length > 1) {
        const prevPage = pages[pages.length - 2]
        if (prevPage && prevPage.loadRecords) {
          prevPage.loadRecords()
        }
      }
      setTimeout(() => wx.navigateBack(), 1500)
    })
    .catch(err => {
      console.error('✗ 更新失败:', err)
      this.handleFail('更新失败')
    })
  },

  saveToDB(mainData) {
    db.collection('pressure_records').add({
       data:{ mainData },
      success: (res) => {
        console.log('✓ 存档成功:', res._id)
        wx.hideLoading()
        wx.showToast({ title: '✓ 存档成功', icon: 'success', duration: 1500 })
        this.resetForm()
        this.loadRecords()
      },
      fail: (err) => {
        console.error('✗ 保存失败:', err)
        this.handleFail('保存失败')
      }
    })
  },

  resetForm() {
    this.setData({
      imagePath: '',
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
        verificationDate: ''
      },
      conclusionIndex: 0
    })
  },

  loadRecords() {
    db.collection('pressure_records')
      .orderBy('createTime', 'desc')
      .limit(10)
      .get()
      .then(res => {
        this.setData({ records: res.data })
      })
      .catch(err => {
        console.error('加载失败:', err)
      })
  },

  previewImage() {
    if (this.data.imagePath) {
      wx.previewImage({ urls: [this.data.imagePath] })
    }
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  formatDate(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`
  },

  formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${this.formatDate(date)} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`
  },

  handleFail(msg) {
    wx.hideLoading()
    this.setData({ saving: false })
    wx.showToast({ title: msg, icon: 'none', duration: 2000 })
  }
})