/**
 * 压力表检定数据填报页面（重构版）
 * 采用模块化架构，职责清晰，易于维护
 */

const ocrService = require('../../services/ocr-service')
const aiExtractService = require('../../services/ai-extract-service')
const deviceService = require('../../services/device-service')
const equipmentService = require('../../services/equipment-service')
const expiryReminderService = require('../../services/expiry-reminder-service')
const recordService = require('../../services/record-service')
const formValidator = require('../../utils/form-validator')
const { formatDate, formatDateTime, calculateExpiryDate } = require('../../utils/helpers/date')
const { SUBSCRIBE_TEMPLATE_IDS } = require('../../constants/index')

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
    console.log('=== 数据填报页面启动 ===')
    if (options && options.tab === 'manual') {
      this.setData({ activeTab: 'manual' })
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

  /*
  refreshAiInsight(extractedData = null) {
    const sourceData = extractedData || this.data.formData || {}
    const insight = this.buildAiInsight(sourceData)
    const nextData = { aiInsight: insight }

    if (insight.match && insight.match.autoSelected) {
      nextData.equipmentIndex = insight.match.index
      nextData.selectedEquipmentId = insight.match.id
      nextData.selectedEquipmentName = insight.match.name
    }

    this.setData(nextData)
  },

  buildAiInsight(sourceData = {}) {
    const category = this.inferDeviceCategory(sourceData)
    const match = this.findBestEquipmentMatch(sourceData)
    const confidence = Number(sourceData.confidence || 0)
    const confidenceLabel = confidence >= 0.8 ? '高' : confidence >= 0.55 ? '中' : '待确认'

    return {
      summary: this.buildAiSummary(sourceData, category, match),
      confidence,
      confidenceLabel,
      categoryLabel: category.label,
      categoryReason: category.reason,
      match,
      tags: [
        sourceData.instrumentName || '未识别仪表名称',
        sourceData.modelSpec || '型号待补充',
        sourceData.conclusion ? `检定${sourceData.conclusion}` : '结论待确认'
      ].filter(Boolean)
    }
  },

  inferDeviceCategory(sourceData = {}) {
    const instrumentName = String(sourceData.instrumentName || '')
    const modelSpec = String(sourceData.modelSpec || '')
    const combined = `${instrumentName} ${modelSpec}`.toLowerCase()

    if (combined.includes('压力') || combined.includes('压') || combined.includes('mpa') || combined.includes('kpa')) {
      return {
        label: '压力表',
        reason: 'AI 根据仪表名称和量程信息判断为压力表类设备'
      }
    }

    return {
      label: '通用仪表',
      reason: 'AI 已读取证书字段，但设备类型还需要人工确认'
    }
  },

  buildAiSummary(sourceData = {}, category = {}, match = null) {
    const certNo = sourceData.certNo ? `证书号 ${sourceData.certNo}` : '已读取证书文本'
    const factoryNo = sourceData.factoryNo ? `出厂编号 ${sourceData.factoryNo}` : '出厂编号待确认'
    const categoryText = category?.label ? `识别为${category.label}` : '已完成设备识别'

    if (match && match.name) {
      return `${certNo}，${factoryNo}，${categoryText}，并建议归档到“${match.name}”。`
    }

    return `${certNo}，${factoryNo}，${categoryText}，暂未找到明确的设备归属。`
  },

  findBestEquipmentMatch(sourceData = {}) {
    const equipments = this.data.equipments || []
    if (!equipments.length) {
      return {
        status: 'empty',
        statusText: '当前设备库为空，AI 暂时无法自动归类',
        score: 0
      }
    }

    const tokens = this.collectMatchTokens(sourceData)
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
        statusText: 'AI 已完成字段识别，但需要你确认所属设备',
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
        : `AI 推荐设备“${best.name}”，请确认是否正确`
    }
  },

  collectMatchTokens(sourceData = {}) {
    const rawTokens = [
      sourceData.sendUnit,
      sourceData.instrumentName,
      sourceData.modelSpec,
      sourceData.manufacturer
    ]

    return rawTokens
      .filter(Boolean)
      .map((item) => String(item).trim().toLowerCase())
      .reduce((result, item) => result.concat(item.split(/[\s/(),，。_-]+/)), [])
      .filter((item) => item && item.length >= 2)
      .slice(0, 12)
  },

  */

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
      instrumentName.includes('压力') ||
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
    const categoryText = category?.label ? `识别为${category.label}` : '已完成设备识别'

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
      .reduce((result, item) => result.concat(item.split(/[\s/(),，。_-]+/)), [])
      .filter((item) => item && item.length >= 2)
      .slice(0, 12)
  },

  /**
   * 初始化页面
   */
  async initPage(options) {
    this.checkFromAdmin()
    await ocrService.init()
    this.initManualForm()
    await this.loadEquipments()
    this.restoreSelectedEquipment()
    this.applyAssistantDraft()
  },

  /**
   * 检查是否从管理端跳转
   */
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

  /**
   * 加载企业信息
   */
  loadEnterpriseInfo() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser })
  },

  /**
   * 加载管理员信息
   */
  loadAdminInfo() {
    const adminUser = wx.getStorageSync('adminUser')
    if (adminUser) {
      this.setData({
        enterpriseUser: {
          companyName: '管理端录入',
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

  /**
   * 加载设备列表
   */
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
      console.error('加载设备库失败:', err)
    }
  },

  /**
   * 检查到期提醒
   */
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

  /**
   * Tab切换
   */
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
      const conclusions = ['合格', '不合格']
      const conclusionIndex = conclusions.indexOf(draft.extractedData.conclusion)
      if (conclusionIndex > -1) {
        nextData.conclusionIndex = conclusionIndex
      }
    }

    if (draft.extractedData.verificationDate) {
      const expiryDateStr = calculateExpiryDate(draft.extractedData.verificationDate)
      const expiryDate = new Date(expiryDateStr)
      nextData.expiryDateText = `${expiryDate.getFullYear()}年${expiryDate.getMonth() + 1}月${expiryDate.getDate()}日`
    }

    this.setData(nextData, () => {
      this.refreshAiInsight(draft.extractedData)
    })
  },

  /**
   * 初始化手动填报表单
   */
  initManualForm() {
    if (!this.data.formData.verificationDate) {
      const today = formatDate(new Date())
      const expiryDateStr = calculateExpiryDate(today)
      const expiryDate = new Date(expiryDateStr)
      const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
      this.setData({
        'formData.verificationDate': today,
        expiryDateText: expiryText
      })
    }
  },

  /**
   * 拍照/选择图片
   */
  async takePhoto() {
    try {
      const imagePath = await ocrService.chooseImage()
      this.setData({ imagePath })
    } catch (err) {
      console.error('选择图片失败:', err)
    }
  },

  /**
   * 重新拍照
   */
  retakePhoto() {
    this.setData({
      imagePath: '',
      showEditForm: false,
      qualityScore: 0,
      aiExtractLoading: false,
      aiInsight: null
    })
  },

  /**
   * 开始OCR识别
   */
  async startOCR() {
    return this.startAIExtract()
  },

  async startAIExtract() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '璇峰厛鎷嶆憚鍥剧墖', icon: 'none' })
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
      console.error('AI鎻愬彇澶辫触:', err)
      wx.showToast({ title: err.message || 'AI 分析失败', icon: 'none', duration: 3000 })
    } finally {
      wx.hideLoading()
      this.setData({ aiExtractLoading: false })
    }
  },

  /**
   * 用OCR结果填充表单
   */
  fillFormWithAI(ocrData) {
    const formData = { ...this.data.formData }

    Object.keys(ocrData).forEach(key => {
      if (ocrData[key] !== undefined && ocrData[key] !== null && ocrData[key] !== '') {
        formData[key] = ocrData[key]
      }
    })

    if (ocrData.conclusion) {
      const conclusions = ['合格', '不合格']
      const index = conclusions.indexOf(ocrData.conclusion)
      if (index > -1) {
        this.setData({ conclusionIndex: index })
      }
    }

    if (ocrData.verificationDate) {
      const expiryDateStr = calculateExpiryDate(ocrData.verificationDate)
      const expiryDate = new Date(expiryDateStr)
      const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
      this.setData({ expiryDateText: expiryText })
    }

    this.setData({ formData, showEditForm: true }, () => {
      this.refreshAiInsight(ocrData)
    })
  },

  /**
   * 上传图片（手动模式）
   */
  async uploadImage() {
    try {
      const imagePath = await ocrService.chooseImage()
      this.setData({ imagePath })
    } catch (err) {
      console.error('上传图片失败:', err)
    }
  },

  /**
   * 上传安装照片
   */
  async uploadInstallPhoto() {
    try {
      const installPhotoPath = await ocrService.chooseImage()
      this.setData({ installPhotoPath })
    } catch (err) {
      console.error('上传安装照片失败:', err)
    }
  },

  /**
   * 预览图片
   */
  previewImage() {
    if (this.data.imagePath) {
      wx.previewImage({ urls: [this.data.imagePath] })
    }
  },

  /**
   * 删除图片
   */
  deleteImage() {
    this.setData({ imagePath: '' })
  },

  /**
   * 预览安装照片
   */
  previewInstallPhoto() {
    if (this.data.installPhotoPath) {
      wx.previewImage({ urls: [this.data.installPhotoPath] })
    }
  },

  /**
   * 删除安装照片
   */
  deleteInstallPhoto() {
    this.setData({ installPhotoPath: '' })
  },

  /**
   * 表单输入处理
   */
  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`formData.${field}`]: value }, () => {
      if (this.data.showEditForm && this.data.aiInsight) {
        this.refreshAiInsight()
      }
    })
  },

  /**
   * 辖区选择
   */
  onDistrictChange(e) {
    const index = e.detail.value
    const district = this.data.districtOptions[index]
    this.setData({
      districtIndex: index,
      'formData.district': district
    })
  },

  /**
   * 检定结论选择
   */
  onConclusionChange(e) {
    const index = e.detail.value
    const conclusions = ['合格', '不合格']
    this.setData({
      conclusionIndex: index,
      'formData.conclusion': conclusions[index]
    })
  },

  /**
   * 检定日期选择
   */
  onDateChange(e) {
    const date = e.detail.value
    const expiryDateStr = calculateExpiryDate(date)
    const expiryDate = new Date(expiryDateStr)
    const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
    this.setData({
      'formData.verificationDate': date,
      expiryDateText: expiryText
    })
  },

  /**
   * 设备选择
   */
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
    wx.switchTab({ url: '/pages/archive/archive' })
  },

  /**
   * 返回上一页
   */
  goBack() {
    const { activeTab } = this.data
    if (activeTab === 'manual') {
      this.setData({ activeTab: 'ocr' })
    } else {
      this.setData({
        showEditForm: false,
        imagePath: '',
        qualityScore: 0
      })
    }
  },

  /**
   * 新建设备输入
   */
  onNewDeviceInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`newDevice.${field}`]: value })
  },

  /**
   * 保存新设备
   */
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

  /**
   * 保存记录
   */
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
      wx.showToast({ title: '仅支持检定合格的压力表生成压力表码', icon: 'none' })
      return
    }

    if (!selectedEquipmentId) {
      wx.showToast({ title: '请先选择设备（必选）', icon: 'none' })
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
      wx.showToast({ title: '✓ 存档成功', icon: 'success', duration: 1500 })
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
      console.error('保存记录失败:', err)
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

  /**
   * 请求订阅消息授权
   */
  async requestSubscribeMessage() {
    const appConfig = wx.getStorageSync('appConfig') || {}
    const tmplId = appConfig.deviceExpiryTemplateId || SUBSCRIBE_TEMPLATE_IDS.DEVICE_EXPIRY
    if (!tmplId) return
    const templateIds = [tmplId]

    try {
      const res = await expiryReminderService.requestSubscribeMessage(templateIds)
      if (res[templateIds[0]] === 'accept') {
        const enterpriseUser = wx.getStorageSync('enterpriseUser')
        if (enterpriseUser && enterpriseUser._id) {
          await expiryReminderService.saveSubscribeStatus(enterpriseUser._id, true)
        }
      }
    } catch (err) {
      console.log('订阅消息授权失败:', err)
    }
  },

  /**
   * 重置表单
   */
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

  /**
   * 关闭到期提醒弹窗
   */
  closeExpiryModal() {
    this.setData({ showExpiryModal: false })
    expiryReminderService.markTodayReminded()
  },

  /**
   * 查看到期记录
   */
  viewExpiryRecords() {
    this.setData({ showExpiryModal: false })
    expiryReminderService.markTodayReminded()
    wx.switchTab({ url: '/pages/archive/archive' })
  }
})
