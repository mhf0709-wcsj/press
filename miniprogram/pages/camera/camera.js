

const ocrService = require('../../services/ocr-service')
const aiExtractService = require('../../services/ai-extract-service')
const deviceService = require('../../services/device-service')
const equipmentService = require('../../services/equipment-service')
const expiryReminderService = require('../../services/expiry-reminder-service')
const recordService = require('../../services/record-service')
const formValidator = require('../../utils/form-validator')
const { formatDate, formatDateTime, calculateExpiryDate } = require('../../utils/helpers/date')
const { SUBSCRIBE_TEMPLATE_IDS } = require('../../constants/index')
const debugLog = () => {}

Page({
  data: {
    activeTab: 'ocr',
    imagePath: '',
    installPhotoPath: '',
    saving: false,
    ocrLoading: false,
    aiExtractLoading: false,
    showEditForm: false,
    conclusionIndex: 0,
    expiryDateText: '',
    enterpriseUser: null,
    fromAdmin: false,
    showExpiryModal: false,
    expiryReminder: null,
    districtOptions: ['大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所'],
    districtIndex: 0,
    equipments: [],
    equipmentIndex: -1,
    selectedEquipmentId: '',
    selectedEquipmentName: '',
    aiInsight: null,
    gaugeStatusOptions: ['在用', '备用', '送检', '停用', '报废'],
    gaugeStatusIndex: 0,
    gaugeStatus: '在用',
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
    }
  },

  onLoad(options) {
    debugLog('camera confirm page load')
    if (options && options.tab === 'manual') {
      this.setData({
        activeTab: 'manual',
        showEditForm: true
      })
    }
    this.initPage(options)
  },

  onShow() {
    this.checkFromAdmin()
    if (!this.data.fromAdmin) {
      this.checkExpiryReminder()
    }
    this.loadEquipments().then(() => this.restoreSelectedEquipment())
  },

  

  refreshAiInsight(extractedData = null) {
    const sourceData = extractedData || this.data.formData || {}
    const insight = this.buildAiInsightSafe(sourceData)
    const nextData = { aiInsight: insight }

    if (insight.match && insight.match.autoSelected) {
      nextData.equipmentIndex = insight.match.index
      nextData.selectedEquipmentId = insight.match.id
      nextData.selectedEquipmentName = insight.match.name
    }

    this.setData(nextData)
  },

  buildAiInsightSafe(sourceData = {}) {
    const category = this.inferDeviceCategorySafe(sourceData)
    const match = this.findBestEquipmentMatchSafe(sourceData)
    const confidence = Number(sourceData.confidence || 0)
    const confidenceLabel = confidence >= 0.8 ? '高' : confidence >= 0.55 ? '中' : '待确认'

    return {
      summary: this.buildAiSummarySafe(sourceData, category, match),
      confidence,
      confidenceLabel,
      categoryLabel: category.label,
      categoryReason: category.reason,
      match,
      tags: [
        sourceData.instrumentName || '仪表名称待确认',
        sourceData.modelSpec || '型号规格待补充',
        sourceData.conclusion ? `检定${sourceData.conclusion}` : '结论待确认'
      ].filter(Boolean)
    }
  },

  inferDeviceCategorySafe(sourceData = {}) {
    const instrumentName = String(sourceData.instrumentName || '').toLowerCase()
    const modelSpec = String(sourceData.modelSpec || '').toLowerCase()
    const combined = `${instrumentName} ${modelSpec}`

    if (
      instrumentName.includes('pressure') ||
      instrumentName.includes('gauge') ||
      instrumentName.includes('鍘嬪姏') ||
      instrumentName.includes('表') ||
      combined.includes('mpa') ||
      combined.includes('kpa') ||
      combined.includes('pa')
    ) {
      return {
        label: '压力表',
        reason: 'AI 根据仪表名称和量程信息，判断这是一块压力表'
      }
    }

    return {
      label: '通用仪表',
      reason: 'AI 已读取证书字段，但设备类型还需要你再确认一次'
    }
  },

  buildAiSummarySafe(sourceData = {}, category = {}, match = null) {
    const certNo = sourceData.certNo ? `证书号 ${sourceData.certNo}` : 'AI 已完成证书文本读取'
    const factoryNo = sourceData.factoryNo ? `出厂编号 ${sourceData.factoryNo}` : '出厂编号待确认'
    const categoryText = category?.label ? `识别为 ${category.label}` : '已完成设备识别'

    if (match && match.name) {
      return `${certNo}，${factoryNo}，${categoryText}，并建议归档到“${match.name}”。`
    }

    return `${certNo}，${factoryNo}，${categoryText}，暂未找到明确的归属设备。`
  },

  findBestEquipmentMatchSafe(sourceData = {}) {
    const equipments = this.data.equipments || []
    if (!equipments.length) {
      return {
        status: 'empty',
        statusText: '当前设备库还没有可匹配的设备，AI 暂时不能自动归类',
        score: 0
      }
    }

    const tokens = this.collectMatchTokensSafe(sourceData)
    let best = null

    equipments.forEach((equipment, index) => {
      const haystack = [
        equipment.equipmentName,
        equipment.equipmentNo,
        equipment.location,
        equipment.enterpriseName
      ].filter(Boolean).join(' ').toLowerCase()

      let score = 0
      tokens.forEach((token) => {
        if (token && haystack.includes(token)) score += token.length >= 4 ? 3 : 1
      })

      if (!best || score > best.score) {
        best = {
          id: equipment._id,
          name: equipment.equipmentName,
          index,
          score
        }
      }
    })

    if (!best || best.score <= 0) {
      return {
        status: 'unmatched',
        statusText: 'AI 已完成字段识别，但还需要你确认所属设备',
        score: 0
      }
    }

    const autoSelected = best.score >= 3
    return {
      ...best,
      status: autoSelected ? 'matched' : 'suggested',
      autoSelected,
      statusText: autoSelected
        ? `AI 已自动匹配到设备“${best.name}”`
        : `AI 推荐归到设备“${best.name}”，请你确认`
    }
  },

  collectMatchTokensSafe(sourceData = {}) {
    const rawTokens = [
      sourceData.sendUnit,
      sourceData.instrumentName,
      sourceData.modelSpec,
      sourceData.manufacturer
    ]

    return rawTokens
      .filter(Boolean)
      .map((item) => String(item).trim().toLowerCase())
      .reduce((result, item) => result.concat(item.split(/[\s/(),锛屻€俖-]+/)), [])
      .filter((item) => item && item.length >= 2)
      .slice(0, 12)
  },

  
  async initPage(options) {
    this.checkFromAdmin()
    await ocrService.init()
    this.initManualForm()
    await this.loadEquipments()
    this.restoreSelectedEquipment()
    this.applyAssistantDraft()
  },

  
  checkFromAdmin() {
    const cameraFrom = wx.getStorageSync('cameraFrom')
    if (cameraFrom === 'admin') {
      this.setData({ fromAdmin: true })
      wx.removeStorageSync('cameraFrom')
      this.loadAdminInfo()
    } else if (!this.data.fromAdmin) {
      this.loadEnterpriseInfo()
    }
  },

  
  loadEnterpriseInfo() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser })
  },

  
  loadAdminInfo() {
    const adminUser = wx.getStorageSync('adminUser')
    if (adminUser) {
      this.setData({
        enterpriseUser: {
          companyName: '\u7ba1\u7406\u7aef\u5f55\u5165',
          contact: adminUser.username,
          isAdmin: true,
          district: adminUser.district || null
        }
      })
      
      if (adminUser.district) {
        const districtIndex = this.data.districtOptions.indexOf(adminUser.district)
        if (districtIndex > -1) {
          this.setData({
            districtIndex,
            'formData.district': adminUser.district
          })
        }
      }
    }
  },

  
  async loadEquipments() {
    const { enterpriseUser, fromAdmin } = this.data
    if (!enterpriseUser) return
    
    try {
      const adminUser = wx.getStorageSync('adminUser')
      const equipments = await equipmentService.loadEquipments({
        enterpriseUser,
        fromAdmin,
        district: adminUser?.district
      })
      this.setData({ equipments }, () => {
        if (this.data.aiInsight && this.data.showEditForm) {
          this.refreshAiInsight()
        }
      })
    } catch (err) {
      console.error('load equipment list failed:', err)
    }
  },

  
  async checkExpiryReminder() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    if (!enterpriseUser || !enterpriseUser.companyName) return

    const reminder = await expiryReminderService.checkExpiryReminder(enterpriseUser.companyName, 30)
    
    if (reminder) {
      this.setData({
        showExpiryModal: true,
        expiryReminder: reminder
      })
      expiryReminderService.markTodayReminded()
    }
  },

  
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab === 'manual') {
      this.initManualForm()
    }
  },

  restoreSelectedEquipment() {
    const selected = wx.getStorageSync('selectedEquipmentForNewGauge')
    if (!selected || !selected.id) return
    wx.removeStorageSync('selectedEquipmentForNewGauge')

    const idx = (this.data.equipments || []).findIndex(i => i._id === selected.id)
    this.setData({
      equipmentIndex: idx,
      selectedEquipmentId: selected.id,
      selectedEquipmentName: selected.name || (idx >= 0 ? this.data.equipments[idx]?.equipmentName : '')
    }, () => this.refreshAiInsight())
  },

  applyAssistantDraft() {
    const draft = wx.getStorageSync('aiAssistantRecordDraft')
    if (!draft || !draft.extractedData) return

    wx.removeStorageSync('aiAssistantRecordDraft')

    const formData = { ...this.data.formData }
    const allowedKeys = [
      'certNo',
      'sendUnit',
      'instrumentName',
      'modelSpec',
      'factoryNo',
      'manufacturer',
      'verificationStd',
      'conclusion',
      'verificationDate',
      'district'
    ]

    allowedKeys.forEach((key) => {
      const value = draft.extractedData[key]
      if (value !== undefined && value !== null && value !== '') {
        formData[key] = value
      }
    })

    const nextData = {
      activeTab: 'ocr',
      imagePath: draft.imagePath || '',
      formData,
      showEditForm: true
    }

    if (draft.extractedData.conclusion) {
      const conclusions = ['\u5408\u683c', '\u4e0d\u5408\u683c']
      const conclusionIndex = conclusions.indexOf(draft.extractedData.conclusion)
      if (conclusionIndex > -1) {
        nextData.conclusionIndex = conclusionIndex
      }
    }

    if (draft.extractedData.verificationDate) {
      const expiryDateStr = calculateExpiryDate(draft.extractedData.verificationDate)
      const expiryDate = new Date(expiryDateStr)
      nextData.expiryDateText = formatDate(expiryDate)
    }

    this.setData(nextData, () => {
      this.refreshAiInsight(draft.extractedData)
    })
  },

  
  initManualForm() {
    if (!this.data.formData.verificationDate) {
      const today = formatDate(new Date())
      const expiryDateStr = calculateExpiryDate(today)
      const expiryDate = new Date(expiryDateStr)
      const expiryText = formatDate(expiryDate)
      this.setData({
        'formData.verificationDate': today,
        expiryDateText: expiryText
      })
    }
  },

  
  async takePhoto() {
    try {
      const imagePath = await ocrService.chooseImage()
      this.setData({ imagePath })
    } catch (err) {
      console.error('choose image failed:', err)
    }
  },

  
  retakePhoto() {
    this.setData({
      imagePath: '',
      showEditForm: false,
      qualityScore: 0,
      aiExtractLoading: false,
      aiInsight: null
    })
  },

  
  async startOCR() {
    return this.startAIExtract()
  },

  async startAIExtract() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '\u8bf7\u5148\u4e0a\u4f20\u56fe\u7247', icon: 'none' })
      return
    }

    const userType = this.data.fromAdmin ? 'admin' : 'enterprise'
    const userInfo = this.data.fromAdmin
      ? (wx.getStorageSync('adminUser') || null)
      : (this.data.enterpriseUser || wx.getStorageSync('enterpriseUser') || null)

    this.setData({ aiExtractLoading: true })
    wx.showLoading({ title: 'AI 管家分析中...', mask: true })

    try {
      const aiData = await aiExtractService.extractFromImage(this.data.imagePath, {
        userType,
        userInfo
      })
      this.fillFormWithAI({
        ...aiData,
        ocrSource: 'ai_extract'
      })
      wx.showToast({ title: 'AI 分析完成', icon: 'success' })
    } catch (err) {
      console.error('AI extract failed:', err)
      wx.showToast({ title: err.message || 'AI 分析失败', icon: 'none', duration: 3000 })
    } finally {
      wx.hideLoading()
      this.setData({ aiExtractLoading: false })
    }
  },

  
  fillFormWithAI(ocrData) {
    const formData = { ...this.data.formData }

    Object.keys(ocrData).forEach(key => {
      if (ocrData[key] !== undefined && ocrData[key] !== null && ocrData[key] !== '') {
        formData[key] = ocrData[key]
      }
    })

    if (ocrData.conclusion) {
      const conclusions = ['\u5408\u683c', '\u4e0d\u5408\u683c']
      const index = conclusions.indexOf(ocrData.conclusion)
      if (index > -1) {
        this.setData({ conclusionIndex: index })
      }
    }

    if (ocrData.verificationDate) {
      const expiryDateStr = calculateExpiryDate(ocrData.verificationDate)
      const expiryDate = new Date(expiryDateStr)
      const expiryText = formatDate(expiryDate)
      this.setData({ expiryDateText: expiryText })
    }

    this.setData({ formData, showEditForm: true }, () => {
      this.refreshAiInsight(ocrData)
    })
  },

  
  async uploadImage() {
    try {
      const imagePath = await ocrService.chooseImage()
      this.setData({ imagePath })
    } catch (err) {
      console.error('upload image failed:', err)
    }
  },

  
  async uploadInstallPhoto() {
    try {
      const installPhotoPath = await ocrService.chooseImage()
      this.setData({ installPhotoPath })
    } catch (err) {
      console.error('upload install photo failed:', err)
    }
  },

  
  previewImage() {
    if (this.data.imagePath) {
      wx.previewImage({ urls: [this.data.imagePath] })
    }
  },

  
  deleteImage() {
    this.setData({ imagePath: '' })
  },

  
  previewInstallPhoto() {
    if (this.data.installPhotoPath) {
      wx.previewImage({ urls: [this.data.installPhotoPath] })
    }
  },

  
  deleteInstallPhoto() {
    this.setData({ installPhotoPath: '' })
  },

  
  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`formData.${field}`]: value }, () => {
      if (this.data.showEditForm && this.data.aiInsight) {
        this.refreshAiInsight()
      }
    })
  },

  
  onDistrictChange(e) {
    const index = e.detail.value
    const district = this.data.districtOptions[index]
    this.setData({
      districtIndex: index,
      'formData.district': district
    })
  },

  
  onConclusionChange(e) {
    const index = e.detail.value
    const conclusions = ['\u5408\u683c', '\u4e0d\u5408\u683c']
    this.setData({
      conclusionIndex: index,
      'formData.conclusion': conclusions[index]
    })
  },

  
  onDateChange(e) {
    const date = e.detail.value
    const expiryDateStr = calculateExpiryDate(date)
    const expiryDate = new Date(expiryDateStr)
    const expiryText = formatDate(expiryDate)
    this.setData({
      'formData.verificationDate': date,
      expiryDateText: expiryText
    })
  },

  
  onEquipmentChange(e) {
    const index = e.detail.value
    const equipment = this.data.equipments[index]
    if (equipment) {
      this.setData({
        equipmentIndex: index,
        selectedEquipmentId: equipment._id,
        selectedEquipmentName: equipment.equipmentName
      }, () => this.refreshAiInsight())
    }
  },

  onGaugeStatusChange(e) {
    const index = Number(e.detail.value || 0)
    const status = this.data.gaugeStatusOptions[index] || '在用'
    this.setData({ gaugeStatusIndex: index, gaugeStatus: status })
  },

  goToEquipmentLibrary() {
    wx.navigateTo({ url: '/pages/archive/archive' })
  },

  
  goBack() {
    wx.navigateBack()
  },

  
  onNewDeviceInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`newDevice.${field}`]: value })
  },

  
  async ensureGaugeForRecord({ equipmentId, equipmentName, enterpriseUser, fromAdmin, district, recordData }) {
    const factoryNo = (recordData?.factoryNo || '').trim()
    if (!factoryNo) throw new Error('缺少出厂编号，无法生成压力表档案')
    const wantedStatus = this.data.gaugeStatus || '在用'

    const db = wx.cloud.database()
    const existed = await db.collection('devices')
      .where({ equipmentId, factoryNo })
      .limit(1)
      .get()

    if (existed.data && existed.data[0]) {
      const gauge = existed.data[0]
      if (wantedStatus && gauge.status !== wantedStatus) {
        try {
          await db.collection('devices').doc(gauge._id).update({ data: { status: wantedStatus } })
          gauge.status = wantedStatus
        } catch (e) {}
      }
      return gauge
    }

    const deviceName = recordData.instrumentName || '压力表'
    const device = await deviceService.createDevice({
      deviceName,
      factoryNo,
      manufacturer: recordData.manufacturer || '',
      modelSpec: recordData.modelSpec || '',
      equipmentId,
      equipmentName,
      status: wantedStatus
    }, {
      enterpriseUser,
      fromAdmin,
      district
    })

    return device
  },

  
  async saveRecord() {
    const { formData, imagePath, installPhotoPath, activeTab, fromAdmin, enterpriseUser, selectedEquipmentId, selectedEquipmentName, gaugeStatus } = this.data

    const userValidation = formValidator.validateUserLogin(enterpriseUser)
    if (!userValidation.valid) {
      wx.showToast({ title: userValidation.error, icon: 'none' })
      return
    }

    const imageValidation = formValidator.validateImageUpload(imagePath, installPhotoPath, activeTab, gaugeStatus)
    if (!imageValidation.valid) {
      wx.showToast({ title: imageValidation.errors[0], icon: 'none' })
      return
    }

    const formValidation = formValidator.validateRecordForm(formData)
    if (!formValidation.valid) {
      wx.showToast({ title: formValidation.errors[0], icon: 'none' })
      return
    }

    if ((formData.conclusion || '').trim() !== '合格') {
      wx.showToast({ title: '\u4ec5\u652f\u6301\u68c0\u5b9a\u5408\u683c\u7684\u538b\u529b\u8868\u751f\u6210\u538b\u529b\u8868\u7801', icon: 'none' })
      return
    }

    if (!selectedEquipmentId) {
      wx.showToast({ title: '请先选择所属设备', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '存档中...', mask: true })

    try {
      const equipmentId = selectedEquipmentId
      const adminUser = wx.getStorageSync('adminUser') || {}
      const district = formData.district || adminUser?.district || ''
      const gauge = await this.ensureGaugeForRecord({
        equipmentId: selectedEquipmentId,
        equipmentName: selectedEquipmentName,
        enterpriseUser,
        fromAdmin,
        district,
        recordData: formData
      })

      const result = await recordService.saveRecord(formData, {
        imagePath,
        installPhotoPath,
        fromAdmin,
        enterpriseUser,
        selectedDeviceId: gauge._id
      })

      await deviceService.updateRecordCount(gauge._id)

      wx.hideLoading()
      wx.showToast({ title: '存档成功', icon: 'success', duration: 1500 })
      this.resetForm()

      if (!fromAdmin) {
        this.requestSubscribeMessage()
      }

      await this.generateGaugeQRCodeIfNeeded(gauge._id, gauge.qrCodeImage)

      if (fromAdmin) {
        wx.navigateBack()
        return
      }

      wx.navigateTo({
        url: `/pages/equipment-detail/equipment-detail?id=${equipmentId}&highlightGaugeId=${gauge._id}`
      })
    } catch (err) {
      console.error('save record failed:', err)
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showToast({ title: err?.message || '保存失败', icon: 'none', duration: 2000 })
    }
  },

  async generateGaugeQRCodeIfNeeded(deviceId, qrCodeImage) {
    if (qrCodeImage) return qrCodeImage
    try {
      const res = await wx.cloud.callFunction({
        name: 'generateQRCode',
        data: {
          deviceId,
          page: 'pages/device-detail/device-detail'
        }
      })

      return res.result?.success ? (res.result.fileID || '') : ''
    } catch (e) {
      return ''
    }
  },

  
  async requestSubscribeMessage() {
    const appConfig = wx.getStorageSync('appConfig') || {}
    const tmplId = appConfig.deviceExpiryTemplateId || SUBSCRIBE_TEMPLATE_IDS.DEVICE_EXPIRY
    if (!tmplId) {
      const enterpriseUser = wx.getStorageSync('enterpriseUser')
      if (enterpriseUser) {
        await expiryReminderService.saveAlertSettings(enterpriseUser, {
          alertEnabled: true,
          channels: {
            wxSubscribe: false,
            inApp: true,
            sms: false
          },
          strategy: {
            dailyDigestEnabled: true,
            expiredEnabled: true,
            expiringDays: [30]
          }
        })
      }
      return
    }
    const templateIds = [tmplId]

    try {
      const res = await expiryReminderService.requestSubscribeMessage(templateIds)
      if (res[templateIds[0]] === 'accept') {
        const enterpriseUser = wx.getStorageSync('enterpriseUser')
        if (enterpriseUser) {
          await expiryReminderService.confirmWxSubscription(enterpriseUser, templateIds[0])
          await expiryReminderService.saveAlertSettings(enterpriseUser, {
            alertEnabled: true,
            channels: {
              wxSubscribe: true,
              inApp: true,
              sms: false
            },
            strategy: {
              dailyDigestEnabled: true,
              expiredEnabled: true,
              expiringDays: [30]
            }
          })
        }
      }
    } catch (err) {
      debugLog('subscribe message auth failed', err)
    }
  },

  
  resetForm() {
    this.setData({
      imagePath: '',
      installPhotoPath: '',
      saving: false,
      showEditForm: false,
      expiryDateText: '',
      qualityScore: 0,
      aiExtractLoading: false,
      aiInsight: null,
      equipmentIndex: -1,
      selectedEquipmentId: '',
      selectedEquipmentName: '',
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
      gaugeStatusIndex: 0,
      gaugeStatus: '在用',
      conclusionIndex: 0,
      districtIndex: 0
    })

    if (this.data.activeTab === 'manual') {
      this.initManualForm()
    }
  },

  
  closeExpiryModal() {
    this.setData({ showExpiryModal: false })
    expiryReminderService.markTodayReminded()
  },

  
  viewExpiryRecords() {
    this.setData({ showExpiryModal: false })
    expiryReminderService.markTodayReminded()
    wx.navigateTo({ url: '/pages/archive/archive' })
  }
})


