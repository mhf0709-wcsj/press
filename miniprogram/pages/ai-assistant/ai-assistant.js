
const ocrService = require('../../services/ocr-service')
const aiExtractService = require('../../services/ai-extract-service')
const batchImportService = require('../../services/batch-import-service')
const recordService = require('../../services/record-service')
const deviceService = require('../../services/device-service')
const equipmentService = require('../../services/equipment-service')
const expiryReminderService = require('../../services/expiry-reminder-service')
const formValidator = require('../../utils/form-validator')
const { calculateExpiryDate } = require('../../utils/helpers/date')
const { DISTRICTS } = require('../../constants/index')
const { markLedgerChanged } = require('../../utils/data-change')

const DRAFT_STATUS_OPTIONS = ['在用', '备用', '送检', '停用', '报废']
const DRAFT_DISTRICT_OPTIONS = [...DISTRICTS]
const VISION_BATCH_CONCURRENCY = 2
const VISION_BATCH_PROGRESS_KEY = 'aiVisionBatchProgress'

const TEXT = {
  heroTopline: '智能管家',
  heroTitle: '压力表智能管家',
  heroDesc: '',
  guest: '访客',
  emptyChatTitle: '开始对话',
  emptyChatDesc: '上传照片开始识别，或直接输入问题。',
  loadingAnswer: '正在整理答案...',
  executingAction: '正在执行操作...',
  savingDraft: '正在存档...',
  uploadCta: '上传照片',
  uploadAgain: '重新上传',
  manualEntry: '手动建档',
  excelImport: 'Excel登记',
  confirmDraft: '检查并修改',
  confirmExecute: '确认执行',
  cancelExecute: '取消',
  useThisOne: '就选这条',
  debugToggle: '查看排查信息',
  debugCollapse: '收起排查信息',
  operationResultTitle: '操作结果',
  candidateTitle: '候选记录',
  inputPlaceholder: '向压力表智能管家提问',
  send: '发送',
  composerTip: '',
  me: '我',
  uploadPrompt: '请上传压力表照片。',
  uploadReceived: '正在分析...',
  analysisDone: '分析完成。',
  draftReady: '已生成草稿。',
  draftEditHint: '',
  draftMissingPrefix: '当前还有这些关键信息需要你补全：',
  draftSummaryTitle: '待你确认的变更摘要：',
  directSaveReady: '如果以上信息无误，直接回复“确认”或“确认保存”，我会直接存档。',
  installPhotoPrompt: '在用状态需上传安装照片。',
  extractionTitle: '本次识别结果',
  fields: {
    certNo: '证书编号',
    sendUnit: '送检单位',
    instrumentName: '仪表名称',
    modelSpec: '型号规格',
    factoryNo: '出厂编号',
    manufacturer: '制造单位',
    verificationStd: '检定依据',
    conclusion: '检定结论',
    verificationDate: '检定日期',
    district: '辖区',
    gaugeStatus: '压力表状态',
    categoryLabel: '设备分类',
    matchName: '归档设备'
  },
  answers: {
    fallback: '抱歉，我暂时无法回答这个问题，请稍后再试。',
    network: '网络连接出现问题，请检查网络后重试。',
    extractFailed: '图片分析失败，你可以重新上传一张更清晰的照片。',
    executeCancelled: '好的，我已取消这次操作。',
    executeFailed: '这次操作没有执行成功，请稍后重试。',
    draftEditFailed: '我暂时没能理解你想修改哪个字段，你可以说：“把型号改成 XXX”。',
    draftUndoEmpty: '当前没有可撤销的修改记录。',
    draftSaveBlocked: '现在还不能直接存档，我先把缺失信息列给你。',
    draftSaveSuccess: '好的，已直接完成存档。',
    installPhotoMissing: '当前压力表状态是“在用”，还缺少安装照片。你可以说“上传安装照片”，或者把状态改成备用、送检、停用、报废。',
    installPhotoUploaded: '好的，安装照片我已经收到了。',
    contextCrudFailed: '我没能识别出你想继续修改刚才哪条记录，你可以再明确说一次。'
  },
  shareTitle: '压力表智能管家 - 对话式建档'
}

Page({
  data: {
    text: TEXT,
    messages: [],
    inputValue: '',
    isLoading: false,
    isVisionLoading: false,
    isBatchImporting: false,
    visionProgressText: '',
    visionBatchProgress: {
      visible: false,
      total: 0,
      completed: 0,
      failed: 0,
      percent: 0,
      status: 'idle'
    },
    isCrudExecuting: false,
    isDirectSaving: false,
    scrollToView: '',
    debugExpandedMap: {},
    userInfo: null,
    userType: 'guest',
    userScope: TEXT.guest,
    visionDraft: null,
    visionBatchDrafts: [],
    excelImportDraft: null,
    excelStatusMessageId: '',
    draftHistory: [],
    pendingDraftFieldKey: '',
    skippedDraftFieldKeys: [],
    pendingEquipmentCandidates: [],
    pendingCrudPlan: null,
    lastCrudContext: null,
    reminderVisible: false,
    reminderMode: 'expiry',
    activeNoticeId: '',
    setupRedirecting: false,
    unboundEquipmentCount: 0,
    reminderCard: {
      title: '',
      summary: '',
      items: [],
      badgeText: '到期提醒',
      confirmText: '去处理',
      cancelText: '稍后处理',
      priorityDanger: false,
      priorityLabel: '',
      priorityNoteText: ''
    }
  },

  onLoad() {
    this.pageActive = true
  },

  onReady() {
    this.pageReady = true
    this.initialLoadTimer = setTimeout(() => {
      if (this.pageActive) this.initializePage()
    }, 120)
  },

  async initializePage() {
    this.restoreVisionBatchProgress()
    const ready = await this.bootstrap()
    if (!ready || !this.pageActive) return
    this.ensureGuideConversation()
    this.maybeAppendSelectedEquipmentMessage()
    this.maybeAppendUnboundEquipmentMessage()
    await this.maybeShowEntryReminder()
    if (this.pageActive) this.hasLoadedOnce = true
  },

  async onShow() {
    if (!this.pageReady || !this.hasLoadedOnce) return
    this.restoreVisionBatchProgress()

    const ready = await this.bootstrap()
    if (!ready || !this.pageActive) return
    this.ensureGuideConversation()
    this.maybeAppendSelectedEquipmentMessage()
    this.maybeAppendUnboundEquipmentMessage()
    await this.maybeShowEntryReminder()
  },

  onUnload() {
    this.pageActive = false
    if (this.initialLoadTimer) clearTimeout(this.initialLoadTimer)
  },

  onPullDownRefresh() {
    this.bootstrap()
      .then((ready) => {
        if (ready) this.ensureGuideConversation()
      })
      .finally(() => wx.stopPullDownRefresh())
  },

  async bootstrap() {
    const profile = this.resolveUserProfile()
    this.setData(profile)

    const app = getApp()
    const ledgerVersion = Number(app.globalData.ledgerVersion || 0)
    const now = Date.now()
    if (
      profile.userType === 'enterprise' &&
      this.lastBootstrapAt &&
      this.loadedLedgerVersion === ledgerVersion &&
      now - this.lastBootstrapAt < 15000
    ) {
      return true
    }

    if (profile.userType === 'enterprise') {
      const ready = await this.ensureEnterpriseEquipmentSetup(profile.userInfo)
      if (ready) {
        await this.loadUnboundEquipmentCount(profile.userInfo)
      }
      this.lastBootstrapAt = Date.now()
      this.loadedLedgerVersion = ledgerVersion
      return ready
    }
    return true
  },

  async loadUnboundEquipmentCount(enterpriseUser) {
    try {
      const list = await equipmentService.loadUnboundEquipments({ enterpriseUser })
      this.setData({ unboundEquipmentCount: list.length })
    } catch (error) {
      console.error('load unbound equipment count failed:', error)
      this.setData({ unboundEquipmentCount: 0 })
    }
  },

  async ensureEnterpriseEquipmentSetup(enterpriseUser) {
    if (!enterpriseUser?.companyName) return false

    try {
      const total = await equipmentService.countEquipments({ enterpriseUser })
      if (total > 0) {
        if (this.data.setupRedirecting) {
          this.setData({ setupRedirecting: false })
        }
        return true
      }

      if (this.data.setupRedirecting) return false

      this.setData({ setupRedirecting: true })
      wx.showToast({ title: '请先创建至少一台设备', icon: 'none', duration: 1800 })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/equipment-detail/equipment-detail?mode=create&init=1' })
      }, 250)
      return false
    } catch (error) {
      console.error('ensure equipment setup failed:', error)
      return true
    }
  },

  async maybeShowEntryReminder() {
    if (this.data.userType !== 'enterprise' || !this.data.userInfo?.companyName) return

    const app = typeof getApp === 'function' ? getApp() : null
    const token = app?.globalData?.entryReminderToken || 0

    if (token && app?.globalData?.entryReminderHandledToken === token) return

    const noticeResult = await expiryReminderService.getEnterpriseNotices()
    const notice = noticeResult?.success ? noticeResult.data?.notices?.[0] : null
    if (notice) {
      if (app?.globalData && token) {
        app.globalData.entryReminderHandledToken = token
      }
      const priorityMap = {
        urgent: { label: '紧急监管提醒', danger: true },
        important: { label: '重要监管提醒', danger: true },
        normal: { label: '企业事项提醒', danger: false }
      }
      const priority = priorityMap[notice.priority] || priorityMap.normal
      this.setData({
        reminderVisible: true,
        reminderMode: 'notice',
        activeNoticeId: notice._id,
        reminderCard: {
          title: notice.title || '监管提醒',
          summary: notice.content || '',
          items: [],
          badgeText: '监管通知',
          confirmText: '我知道了',
          cancelText: '稍后提醒',
          priorityDanger: priority.danger,
          priorityLabel: priority.label,
          priorityNoteText: notice.createdBy ? `由${notice.createdBy}发送` : '请及时查看并处理'
        }
      })
      return
    }

    if (expiryReminderService.hasDeferredToday(this.data.userInfo)) {
      if (app?.globalData && token) {
        app.globalData.entryReminderHandledToken = token
      }
      return
    }

    const res = await expiryReminderService.getEnterpriseExpiryDashboard(this.data.userInfo, 30)
    if (!res?.success) return

    const data = res.data || {}
    const expiredCount = Number(data.expiredCount || 0)
    const expiringCount = Number(data.expiringCount || 0)
    if (expiredCount + expiringCount <= 0) return

    if (app?.globalData && token) {
      app.globalData.entryReminderHandledToken = token
    }

    this.setData({
      reminderVisible: true,
      reminderMode: 'expiry',
      activeNoticeId: '',
      reminderCard: {
        title: '今日到期提醒',
        summary: `您有 ${expiredCount} 台逾期，${expiringCount} 台将在 30 天内到期。`,
        items: (data.recentItems || []).slice(0, 3).map((item) => ({
          title: item.factoryNo || item.instrumentName || TEXT.extractionTitle,
          subtitle: item.instrumentName || TEXT.fields.instrumentName,
          expiredCount: item.expiryStatus === 'expired' ? 1 : 0,
          expiringCount: item.expiryStatus === 'expired' ? 0 : 1
        })),
        badgeText: '到期提醒',
        confirmText: '去处理',
        cancelText: '稍后处理',
        priorityDanger: expiredCount > 0,
        priorityLabel: '',
        priorityNoteText: ''
      }
    })
  },

  async closeReminderCard() {
    if (this.data.reminderMode === 'notice' && this.data.activeNoticeId) {
      await expiryReminderService.updateEnterpriseNoticeStatus(this.data.activeNoticeId, 'deferred')
    } else if (this.data.userInfo?.companyName) {
      expiryReminderService.deferTodayReminder(this.data.userInfo)
    }
    this.setData({ reminderVisible: false, activeNoticeId: '' })
  },

  async confirmReminderCard() {
    if (this.data.reminderMode === 'notice' && this.data.activeNoticeId) {
      await expiryReminderService.updateEnterpriseNoticeStatus(this.data.activeNoticeId, 'read')
      this.setData({ reminderVisible: false, activeNoticeId: '' })
      wx.showToast({ title: '已确认收到', icon: 'success' })
      return
    }
    this.setData({ reminderVisible: false, activeNoticeId: '' })
    wx.navigateTo({ url: '/pages/archive/archive?filter=expiry' })
  },

  resolveUserProfile() {
    const adminUser = wx.getStorageSync('adminUser')
    const enterpriseUser = wx.getStorageSync('enterpriseUser')

    if (adminUser) {
      const isDistrictAdmin = adminUser.role === 'district' && adminUser.district
      return {
        userType: isDistrictAdmin ? 'district_admin' : 'super_admin',
        userInfo: adminUser,
        userScope: isDistrictAdmin ? `${adminUser.district}辖区管理员` : '总管理员'
      }
    }

    if (enterpriseUser) {
      return {
        userType: 'enterprise',
        userInfo: enterpriseUser,
        userScope: enterpriseUser.companyName || '企业用户'
      }
    }

    return {
      userType: 'guest',
      userInfo: null,
      userScope: TEXT.guest
    }
  },

  ensureGuideConversation() {
    if (this.data.messages.length > 0) return
    this.setData({
      messages: [
        this.createTextMessage('assistant', TEXT.uploadPrompt),
        this.createTextMessage('assistant', '可以直接提问或上传照片。')
      ]
    }, () => this.scrollToBottom())
  },

  maybeAppendUnboundEquipmentMessage() {
    if (this.data.userType !== 'enterprise' || this.data.unboundEquipmentCount <= 0) return
    const exists = this.data.messages.some((item) => item.kind === 'text' && /未绑定压力表/.test(item.content || ''))
    if (exists) return

    const count = this.data.unboundEquipmentCount
    this.appendMessages([
      this.createTextMessage('assistant', `${count} 台设备未绑定压力表。`)
    ])
  },

  maybeAppendSelectedEquipmentMessage() {
    const selected = wx.getStorageSync('selectedEquipmentForNewGauge')
    if (!selected?.id || this.lastPromptedEquipmentId === selected.id) return

    this.lastPromptedEquipmentId = selected.id
    this.appendMessages([
      this.createTextMessage('assistant', `已选择设备“${selected.name || '未命名设备'}”，请上传该设备上的压力表检定证书。`)
    ])
  },

  createBaseMessage(role, kind) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      kind,
      time: this.formatTime(new Date())
    }
  },

  createTextMessage(role, content) {
    return {
      ...this.createBaseMessage(role, 'text'),
      content
    }
  },

  createImageMessage(imagePath) {
    return {
      ...this.createBaseMessage('user', 'image'),
      imagePath,
      content: TEXT.uploadCta
    }
  },

  createImageBatchMessage(imagePaths) {
    return {
      ...this.createBaseMessage('user', 'image_batch'),
      imagePaths,
      content: `已选择 ${imagePaths.length} 张图片`
    }
  },

  createVisionBatchMessage(items) {
    const successCount = items.filter((item) => item.status === 'ready').length
    const errorCount = items.length - successCount
    return {
      ...this.createBaseMessage('assistant', 'vision_batch'),
      title: '多图识别完成',
      content: `共分析 ${items.length} 张，成功 ${successCount} 张${errorCount ? `，失败 ${errorCount} 张` : ''}。点击识别结果可逐条检查和保存。`,
      items
    }
  },

  createExcelImportMessage(result) {
    const rows = (result.rows || []).slice(0, 8).map((row) => ({
      rowNo: row.rowNo,
      title: row.factoryNo || row.deviceNo || `第 ${row.rowNo} 行`,
      subtitle: row.status === 'error'
        ? (row.errors || []).join('、')
        : (row.importMode === 'gauge' ? `新建压力表 · ${row.equipmentName || '所属设备待确认'}` : `登记检定记录 · ${row.verificationDate}`),
      status: row.status,
      statusText: row.status === 'ready' ? '可导入' : (row.status === 'duplicate' ? '重复' : '需修改')
    }))
    return {
      ...this.createBaseMessage('assistant', 'excel_import'),
      title: 'Excel 解析结果',
      content: `共 ${result.total || 0} 行，可导入 ${result.readyCount || 0} 行，重复 ${result.duplicateCount || 0} 行，需修改 ${result.errorCount || 0} 行。`,
      rows,
      readyCount: Number(result.readyCount || 0),
      hiddenCount: Math.max(0, Number(result.total || 0) - rows.length),
      state: 'pending'
    }
  },

  createResultMessage(result) {
    const confidence = Number(result.confidence || 0)
    const confidencePercent = Math.round(confidence * 100)
    const lowConfidenceLabels = (result.recognitionMeta?.lowConfidenceFields || [])
      .map((key) => TEXT.fields[key] || '')
      .filter(Boolean)
    const diagnostics = (result.fields || [])
      .map((field) => ({
        key: field.key,
        label: field.label,
        source: result.recognitionMeta?.fieldSources?.[field.key] || ''
      }))
      .filter((field) => field.source)

    return {
      ...this.createBaseMessage('assistant', 'result'),
      title: TEXT.extractionTitle,
      summary: result.summary,
      fields: result.fields,
      imagePath: result.imagePath,
      confidenceText: confidencePercent ? `识别可信度 ${confidencePercent}%` : '',
      confidenceTone: confidence >= 0.85 ? 'good' : (confidence >= 0.7 ? 'warning' : 'risk'),
      reviewHint: lowConfidenceLabels.length
        ? `建议重点核对：${lowConfidenceLabels.join('、')}`
        : '关键字段识别结果较完整',
      recognitionMode: result.recognitionMeta?.mode === 'ai_enhanced' ? '规则与 AI 联合识别' : '规则识别',
      diagnostics
    }
  },

  createCrudResultMessage(plan) {
    return {
      ...this.createBaseMessage('assistant', 'crud_result'),
      title: TEXT.operationResultTitle,
      content: plan.answer || TEXT.answers.fallback,
      items: Array.isArray(plan.items) ? plan.items : [],
      interpretation: plan.interpretation || '',
      queryLog: plan.queryLog || ''
    }
  },

  createCrudConfirmMessage(plan) {
    return {
      ...this.createBaseMessage('assistant', 'crud_confirm'),
      title: plan.entityLabel || TEXT.operationResultTitle,
      content: plan.answer || TEXT.answers.fallback,
      items: Array.isArray(plan.items) ? plan.items : [],
      payload: plan.payload || null,
      interpretation: plan.interpretation || '',
      queryLog: plan.queryLog || ''
    }
  },

  createCrudSelectMessage(plan) {
    return {
      ...this.createBaseMessage('assistant', 'crud_select'),
      title: TEXT.candidateTitle,
      content: plan.answer || TEXT.answers.fallback,
      items: Array.isArray(plan.items)
        ? plan.items.map((entry) => ({
          ...entry,
          payloadBase: plan.payloadBase || null
        }))
        : [],
      payloadBase: plan.payloadBase || null,
      interpretation: plan.interpretation || '',
      queryLog: plan.queryLog || ''
    }
  },

  createEquipmentCandidateMessage(candidates) {
    return {
      ...this.createBaseMessage('assistant', 'equipment_candidates'),
      title: '选择所属设备',
      content: '找到多个相近设备，请选择要归档到哪一台设备。',
      items: candidates.map((item, index) => ({
        id: item._id,
        index: index + 1,
        title: item.equipmentName || `设备${index + 1}`,
        subtitle: [
          item.location ? `位置 ${item.location}` : '',
          item.district ? `辖区 ${item.district}` : '',
          item.gaugeCount !== undefined ? `压力表 ${item.gaugeCount} 块` : ''
        ].filter(Boolean).join(' / '),
        raw: item
      }))
    }
  },

  appendMessages(newMessages) {
    this.setData({
      messages: [...this.data.messages, ...newMessages]
    }, () => this.scrollToBottom())
  },

  onInput(e) {
    this.setData({
      inputValue: e.detail.value
    })
  },

  getCloudUserType() {
    return this.data.userType === 'district_admin' || this.data.userType === 'super_admin'
      ? 'admin'
      : this.data.userType
  },

  getRuntimeUserOptions() {
    const isAdmin = this.data.userType === 'district_admin' || this.data.userType === 'super_admin'
    return {
      fromAdmin: isAdmin,
      enterpriseUser: isAdmin ? (this.data.userInfo || {}) : (this.data.userInfo || wx.getStorageSync('enterpriseUser') || {}),
      district: isAdmin ? (this.data.userInfo?.district || '') : ''
    }
  },

  buildConversationContext() {
    return {
      recentMessages: this.getRecentConversationMessages(),
      lastCrudContext: this.getConversationCrudContext(),
      visionDraft: this.getConversationVisionDraft(),
      pendingCrudPlan: this.getConversationPendingPlan()
    }
  },

  getRecentConversationMessages() {
    return (this.data.messages || [])
      .slice(-6)
      .map((item) => this.serializeConversationMessage(item))
      .filter((item) => item && item.content)
  },

  serializeConversationMessage(message) {
    if (!message || !message.role) return null
    if (message.kind === 'text') {
      return {
        role: message.role,
        kind: 'text',
        content: String(message.content || '').trim()
      }
    }
    if (message.kind === 'result') {
      const fieldSummary = (message.fields || [])
        .slice(0, 5)
        .map((field) => `${field.label}=${field.value}`)
        .join('，')
      return {
        role: message.role,
        kind: 'result',
        content: [message.summary, fieldSummary].filter(Boolean).join('；')
      }
    }
    if (message.kind === 'crud_result' || message.kind === 'crud_confirm' || message.kind === 'crud_select') {
      return {
        role: message.role,
        kind: message.kind,
        content: String(message.answer || '').trim()
      }
    }
    return null
  },

  getConversationCrudContext() {
    const context = this.data.lastCrudContext
    if (!context) return null
    return {
      entity: context.entity || '',
      targetId: context.targetId || '',
      title: context.title || '',
      operation: context.operation || ''
    }
  },

  getConversationVisionDraft() {
    const data = this.data.visionDraft?.extractedData
    if (!data) return null
    return {
      certNo: data.certNo || '',
      factoryNo: data.factoryNo || '',
      instrumentName: data.instrumentName || '',
      modelSpec: data.modelSpec || '',
      manufacturer: data.manufacturer || '',
      sendUnit: data.sendUnit || '',
      verificationDate: data.verificationDate || '',
      conclusion: data.conclusion || '',
      district: data.district || '',
      gaugeStatus: data.gaugeStatus || '',
      selectedEquipmentId: data.selectedEquipmentId || '',
      selectedEquipmentName: data.selectedEquipmentName || ''
    }
  },

  getConversationPendingPlan() {
    const plan = this.data.pendingCrudPlan
    if (!plan?.payload) return null
    return {
      entityLabel: plan.entityLabel || '',
      answer: plan.answer || '',
      payload: {
        operation: plan.payload.operation || '',
        entity: plan.payload.entity || '',
        targetId: plan.payload.targetId || '',
        changes: plan.payload.changes || {}
      }
    }
  },

  async requestCrudPlan(question) {
    const res = await wx.cloud.callFunction({
      name: 'aiAssistant',
      data: {
        action: 'crudPlan',
        adminToken: wx.getStorageSync('adminUser')?.token || '',
        question,
        userType: this.getCloudUserType(),
        userInfo: this.data.userInfo,
        conversationContext: this.buildConversationContext()
      }
    })
    return res.result || {}
  },

  async requestCrudExecute(payload) {
    const res = await wx.cloud.callFunction({
      name: 'aiAssistant',
      data: {
        action: 'crudExecute',
        adminToken: wx.getStorageSync('adminUser')?.token || '',
        payload,
        userType: this.getCloudUserType(),
        userInfo: this.data.userInfo,
        conversationContext: this.buildConversationContext()
      }
    })
    return res.result || {}
  },

  looksLikeCrudQuestion(question) {
    const text = String(question || '').trim()
    if (/(查|查询|查找|搜索|看看|看一下|看下|帮我看|帮我查|列出|找出|修改|改成|改为|更新|变更|新增|创建|录入|添加|删除|移除|作废)/.test(text)) {
      return true
    }
    return /(压力表|设备|检定记录|证书).*(编号|状态|型号|详情|哪|有没有|是否)/.test(text)
  },

  looksLikeDraftUndoQuestion(question) {
    return !!this.data.visionDraft && /(撤销|恢复上一步|撤回上一步|回退上一步)/.test(question)
  },

  looksLikeDraftSaveQuestion(question) {
    if (!this.data.visionDraft || this.data.pendingCrudPlan) return false
    return /(确认保存|确认存档|直接保存|就这样保存|去保存|去确认并保存|^确认$|没问题|可以保存|就这样|保存吧|提交吧)/.test(question)
  },

  looksLikeConfirmQuestion(question) {
    return /(确认执行|确认一下|^确认$|是的|没问题|可以执行|继续执行)/.test(String(question || '').trim())
  },

  looksLikeCancelQuestion(question) {
    return /(取消|先别执行|不要了|算了|放弃)/.test(String(question || '').trim())
  },

  looksLikeDraftControlQuestion(question) {
    return /(上一项|上一个|跳过|重新填写|重新填|重填)/.test(String(question || '').trim())
  },

  looksLikeInstallPhotoQuestion(question) {
    return !!this.data.visionDraft && /(上传安装照片|补上传安装照片|安装照片|安装照)/.test(question)
  },

  looksLikeContextCrudQuestion(question) {
    return !!this.data.lastCrudContext && /(刚才|上一条|那条|这条|刚刚)/.test(question) && /(改成|改为|修改成|修改为|更新为|设为)/.test(question)
  },

  looksLikeDraftEditQuestion(question) {
    if (!this.data.visionDraft) return false
    return this.splitDraftEditSegments(question).some((segment) => {
      const config = this.getDraftEditConfigs().find((item) => item.patterns.some((pattern) => segment.includes(pattern)))
      return !!config
    })
  },

  async onSend() {
    const question = this.data.inputValue.trim()
    if (!question || this.data.isLoading || this.data.isVisionLoading || this.data.isCrudExecuting || this.data.isDirectSaving) return

    this.setData({
      messages: [...this.data.messages, this.createTextMessage('user', question)],
      inputValue: '',
      isLoading: true
    }, () => this.scrollToBottom())

    const normalized = question.toLowerCase()

    try {
      if (this.data.pendingCrudPlan && this.looksLikeConfirmQuestion(question)) {
        this.setData({ isLoading: false })
        await this.confirmCrudExecution()
        return
      }

      if (this.data.pendingCrudPlan && this.looksLikeCancelQuestion(question)) {
        this.setData({ isLoading: false })
        this.cancelCrudExecution()
        return
      }

      if (this.looksLikeDraftUndoQuestion(question)) {
        this.setData({ isLoading: false })
        this.undoDraftEdit()
        return
      }

      if (this.looksLikeInstallPhotoQuestion(question)) {
        this.setData({ isLoading: false })
        await this.onUploadInstallPhoto()
        return
      }

      if (this.looksLikeDraftSaveQuestion(question)) {
        this.setData({ isLoading: false })
        await this.handleDirectSaveRequest()
        return
      }

      if (this.looksLikeDraftEditQuestion(question)) {
        const handled = this.applyDraftEditFromQuestion(question)
        this.setData({ isLoading: false })
        if (handled) return
      }

      if (this.data.visionDraft && this.looksLikeDraftControlQuestion(question)) {
        this.setData({ isLoading: false })
        const handled = this.handleDraftControlQuestion(question)
        if (handled) return
      }

      if (this.data.visionDraft && this.data.pendingEquipmentCandidates.length) {
        this.setData({ isLoading: false })
        const handled = this.handleEquipmentCandidateAnswer(question)
        if (handled) return
      }

      if (this.data.visionDraft && this.data.pendingDraftFieldKey) {
        this.setData({ isLoading: false })
        const handled = await this.handlePendingDraftFieldAnswer(question)
        if (handled) return
      }

      if (this.looksLikeContextCrudQuestion(question)) {
        this.setData({ isLoading: false })
        const handled = await this.handleContextCrudQuestion(question)
        if (handled) return
      }

      if (
        normalized.includes('上传') ||
        normalized.includes('照片') ||
        normalized.includes('证书') ||
        normalized.includes('photo') ||
        normalized.includes('image')
      ) {
        this.setData({ isLoading: false })
        this.appendMessages([this.createTextMessage('assistant', TEXT.uploadPrompt)])
        return
      }

      if (this.looksLikeCrudQuestion(question)) {
        const crudPlan = await this.requestCrudPlan(question)
        const crudMessage = this.buildCrudMessage(crudPlan)

        if (crudMessage) {
          const nextContext = this.extractCrudContext(crudPlan)
          this.setData({
            messages: [...this.data.messages, crudMessage],
            isLoading: false,
            pendingCrudPlan: crudPlan.mode === 'confirm'
              ? {
                answer: crudPlan.answer,
                entityLabel: crudPlan.entityLabel,
                items: crudPlan.items || [],
                payload: crudPlan.payload
              }
              : null,
            lastCrudContext: nextContext || this.data.lastCrudContext
          }, () => this.scrollToBottom())
          return
        }
      }

      const res = await wx.cloud.callFunction({
        name: 'aiAssistant',
        data: {
          question,
          adminToken: wx.getStorageSync('adminUser')?.token || '',
          userType: this.getCloudUserType(),
          userInfo: this.data.userInfo,
          conversationContext: this.buildConversationContext()
        }
      })

      this.setData({
        messages: [...this.data.messages, this.createTextMessage('assistant', res.result.answer || TEXT.answers.fallback)],
        isLoading: false,
        pendingCrudPlan: null
      }, () => this.scrollToBottom())
    } catch (error) {
      console.error('AI request failed:', error)
      this.setData({
        messages: [...this.data.messages, this.createTextMessage('assistant', TEXT.answers.network)],
        isLoading: false
      }, () => this.scrollToBottom())
    }
  },

  buildCrudMessage(plan) {
    if (!plan || !plan.success || !plan.mode) return null
    if (plan.mode === 'result') return this.createCrudResultMessage(plan)
    if (plan.mode === 'confirm' && plan.payload) return this.createCrudConfirmMessage(plan)
    if (plan.mode === 'select' && Array.isArray(plan.items) && plan.items.length) return this.createCrudSelectMessage(plan)
    if (plan.mode === 'collect') {
      if (plan.interpretation || plan.queryLog) {
        return this.createCrudResultMessage(plan)
      }
      return this.createTextMessage('assistant', plan.answer || TEXT.answers.fallback)
    }
    return null
  },

  extractCrudContext(plan) {
    if (!plan) return null
    if (plan.payload?.targetId) {
      return {
        operation: plan.payload.operation || '',
        entity: plan.payload.entity,
        targetId: plan.payload.targetId,
        title: plan.items?.[0]?.title || ''
      }
    }
    return null
  },

  async confirmCrudExecution() {
    const payload = this.data.pendingCrudPlan?.payload
    if (!payload || this.data.isCrudExecuting) return
    const pendingPlan = this.data.pendingCrudPlan

    this.setData({ isCrudExecuting: true }, () => this.scrollToBottom())

    try {
      const result = await this.requestCrudExecute(payload)
      markLedgerChanged()
      this.setData({
        messages: [...this.data.messages, this.createTextMessage('assistant', result.answer || TEXT.answers.fallback)],
        isCrudExecuting: false,
        pendingCrudPlan: null,
        lastCrudContext: {
          operation: payload.operation,
          entity: payload.entity,
          targetId: payload.targetId,
          title: pendingPlan?.items?.[0]?.title || ''
        }
      }, () => this.scrollToBottom())
    } catch (error) {
      console.error('CRUD execute failed:', error)
      this.setData({
        messages: [...this.data.messages, this.createTextMessage('assistant', error.message || TEXT.answers.executeFailed)],
        isCrudExecuting: false
      }, () => this.scrollToBottom())
    }
  },

  cancelCrudExecution() {
    if (!this.data.pendingCrudPlan) return
    this.setData({ pendingCrudPlan: null })
    this.appendMessages([this.createTextMessage('assistant', TEXT.answers.executeCancelled)])
  },

  selectCrudItem(e) {
    const item = e.currentTarget.dataset.item
    const payloadBase = e.currentTarget.dataset.payloadBase || {}
    if (!item || !item.id || !payloadBase.operation || !payloadBase.entity) return

    const answer = payloadBase.operation === 'delete'
      ? `我准备删除“${item.title}”，是否确认？`
      : `我准备对“${item.title}”执行这次操作，是否确认？`

    const nextPlan = {
      entityLabel: this.getEntityLabel(payloadBase.entity),
      answer,
      items: [item],
      payload: {
        operation: payloadBase.operation,
        entity: payloadBase.entity,
        targetId: item.id,
        changes: payloadBase.changes || {}
      }
    }

    this.setData({
      pendingCrudPlan: nextPlan,
      lastCrudContext: {
        operation: payloadBase.operation,
        entity: payloadBase.entity,
        targetId: item.id,
        title: item.title
      }
    })

    this.appendMessages([this.createCrudConfirmMessage(nextPlan)])
  },

  toggleDebugPanel(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    const nextValue = !this.data.debugExpandedMap[id]
    this.setData({
      [`debugExpandedMap.${id}`]: nextValue
    })
  },

  getEntityLabel(entity) {
    if (entity === 'device') return '压力表'
    if (entity === 'equipment') return '设备'
    return '检定记录'
  },

  async handleContextCrudQuestion(question) {
    const context = this.data.lastCrudContext
    if (!context) return false

    const payload = this.buildContextCrudPayload(question, context)
    if (!payload) {
      this.appendMessages([this.createTextMessage('assistant', TEXT.answers.contextCrudFailed)])
      return true
    }

    const nextPlan = this.buildContextCrudConfirmPlan(question, context, payload)
    this.setData({
      pendingCrudPlan: nextPlan,
      lastCrudContext: {
        ...context,
        operation: payload.operation,
        entity: payload.entity,
        targetId: payload.targetId
      }
    })
    this.appendMessages([this.createCrudConfirmMessage(nextPlan)])
    return true
  },

  buildContextCrudPayload(question, context) {
    const changes = this.extractContextChanges(question, context.entity)
    if (!Object.keys(changes).length) return null
    return {
      operation: 'update',
      entity: context.entity,
      targetId: context.targetId,
      changes
    }
  },

  buildContextCrudConfirmPlan(question, context, payload) {
    const summary = this.buildCrudChangeSummary(payload.entity, payload.changes)
    return {
      success: true,
      mode: 'confirm',
      entityLabel: this.getEntityLabel(payload.entity),
      answer: `我理解你的意思是：把“${context.title || '这条记录'}”${summary}。确认后我立即执行。`,
      items: [{
        id: payload.targetId,
        title: context.title || '当前记录',
        subtitle: summary.replace(/^修改为：/, '')
      }],
      interpretation: `延续最近上下文：${context.title || '当前记录'} | 对象=${this.getEntityLabel(payload.entity)}`,
      queryLog: '已根据最近一次操作对象生成待确认变更摘要',
      payload
    }
  },

  buildCrudChangeSummary(entity, changes) {
    const labelMap = {
      device: {
        status: '状态',
        modelSpec: '型号规格',
        deviceName: '压力表名称',
        manufacturer: '制造单位',
        installLocation: '安装位置',
        equipmentName: '所属设备'
      },
      equipment: {
        location: '位置',
        district: '辖区'
      },
      pressure_record: {
        conclusion: '检定结论',
        verificationDate: '检定日期',
        modelSpec: '型号规格',
        instrumentName: '仪表名称',
        manufacturer: '制造单位',
        sendUnit: '送检单位'
      }
    }
    const labels = labelMap[entity] || {}
    const parts = Object.keys(changes || {}).map((key) => `${labels[key] || key}改为“${changes[key]}”`)
    return parts.length ? `修改为：${parts.join('，')}` : '进行修改'
  },

  extractContextChanges(question, entity) {
    const changes = {}
    const pickValue = (patterns) => {
      for (const pattern of patterns) {
        const match = question.match(pattern)
        if (match && match[1]) return match[1].trim()
      }
      return ''
    }

    const dateMatch = question.match(/(20\d{2})[-\/年](\d{1,2})[-\/月](\d{1,2})/)
    const verificationDate = dateMatch
      ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`
      : ''
    const status = DRAFT_STATUS_OPTIONS.find((item) => question.includes(item)) || ''
    const conclusion = question.includes('不合格') ? '不合格' : (question.includes('合格') ? '合格' : '')
    const modelSpec = pickValue([/(?:型号规格|型号|规格)(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)/])
    const instrumentName = pickValue([/(?:仪表名称|仪表名|表名|名称)(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)/])
    const manufacturer = pickValue([/(?:制造单位|厂家|制造厂)(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)/])
    const sendUnit = pickValue([/(?:送检单位)(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)/])

    if (entity === 'pressure_record') {
      if (conclusion) changes.conclusion = conclusion
      if (verificationDate) changes.verificationDate = verificationDate
      if (modelSpec) changes.modelSpec = modelSpec
      if (instrumentName) changes.instrumentName = instrumentName
      if (manufacturer) changes.manufacturer = manufacturer
      if (sendUnit) changes.sendUnit = sendUnit
    }

    if (entity === 'device') {
      if (status) changes.status = status
      if (modelSpec) changes.modelSpec = modelSpec
      if (instrumentName) changes.deviceName = instrumentName
      if (manufacturer) changes.manufacturer = manufacturer
    }

    if (entity === 'equipment') {
      if (status) changes.status = status
      const district = DRAFT_DISTRICT_OPTIONS.find((item) => question.includes(item)) || ''
      if (district) changes.district = district
    }

    return changes
  },

  async onUploadVisionImage() {
    if (this.data.isVisionLoading) return

    try {
      const imagePaths = await ocrService.chooseImages({ count: 9 })
      if (!imagePaths.length) return

      if (imagePaths.length > 1) {
        this.appendMessages([this.createImageBatchMessage(imagePaths)])
        await this.processVisionBatch(imagePaths)
        return
      }

      const imagePath = imagePaths[0]

      this.appendMessages([
        this.createImageMessage(imagePath),
        this.createTextMessage('assistant', TEXT.uploadReceived)
      ])

      await this.processVisionImage(imagePath)
    } catch (error) {
      console.error('select image failed:', error)
    }
  },

  async processVisionBatch(imagePaths) {
    const selected = wx.getStorageSync('selectedEquipmentForNewGauge')
    const drafts = []
    const items = new Array(imagePaths.length)
    let cursor = 0
    let completed = 0
    let failed = 0
    this.setData({
      isVisionLoading: true,
      visionProgressText: '正在后台识别图片...',
      visionBatchProgress: {
        visible: true,
        total: imagePaths.length,
        completed: 0,
        failed: 0,
        percent: 0,
        status: 'processing'
      }
    })
    this.persistVisionBatchProgress()

    const runWorker = async () => {
      while (cursor < imagePaths.length) {
        const index = cursor
        cursor += 1
        const imagePath = imagePaths[index]
        try {
          const result = await aiExtractService.extractFromImage(imagePath, {
            userType: this.getCloudUserType(),
            userInfo: this.data.userInfo
          })
          const draft = this.buildVisionDraft({
            ...result,
            selectedEquipmentId: result.selectedEquipmentId || selected?.id || '',
            selectedEquipmentName: result.selectedEquipmentName || selected?.name || ''
          }, imagePath)
          const batchIndex = drafts.length
          drafts.push(draft)
          const missing = this.getDraftMissingFields(draft)
          items[index] = {
            batchIndex,
            imagePath,
            status: 'ready',
            statusText: missing.length ? `待补 ${missing.length} 项` : '可检查',
            title: draft.extractedData.factoryNo || draft.extractedData.certNo || `第 ${index + 1} 张`,
            subtitle: draft.extractedData.instrumentName || '已完成识别'
          }
        } catch (error) {
          failed += 1
          items[index] = {
            batchIndex: -1,
            imagePath,
            status: 'error',
            statusText: '识别失败',
            title: `第 ${index + 1} 张`,
            subtitle: error.message || TEXT.answers.extractFailed
          }
        } finally {
          completed += 1
          this.updateVisionBatchProgress(completed, imagePaths.length, failed)
        }
      }
    }

    const workerCount = Math.min(VISION_BATCH_CONCURRENCY, imagePaths.length)
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()))

    if (selected?.id) wx.removeStorageSync('selectedEquipmentForNewGauge')
    this.setData({
      isVisionLoading: false,
      visionProgressText: '识别完成',
      visionBatchDrafts: drafts,
      visionBatchProgress: {
        visible: true,
        total: imagePaths.length,
        completed: imagePaths.length,
        failed,
        percent: 100,
        status: 'completed'
      }
    })
    this.persistVisionBatchProgress()
    this.appendMessages([this.createVisionBatchMessage(items)])
    setTimeout(() => {
      this.setData({ 'visionBatchProgress.visible': false })
      wx.removeStorageSync(VISION_BATCH_PROGRESS_KEY)
    }, 1200)
  },

  updateVisionBatchProgress(completed, total, failed) {
    const progress = {
      visible: true,
      total,
      completed,
      failed,
      percent: Math.round((completed / Math.max(1, total)) * 100),
      status: completed >= total ? 'completed' : 'processing'
    }
    this.setData({
      visionBatchProgress: progress,
      visionProgressText: completed >= total
        ? '识别完成'
        : `后台识别中，已完成 ${completed}/${total} 张`
    })
    this.persistVisionBatchProgress(progress)
  },

  persistVisionBatchProgress(progress = this.data.visionBatchProgress) {
    wx.setStorageSync(VISION_BATCH_PROGRESS_KEY, {
      ...progress,
      updateTime: Date.now()
    })
  },

  restoreVisionBatchProgress() {
    const progress = wx.getStorageSync(VISION_BATCH_PROGRESS_KEY)
    if (!progress?.visible || Date.now() - Number(progress.updateTime || 0) > 30 * 60 * 1000) {
      wx.removeStorageSync(VISION_BATCH_PROGRESS_KEY)
      return
    }
    if (progress.status === 'processing' && !this.data.isVisionLoading) {
      wx.removeStorageSync(VISION_BATCH_PROGRESS_KEY)
      return
    }
    this.setData({ visionBatchProgress: progress })
  },

  openVisionBatchItem(e) {
    const index = Number(e.currentTarget.dataset.batchIndex)
    const draft = this.data.visionBatchDrafts[index]
    if (!draft) return
    wx.setStorageSync('aiAssistantRecordDraft', draft)
    this.setData({
      visionDraft: draft,
      draftHistory: [],
      pendingDraftFieldKey: this.getNextDraftMissingFieldKey(draft, []),
      skippedDraftFieldKeys: [],
      pendingEquipmentCandidates: []
    })
    this.appendMessages([
      this.createResultMessage(draft),
      ...this.buildDraftFollowUpMessages(draft, { includeResultMessage: false })
    ])
  },

  async onImportExcel() {
    if (this.data.isBatchImporting) return
    if (this.data.userType !== 'enterprise') {
      this.appendMessages([this.createTextMessage('assistant', 'Excel 批量登记目前仅支持企业账号。')])
      return
    }

    let uploadedFileID = ''
    this.setData({ isBatchImporting: true })
    try {
      const file = await batchImportService.chooseExcelFile()
      if (!file) {
        this.setData({ isBatchImporting: false })
        return
      }
      this.appendMessages([this.createTextMessage('user', `导入 Excel：${file.name || '压力表台账'}`)])
      this.upsertExcelStatusMessage('正在读取 Excel，请稍候…')
      const result = await batchImportService.uploadAndParse(file)
      uploadedFileID = result.fileID || ''
      const message = this.createExcelImportMessage(result)
      this.removeExcelStatusMessage()
      this.setData({
        isBatchImporting: false,
        excelImportDraft: { ...result, messageId: message.id },
        excelStatusMessageId: ''
      })
      this.appendMessages([message])
    } catch (error) {
      this.setData({ isBatchImporting: false })
      const raw = String(error?.errMsg || error?.message || '')
      if (!/cancel/i.test(raw)) {
        this.upsertExcelStatusMessage(error.message || raw || 'Excel 解析失败，请稍后重试。')
      } else {
        this.removeExcelStatusMessage()
      }
    } finally {
      if (uploadedFileID) await batchImportService.deleteFile(uploadedFileID)
    }
  },

  upsertExcelStatusMessage(content) {
    const messageId = this.data.excelStatusMessageId
    if (messageId) {
      this.setData({
        messages: this.data.messages.map((message) => (
          message.id === messageId ? { ...message, content, time: this.formatTime(new Date()) } : message
        ))
      }, () => this.scrollToBottom())
      return
    }
    const message = this.createTextMessage('assistant', content)
    this.setData({
      messages: [...this.data.messages, message],
      excelStatusMessageId: message.id
    }, () => this.scrollToBottom())
  },

  removeExcelStatusMessage() {
    const messageId = this.data.excelStatusMessageId
    if (!messageId) return
    this.setData({
      messages: this.data.messages.filter((message) => message.id !== messageId),
      excelStatusMessageId: ''
    })
  },

  async confirmExcelImport() {
    const draft = this.data.excelImportDraft
    const rows = (draft?.rows || []).filter((row) => row.status === 'ready')
    if (!rows.length || this.data.isBatchImporting) return

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认批量登记',
        content: `将写入 ${rows.length} 行数据。重复项和错误项不会写入，是否继续？`,
        confirmText: '确认登记',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false)
      })
    })
    if (!confirmed) return

    this.setData({ isBatchImporting: true }, () => this.scrollToBottom())
    try {
      const result = await batchImportService.commit(rows)
      markLedgerChanged()
      this.updateExcelImportMessage(draft.messageId, 'committed')
      this.setData({ isBatchImporting: false, excelImportDraft: null })
      this.appendMessages([
        this.createTextMessage(
          'assistant',
          `批量登记完成：成功 ${result.successCount || 0} 行，重复跳过 ${result.duplicateCount || 0} 行，失败 ${result.errorCount || 0} 行。`
        )
      ])
    } catch (error) {
      this.setData({ isBatchImporting: false })
      this.appendMessages([this.createTextMessage('assistant', error.message || '批量登记失败，请稍后重试。')])
    }
  },

  cancelExcelImport() {
    const messageId = this.data.excelImportDraft?.messageId
    if (messageId) this.updateExcelImportMessage(messageId, 'cancelled')
    this.setData({ excelImportDraft: null })
  },

  updateExcelImportMessage(messageId, state) {
    this.setData({
      messages: this.data.messages.map((message) => (
        message.id === messageId ? { ...message, state } : message
      ))
    })
  },

  async onUploadInstallPhoto() {
    if (!this.data.visionDraft) return
    try {
      const imagePath = await ocrService.chooseImage()
      if (!imagePath) return
      const nextResult = {
        ...(this.data.visionDraft.extractedData || {}),
        installPhotoPath: imagePath
      }
      const nextDraft = this.refreshVisionDraft(nextResult, { pushHistory: true })
      this.appendMessages([
        this.createImageMessage(imagePath),
        this.createTextMessage('assistant', TEXT.answers.installPhotoUploaded),
        ...this.buildDraftFollowUpMessages(nextDraft, {
          includeResultMessage: false,
          changeSummary: '安装照片已补齐'
        })
      ])
    } catch (error) {
      console.error('upload install photo failed:', error)
    }
  },

  async processVisionImage(imagePath) {
    this.setData({ isVisionLoading: true })

    try {
      const result = await aiExtractService.extractFromImage(imagePath, {
        userType: this.getCloudUserType(),
        userInfo: this.data.userInfo
      })

      const selected = wx.getStorageSync('selectedEquipmentForNewGauge')
      const draft = this.buildVisionDraft({
        ...result,
        selectedEquipmentId: result.selectedEquipmentId || selected?.id || '',
        selectedEquipmentName: result.selectedEquipmentName || selected?.name || ''
      }, imagePath)
      if (selected?.id) {
        wx.removeStorageSync('selectedEquipmentForNewGauge')
      }
      wx.setStorageSync('aiAssistantRecordDraft', draft)

      this.setData({
        visionDraft: draft,
        draftHistory: [],
        pendingDraftFieldKey: this.getNextDraftMissingFieldKey(draft, []),
        skippedDraftFieldKeys: [],
        pendingEquipmentCandidates: [],
        isVisionLoading: false
      })

      this.appendMessages([
        this.createResultMessage(draft),
        this.createTextMessage('assistant', `${TEXT.analysisDone}${TEXT.draftReady}`),
        ...this.buildDraftFollowUpMessages(draft, { includeResultMessage: false })
      ])
    } catch (error) {
      console.error('image analysis failed:', error)
      this.setData({ isVisionLoading: false })
      this.appendMessages([this.createTextMessage('assistant', error.message || TEXT.answers.extractFailed)])
    }
  },

  buildVisionDraft(result, imagePath, previousDraft = null) {
    const previous = previousDraft?.extractedData || {}
    const modelSpec = this.firstValidModelSpec([
      result.modelSpec,
      previous.modelSpec,
      this.extractModelSpecFromRawResult(result)
    ])
    const verificationDate = this.firstValidDate([
      result.verificationDate,
      previous.verificationDate,
      this.extractDateFromRawResult(result)
    ])
    const nextResult = {
      certNo: result.certNo || previous.certNo || '',
      sendUnit: result.sendUnit || previous.sendUnit || '',
      instrumentName: result.instrumentName || previous.instrumentName || '',
      modelSpec,
      factoryNo: result.factoryNo || previous.factoryNo || '',
      manufacturer: result.manufacturer || previous.manufacturer || '',
      verificationStd: result.verificationStd || previous.verificationStd || '',
      conclusion: result.conclusion || previous.conclusion || '',
      verificationDate,
      categoryLabel: result.categoryLabel || previous.categoryLabel || this.inferCategoryLabel(result),
      district: result.district || previous.district || '',
      gaugeStatus: result.gaugeStatus || previous.gaugeStatus || '在用',
      installPhotoPath: result.installPhotoPath || previous.installPhotoPath || '',
      selectedEquipmentId: result.selectedEquipmentId || result.match?.id || previous.selectedEquipmentId || previous.match?.id || '',
      selectedEquipmentName: result.selectedEquipmentName || result.match?.name || previous.selectedEquipmentName || previous.match?.name || ''
    }

    nextResult.match = {
      ...(previous.match || {}),
      ...(result.match || {}),
      id: nextResult.selectedEquipmentId,
      name: nextResult.selectedEquipmentName
    }

    nextResult.expiryDate = nextResult.verificationDate ? calculateExpiryDate(nextResult.verificationDate) : ''

    return {
      imagePath,
      extractedData: nextResult,
      summary: this.buildResultSummary(nextResult, nextResult.categoryLabel, nextResult.selectedEquipmentName),
      fields: this.buildDraftFields(nextResult),
      confidence: Number(result.confidence || previousDraft?.confidence || 0),
      recognitionMeta: result.recognitionMeta || previousDraft?.recognitionMeta || null
    }
  },

  normalizeDisplayModelSpec(value) {
    const text = String(value || '').trim()
    const compact = text.replace(/\s+/g, '').replace(/[/:：/／]+/g, '')
    if (!compact || ['型号', '规格', '型号规格', '规格型号'].includes(compact)) return ''

    const pressure = this.extractPressureRange(text)
    if (pressure) return pressure

    return text
  },

  firstValidModelSpec(values = []) {
    for (const value of values) {
      const normalized = this.normalizeDisplayModelSpec(value)
      if (normalized) return normalized
    }
    return ''
  },

  extractModelSpecFromRawResult(result = {}) {
    const source = [
      result.rawText || '',
      ...(result.lines || []).map((item) => typeof item === 'string' ? item : (item.words || item.text || ''))
    ].filter(Boolean).join('\n')

    if (!source) return ''

    const normalized = source
      .replace(/\r/g, '\n')
      .replace(/：/g, ':')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/[ \t]+/g, ' ')

    const labelMatch = normalized.match(/(?:型\s*号\s*[\/／]?\s*规\s*格|型号规格|规格型号|型号|规格)[:：\s]*([^\n]*)/i)
    if (labelMatch && labelMatch[1]) {
      const fromLabel = this.normalizeDisplayModelSpec(labelMatch[1])
      if (fromLabel) return fromLabel
    }

    return this.extractPressureRange(normalized)
  },

  extractPressureRange(text) {
    const match = String(text || '').match(/([\(（]?\s*\d+(?:\.\d+)?\s*(?:-|~|－|—|–|一|至|到)\s*\d+(?:\.\d+)?\s*[\)）]?\s*(?:k|M|G)?\s*P\s*a)/i)
    if (!match || !match[1]) return ''
    return match[1]
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/[－—–一到至~]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\s*-\s*/g, '-')
      .replace(/([kMG])\s*P\s*a/i, (source, prefix) => `${prefix.toUpperCase()}Pa`)
      .replace(/P\s*a/i, 'Pa')
      .trim()
  },

  firstValidDate(values = []) {
    for (const value of values) {
      const normalized = this.normalizeDateValue(value)
      if (normalized) return normalized
    }
    return ''
  },

  extractDateFromRawResult(result = {}) {
    const source = [
      result.rawText || '',
      ...(result.lines || []).map((item) => typeof item === 'string' ? item : (item.words || item.text || ''))
    ].filter(Boolean).join('\n')

    const normalized = source.replace(/\r/g, '\n')
    const labelMatch = normalized.match(/(?:检定日期|检定日|校准日期)[:：\s]*([^\n]{0,40})/)
    if (labelMatch) {
      const fromLabel = this.normalizeDateValue(labelMatch[1])
      if (fromLabel) return fromLabel
    }

    const lines = normalized.split('\n').filter((line) => !/(有效期|到期|有效至)/.test(line))
    for (const line of lines) {
      const matches = line.matchAll(/(\d{4})\s*(?:年|[.\-/])\s*(\d{1,2})\s*(?:月|[.\-/])\s*(\d{1,2})\s*(?:日)?/g)
      for (const match of matches) {
        const date = this.buildValidDate(match[1], match[2], match[3])
        if (date) return date
      }
    }
    return ''
  },

  normalizeDateValue(value) {
    const text = String(value || '').trim()
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/) ||
      text.match(/(\d{4})\s*(?:年|[.\-/])\s*(\d{1,2})\s*(?:月|[.\-/])\s*(\d{1,2})\s*(?:日)?/)
    if (!match) return ''
    return this.buildValidDate(match[1], match[2], match[3])
  },

  buildValidDate(year, month, day) {
    const y = Number(year)
    const m = Number(month)
    const d = Number(day)
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return ''
    const date = new Date(y, m - 1, d)
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return ''
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  },

  buildDraftFields(result) {
    const fields = []
    const pushField = (key, value) => {
      if (!value || !TEXT.fields[key]) return
      fields.push({ key, label: TEXT.fields[key], value: String(value) })
    }

    pushField('certNo', result.certNo)
    pushField('sendUnit', result.sendUnit)
    pushField('instrumentName', result.instrumentName)
    pushField('modelSpec', result.modelSpec)
    pushField('factoryNo', result.factoryNo)
    pushField('manufacturer', result.manufacturer)
    pushField('verificationStd', result.verificationStd)
    pushField('conclusion', result.conclusion)
    pushField('verificationDate', result.verificationDate)
    pushField('district', result.district)
    pushField('gaugeStatus', result.gaugeStatus)
    pushField('categoryLabel', result.categoryLabel)
    pushField('matchName', result.selectedEquipmentName)

    return fields
  },

  inferCategoryLabel(result) {
    const source = `${result.instrumentName || ''} ${result.modelSpec || ''}`.toLowerCase()
    if (source.includes('压力') || source.includes('pressure') || source.includes('gauge') || source.includes('mpa') || source.includes('kpa')) {
      return '压力表'
    }
    return '通用仪表'
  },

  buildResultSummary(result, categoryLabel, matchName) {
    const certPart = result.certNo ? `证书编号 ${result.certNo}` : '已读取到证书信息'
    const instrumentPart = result.instrumentName ? `仪表名称 ${result.instrumentName}` : '仪表名称待确认'
    const categoryPart = categoryLabel ? `识别为 ${categoryLabel}` : '已完成设备类型判断'

    if (matchName) {
      return `${certPart}，${instrumentPart}，${categoryPart}，“${matchName}”。`
    }

    return `${certPart}，${instrumentPart}，${categoryPart}。`
  },

  getDraftEditConfigs() {
    return [
      { key: 'modelSpec', label: '型号规格', patterns: ['型号规格', '型号', '规格'] },
      { key: 'instrumentName', label: '仪表名称', patterns: ['仪表名称', '仪表名', '表名'] },
      { key: 'factoryNo', label: '出厂编号', patterns: ['出厂编号', '表号'] },
      { key: 'certNo', label: '证书编号', patterns: ['证书编号', '证书号'] },
      { key: 'sendUnit', label: '送检单位', patterns: ['送检单位'] },
      { key: 'manufacturer', label: '制造单位', patterns: ['制造单位', '厂家', '制造厂'] },
      { key: 'verificationStd', label: '检定依据', patterns: ['检定依据', '依据'] },
      { key: 'verificationDate', label: '检定日期', patterns: ['检定日期', '日期'] },
      { key: 'conclusion', label: '检定结论', patterns: ['检定结论', '结论'] },
      { key: 'district', label: '辖区', patterns: ['辖区', '片区'] },
      { key: 'gaugeStatus', label: '压力表状态', patterns: ['压力表状态', '状态'] },
      { key: 'selectedEquipmentName', label: '归档设备', patterns: ['归档设备', '所属设备', '设备归属'] },
      { key: 'categoryLabel', label: '设备分类', patterns: ['设备分类', '分类'] }
    ]
  },

  extractDraftEditValue(question, config) {
    if (!config || !config.patterns.some((pattern) => question.includes(pattern))) return ''

    if (config.key === 'conclusion') {
      if (question.includes('不合格')) return '不合格'
      if (question.includes('合格')) return '合格'
      return ''
    }

    if (config.key === 'gaugeStatus') {
      return DRAFT_STATUS_OPTIONS.find((item) => question.includes(item)) || ''
    }

    if (config.key === 'district') {
      return DRAFT_DISTRICT_OPTIONS.find((item) => question.includes(item)) || ''
    }

    if (config.key === 'verificationDate') {
      const dateMatch = question.match(/(20\d{2})[-\/年](\d{1,2})[-\/月](\d{1,2})/)
      if (!dateMatch) return ''
      return `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`
    }

    const patterns = [
      /(?:改成|改为|修改成|修改为|更新为|设为|填成)\s*["“”']?([^"“”'\n，。；,]+)\s*["“”']?$/,
      /(?:改成|改为|修改成|修改为|更新为|设为|填成)\s*["“”']?(.+?)\s*["“”']?$/
    ]

    for (const pattern of patterns) {
      const match = question.match(pattern)
      if (match && match[1]) {
        return String(match[1]).trim()
      }
    }

    return ''
  },

  splitDraftEditSegments(question) {
    return String(question)
      .split(/，|,|；|;|并且|然后|同时|以及|并/)
      .map((item) => item.trim())
      .filter(Boolean)
  },

  applyDraftEditFromQuestion(question) {
    const configs = this.getDraftEditConfigs()
    const segments = this.splitDraftEditSegments(question)
    const edits = []

    segments.forEach((segment) => {
      const config = configs.find((item) => item.patterns.some((pattern) => segment.includes(pattern)))
      if (!config) return
      const value = this.extractDraftEditValue(segment, config)
      if (!value) return
      const existing = edits.find((item) => item.config.key === config.key)
      if (existing) {
        existing.value = value
        return
      }
      edits.push({ config, value })
    })

    if (!edits.length) {
      this.appendMessages([this.createTextMessage('assistant', TEXT.answers.draftEditFailed)])
      return true
    }

    const currentDraft = this.data.visionDraft
    if (!currentDraft || !currentDraft.extractedData) return false

    const nextResult = { ...currentDraft.extractedData }
    edits.forEach(({ config, value }) => {
      nextResult[config.key] = value
      if (config.key === 'selectedEquipmentName') {
        nextResult.match = {
          ...(nextResult.match || {}),
          name: value
        }
        if (value !== currentDraft.extractedData.selectedEquipmentName) {
          nextResult.selectedEquipmentId = ''
        }
      }
    })

    const summary = edits.map(({ config, value }) => `${config.label}改为“${value}”`).join('，')
    const nextDraft = this.refreshVisionDraft(nextResult, {
      pushHistory: true,
      manuallyEditedFields: edits.map(({ config }) => config.key)
    })

    this.appendMessages(this.buildDraftFollowUpMessages(nextDraft, {
      changeSummary: summary,
      includeResultMessage: true
    }))

    return true
  },

  refreshVisionDraft(nextResult, options = {}) {
    const currentDraft = this.data.visionDraft
    const draft = this.buildVisionDraft(nextResult, currentDraft?.imagePath || '', currentDraft)
    const manuallyEditedFields = Array.isArray(options.manuallyEditedFields)
      ? options.manuallyEditedFields
      : []
    if (manuallyEditedFields.length) {
      const currentMeta = draft.recognitionMeta || {}
      const fieldSources = { ...(currentMeta.fieldSources || {}) }
      const fieldConfidence = { ...(currentMeta.fieldConfidence || {}) }
      manuallyEditedFields.forEach((key) => {
        fieldSources[key] = '用户修正'
        fieldConfidence[key] = 1
      })
      draft.recognitionMeta = {
        ...currentMeta,
        fieldSources,
        fieldConfidence,
        lowConfidenceFields: (currentMeta.lowConfidenceFields || [])
          .filter((key) => !manuallyEditedFields.includes(key))
      }
    }
    const nextSkippedKeys = options.keepSkipped ? (this.data.skippedDraftFieldKeys || []) : []
    wx.setStorageSync('aiAssistantRecordDraft', draft)
    this.setData({
      visionDraft: draft,
      pendingDraftFieldKey: this.getNextDraftMissingFieldKey(draft, nextSkippedKeys),
      skippedDraftFieldKeys: nextSkippedKeys,
      pendingEquipmentCandidates: [],
      draftHistory: options.pushHistory && currentDraft
        ? [...this.data.draftHistory, currentDraft]
        : this.data.draftHistory
    })
    return draft
  },

  buildDraftFollowUpMessages(draft, options = {}) {
    const messages = []
    const missing = this.getDraftMissingFields(draft)
    if (options.includeResultMessage !== false) {
      messages.push(this.createResultMessage(draft))
    }

    if (options.changeSummary) {
      messages.push(this.createTextMessage('assistant', `${TEXT.draftSummaryTitle}${options.changeSummary}。`))
    }

    const draftSummary = this.buildDraftConfirmSummary(draft)
    if (draftSummary && missing.length) {
      messages.push(this.createTextMessage('assistant', draftSummary))
    }

    if (missing.length) {
      const followUpMessages = this.buildDraftMissingFollowUps(draft, missing)
      messages.push(...followUpMessages)
    } else {
      messages.push(this.createTextMessage('assistant', this.buildDraftFinalSummary(draft)))
      messages.push(this.createTextMessage('assistant', TEXT.directSaveReady))
    }

    return messages
  },

  buildDraftConfirmSummary(draft) {
    const data = draft?.extractedData || {}
    const parts = [
      data.certNo ? `证书编号 ${data.certNo}` : '',
      data.factoryNo ? `出厂编号 ${data.factoryNo}` : '',
      data.instrumentName ? `仪表名称 ${data.instrumentName}` : '',
      data.modelSpec ? `型号规格 ${data.modelSpec}` : '',
      data.selectedEquipmentName ? `所属设备 ${data.selectedEquipmentName}` : '',
      data.conclusion ? `检定结论 ${data.conclusion}` : '',
      data.verificationDate ? `检定日期 ${data.verificationDate}` : ''
    ].filter(Boolean)
    if (!parts.length) return ''
    return `当前存档摘要：${parts.join('，')}。`
  },

  buildDraftMissingPrompt(draft) {
    const missing = this.getDraftMissingFields(draft)
    if (!missing.length) return ''

    const lines = missing.map((item) => `- ${item.label}：${item.key === 'installPhotoPath' ? TEXT.installPhotoPrompt : item.prompt}`)
    return `${TEXT.draftMissingPrefix}\n${lines.join('\n')}`
  },

  buildDraftMissingFollowUps(draft, providedMissing = null) {
    const missing = providedMissing || this.getDraftMissingFields(draft)
    if (!missing.length) return []
    const first = missing[0]
    const firstPrompt = first.key === 'installPhotoPath'
      ? '下一步请先补上传安装照片。'
      : `下一步请先补充“${first.label}”。${first.prompt}`
    return [
      this.createTextMessage('assistant', firstPrompt),
      this.createTextMessage('assistant', `当前还剩 ${missing.length} 项待补全。`)
    ]
  },

  buildDraftFinalSummary(draft) {
    const data = draft?.extractedData || {}
    const lines = [
      '最终存档摘要：',
      `- 证书编号：${data.certNo || '未填写'}`,
      `- 出厂编号：${data.factoryNo || '未填写'}`,
      `- 仪表名称：${data.instrumentName || '未填写'}`,
      `- 型号规格：${data.modelSpec || '未填写'}`,
      `- 制造单位：${data.manufacturer || '未填写'}`,
      `- 送检单位：${data.sendUnit || '未填写'}`,
      `- 检定结论：${data.conclusion || '未填写'}`,
      `- 检定日期：${data.verificationDate || '未填写'}`,
      `- 辖区：${data.district || '未填写'}`,
      `- 压力表状态：${data.gaugeStatus || '在用'}`,
      `- 所属设备：${data.selectedEquipmentName || '未填写'}`,
      `- 安装照片：${data.installPhotoPath ? '已上传' : '未上传'}`
    ]
    return lines.join('\n')
  },

  getDraftMissingFields(draft) {
    const data = draft?.extractedData || {}
    const missing = []

    if (!String(data.factoryNo || '').trim()) {
      missing.push({ key: 'factoryNo', label: '出厂编号', prompt: '例如：把出厂编号改成 24013931' })
    }

    if (!String(data.verificationDate || '').trim()) {
      missing.push({ key: 'verificationDate', label: '检定日期', prompt: '例如：把检定日期改成 2026-04-18' })
    }

    if (!String(data.conclusion || '').trim()) {
      missing.push({ key: 'conclusion', label: '检定结论', prompt: '例如：把检定结论改成 合格' })
    }

    if (!String(data.district || '').trim()) {
      missing.push({ key: 'district', label: '辖区', prompt: '例如：把辖区改成 大峃所' })
    }

    if (!String(data.selectedEquipmentName || '').trim()) {
      missing.push({ key: 'selectedEquipmentName', label: '所属设备', prompt: '例如：把所属设备改成 1号反应釜' })
    }

    if ((data.gaugeStatus || '在用') === '在用' && !data.installPhotoPath) {
      missing.push({ key: 'installPhotoPath', label: '安装照片', prompt: '直接说“上传安装照片”即可' })
    }

    return missing
  },

  getNextDraftMissingFieldKey(draft, skippedOverride = null) {
    const skipped = Array.isArray(skippedOverride) ? skippedOverride : (this.data.skippedDraftFieldKeys || [])
    const missing = this.getDraftMissingFields(draft)
    const first = missing.find((item) => !skipped.includes(item.key)) || missing[0]
    return first ? first.key : ''
  },

  getDraftFieldDefinition(fieldKey) {
    const map = {
      factoryNo: { key: 'factoryNo', label: '出厂编号', prompt: '例如：24013931' },
      verificationDate: { key: 'verificationDate', label: '检定日期', prompt: '例如：2026-04-18' },
      conclusion: { key: 'conclusion', label: '检定结论', prompt: '例如：合格' },
      district: { key: 'district', label: '辖区', prompt: '例如：大峃所' },
      selectedEquipmentName: { key: 'selectedEquipmentName', label: '所属设备', prompt: '例如：1号反应釜' },
      installPhotoPath: { key: 'installPhotoPath', label: '安装照片', prompt: '直接说“上传安装照片”即可' }
    }
    return map[fieldKey] || null
  },

  async handlePendingDraftFieldAnswer(question) {
    const field = this.getDraftFieldDefinition(this.data.pendingDraftFieldKey)
    const draft = this.data.visionDraft
    if (!field || !draft?.extractedData) return false

    if (field.key === 'installPhotoPath') {
      this.appendMessages([this.createTextMessage('assistant', '这一项需要你直接上传安装照片。')])
      return true
    }

    const value = this.extractPendingDraftFieldValue(field.key, question)
    if (!value) {
      this.appendMessages([this.createTextMessage('assistant', `我还没识别出“${field.label}”。${field.prompt}`)])
      return true
    }

    if (field.key === 'selectedEquipmentName') {
      return await this.handleEquipmentNameAnswer(value, draft)
    }

    const nextResult = {
      ...(draft.extractedData || {}),
      [field.key]: value
    }

    const nextDraft = this.refreshVisionDraft(nextResult, {
      pushHistory: true,
      manuallyEditedFields: [field.key]
    })
    this.appendMessages(this.buildDraftFollowUpMessages(nextDraft, {
      includeResultMessage: true,
      changeSummary: `${field.label}已补充为“${value}”`
    }))
    return true
  },

  async handleEquipmentNameAnswer(value, draft) {
    const runtime = this.getRuntimeUserOptions()
    const candidates = await equipmentService.searchEquipments(value, {
      enterpriseUser: runtime.enterpriseUser,
      fromAdmin: runtime.fromAdmin,
      district: runtime.district
    })

    if (!candidates.length) {
      this.appendMessages([this.createTextMessage('assistant', `没有找到名称包含“${value}”的设备。请换一个设备名称，或先到设备中心新建设备。`)])
      return true
    }

    if (candidates.length === 1) {
      this.applySelectedEquipmentToDraft(candidates[0], draft, { pushHistory: true })
      return true
    }

    const sliced = candidates.slice(0, 5)
    this.setData({ pendingEquipmentCandidates: sliced })
    this.appendMessages([this.createEquipmentCandidateMessage(sliced)])
    return true
  },

  handleEquipmentCandidateAnswer(question) {
    const text = String(question || '').trim()
    const candidates = this.data.pendingEquipmentCandidates || []
    if (!candidates.length) return false

    const indexMatch = text.match(/\d+/)
    const byIndex = indexMatch ? candidates[Number(indexMatch[0]) - 1] : null
    const byName = candidates.find((item) => text && String(item.equipmentName || '').includes(text))
    const selected = byIndex || byName

    if (!selected) {
      this.appendMessages([this.createTextMessage('assistant', '请回复候选设备的序号，或直接点选其中一台设备。')])
      return true
    }

    this.applySelectedEquipmentToDraft(selected, this.data.visionDraft, { pushHistory: true })
    return true
  },

  selectDraftEquipmentCandidate(e) {
    const item = e.currentTarget.dataset.item
    if (!item || !item.id) return
    const candidates = this.data.pendingEquipmentCandidates || []
    const selected = candidates.find((entry) => entry._id === item.id) || item.raw || item
    this.applySelectedEquipmentToDraft(selected, this.data.visionDraft, { pushHistory: true })
  },

  applySelectedEquipmentToDraft(equipment, draft, options = {}) {
    if (!equipment || !draft?.extractedData) return
    const nextResult = {
      ...(draft.extractedData || {}),
      selectedEquipmentId: equipment._id || '',
      selectedEquipmentName: equipment.equipmentName || '',
      match: {
        ...(draft.extractedData.match || {}),
        id: equipment._id || '',
        name: equipment.equipmentName || ''
      }
    }
    this.setData({
      skippedDraftFieldKeys: [],
      pendingEquipmentCandidates: []
    })
    const nextDraft = this.refreshVisionDraft(nextResult, options)
    this.appendMessages(this.buildDraftFollowUpMessages(nextDraft, {
      includeResultMessage: true,
      changeSummary: `所属设备已选择为“${equipment.equipmentName || ''}”`
    }))
  },

  handleDraftControlQuestion(question) {
    const text = String(question || '').trim()
    if (/(上一项|上一个)/.test(text)) {
      this.undoDraftEdit()
      return true
    }

    if (/(重新填写|重新填|重填)/.test(text)) {
      const field = this.getDraftFieldDefinition(this.data.pendingDraftFieldKey)
      this.appendMessages([this.createTextMessage('assistant', field ? `请重新填写“${field.label}”。${field.prompt}` : '请重新填写当前字段。')])
      return true
    }

    if (/跳过/.test(text)) {
      const currentKey = this.data.pendingDraftFieldKey
      if (!currentKey) return true
      const skipped = Array.from(new Set([...(this.data.skippedDraftFieldKeys || []), currentKey]))
      const missing = this.getDraftMissingFields(this.data.visionDraft)
      const next = missing.find((item) => !skipped.includes(item.key))

      if (!next) {
        this.setData({ skippedDraftFieldKeys: [], pendingDraftFieldKey: currentKey })
        this.appendMessages([this.createTextMessage('assistant', '当前剩余字段都是存档必填项，暂时不能继续跳过。')])
        return true
      }

      this.setData({
        skippedDraftFieldKeys: skipped,
        pendingDraftFieldKey: next.key
      })
      this.appendMessages(this.buildDraftMissingFollowUps(this.data.visionDraft, [next]))
      return true
    }

    return false
  },

  extractPendingDraftFieldValue(fieldKey, question) {
    const text = String(question || '').trim()
    if (!text) return ''

    if (fieldKey === 'factoryNo') {
      const match = text.match(/([A-Za-z0-9\-\/]{2,})/)
      return match && match[1] ? match[1].trim() : ''
    }

    if (fieldKey === 'verificationDate') {
      const match = text.match(/(20\d{2})[-\/年](\d{1,2})[-\/月](\d{1,2})/)
      if (!match) return ''
      return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
    }

    if (fieldKey === 'conclusion') {
      if (text.includes('不合格')) return '不合格'
      if (text.includes('合格')) return '合格'
      return ''
    }

    if (fieldKey === 'district') {
      return DRAFT_DISTRICT_OPTIONS.find((item) => text.includes(item)) || ''
    }

    if (fieldKey === 'selectedEquipmentName') {
      return text
        .replace(/^所属设备[:：]?\s*/, '')
        .replace(/^设备[:：]?\s*/, '')
        .replace(/^(改成|改为|是|叫)\s*/, '')
        .trim()
    }

    return ''
  },

  undoDraftEdit() {
    const history = this.data.draftHistory || []
    const lastDraft = history[history.length - 1]

    if (!lastDraft) {
      this.appendMessages([this.createTextMessage('assistant', TEXT.answers.draftUndoEmpty)])
      return
    }

    wx.setStorageSync('aiAssistantRecordDraft', lastDraft)
    this.setData({
      visionDraft: lastDraft,
      pendingDraftFieldKey: this.getNextDraftMissingFieldKey(lastDraft, []),
      skippedDraftFieldKeys: [],
      pendingEquipmentCandidates: [],
      draftHistory: history.slice(0, -1)
    })

    this.appendMessages([
      this.createResultMessage(lastDraft),
      this.createTextMessage('assistant', '好的，已撤销上一步修改。'),
      ...this.buildDraftFollowUpMessages(lastDraft, { includeResultMessage: false })
    ])
  },

  async handleDirectSaveRequest() {
    const draft = this.data.visionDraft
    if (!draft?.extractedData) return

    const missing = this.getDraftMissingFields(draft)
    if (missing.length) {
      this.setData({ pendingDraftFieldKey: missing[0].key })
      this.appendMessages([
        this.createTextMessage('assistant', TEXT.answers.draftSaveBlocked),
        ...this.buildDraftMissingFollowUps(draft, missing)
      ])
      return
    }

    if ((draft.extractedData.conclusion || '').trim() !== '合格') {
      this.appendMessages([this.createTextMessage('assistant', '仅合格记录可直接存档。')])
      return
    }

    this.setData({ isDirectSaving: true }, () => this.scrollToBottom())

    try {
      const equipment = await this.resolveDraftEquipment(draft)
      if (!equipment?._id) {
        this.setData({ isDirectSaving: false })
        this.appendMessages([this.createTextMessage('assistant', '未匹配所属设备。')])
        return
      }

      const saveResult = await this.saveDraftDirectly(draft, equipment)
      this.setData({
        isDirectSaving: false,
        pendingDraftFieldKey: '',
        skippedDraftFieldKeys: [],
        pendingEquipmentCandidates: [],
        lastCrudContext: saveResult?.recordId
          ? {
            operation: 'create',
            entity: 'pressure_record',
            targetId: saveResult.recordId,
            title: draft.extractedData.factoryNo || draft.extractedData.certNo || '刚保存的记录'
          }
          : this.data.lastCrudContext
      })

      this.appendMessages([
        this.createTextMessage('assistant', TEXT.answers.draftSaveSuccess),
        this.createTextMessage('assistant', `我已将这条识别结果直接存档到设备“${equipment.equipmentName || draft.extractedData.selectedEquipmentName}”。`)
      ])
    } catch (error) {
      console.error('direct save failed:', error)
      this.setData({ isDirectSaving: false })
      this.appendMessages([this.createTextMessage('assistant', error.message || '直接存档失败，请稍后重试。')])
    }
  },

  async handleDraftQuickConfirm() {
    const draft = this.data.visionDraft
    if (!draft?.extractedData) return

    const missing = this.getDraftMissingFields(draft)
    if (missing.length) {
      this.setData({ pendingDraftFieldKey: missing[0].key })
      const missingFollowUps = this.buildDraftMissingFollowUps(draft, missing)
      this.appendMessages(missingFollowUps)
      return
    }

    await this.handleDirectSaveRequest()
  },

  async resolveDraftEquipment(draft) {
    const data = draft?.extractedData || {}
    if (data.selectedEquipmentId) {
      try {
        const equipment = await equipmentService.getEquipmentById(data.selectedEquipmentId)
        if (equipment) return equipment
      } catch (error) {}
    }

    const keyword = String(data.selectedEquipmentName || data.match?.name || '').trim()
    if (!keyword) return null

    const runtime = this.getRuntimeUserOptions()
    const list = await equipmentService.searchEquipments(keyword, {
      enterpriseUser: runtime.enterpriseUser,
      fromAdmin: runtime.fromAdmin,
      district: runtime.district
    })
    const exact = list.find((item) => item.equipmentName === keyword) || list[0]
    if (!exact) return null

    const nextResult = {
      ...data,
      selectedEquipmentId: exact._id,
      selectedEquipmentName: exact.equipmentName,
      match: {
        ...(data.match || {}),
        id: exact._id,
        name: exact.equipmentName
      }
    }
    this.refreshVisionDraft(nextResult, { pushHistory: false })
    return exact
  },

  async ensureGaugeForDraft({ equipmentId, equipmentName, recordData }) {
    const factoryNo = String(recordData.factoryNo || '').trim()
    if (!factoryNo) throw new Error('缺少出厂编号，无法生成压力表档案。')

    const runtime = this.getRuntimeUserOptions()
    const wantedStatus = recordData.gaugeStatus || '在用'
    const devices = await deviceService.loadDevices(runtime)
    const existed = devices.find((item) => item.equipmentId === equipmentId && item.factoryNo === factoryNo)
    if (existed) return existed

    return deviceService.createDevice({
      deviceName: recordData.instrumentName || '压力表',
      factoryNo,
      manufacturer: recordData.manufacturer || '',
      modelSpec: recordData.modelSpec || '',
      equipmentId,
      equipmentName,
      status: wantedStatus
    }, {
      enterpriseUser: runtime.enterpriseUser,
      fromAdmin: runtime.fromAdmin,
      district: recordData.district || runtime.district
    })
  },

  async saveDraftDirectly(draft, equipment) {
    const runtime = this.getRuntimeUserOptions()
    if (!runtime.enterpriseUser || (!runtime.fromAdmin && !runtime.enterpriseUser.companyName)) {
      throw new Error('请先登录后再存档。')
    }

    const formData = {
      certNo: draft.extractedData.certNo || '',
      sendUnit: draft.extractedData.sendUnit || '',
      instrumentName: draft.extractedData.instrumentName || '',
      modelSpec: draft.extractedData.modelSpec || '',
      factoryNo: draft.extractedData.factoryNo || '',
      manufacturer: draft.extractedData.manufacturer || '',
      verificationStd: draft.extractedData.verificationStd || '',
      conclusion: draft.extractedData.conclusion || '',
      verificationDate: draft.extractedData.verificationDate || '',
      district: draft.extractedData.district || '',
      ocrSource: 'ai_assistant',
      expiryDate: draft.extractedData.verificationDate ? calculateExpiryDate(draft.extractedData.verificationDate) : ''
    }

    const formValidation = formValidator.validateRecordForm(formData)
    if (!formValidation.valid) throw new Error(formValidation.errors[0])

    const imageValidation = formValidator.validateImageUpload(draft.imagePath, draft.extractedData.installPhotoPath || '', 'manual', draft.extractedData.gaugeStatus || '在用')
    if (!imageValidation.valid) throw new Error(imageValidation.errors[0])

    const gauge = await this.ensureGaugeForDraft({
      equipmentId: equipment._id,
      equipmentName: equipment.equipmentName,
      recordData: {
        ...formData,
        gaugeStatus: draft.extractedData.gaugeStatus || '在用'
      }
    })

    const result = await recordService.saveRecord(formData, {
      imagePath: draft.imagePath,
      installPhotoPath: draft.extractedData.installPhotoPath || '',
      fromAdmin: runtime.fromAdmin,
      enterpriseUser: runtime.enterpriseUser,
      selectedDeviceId: gauge._id
    })

    await deviceService.updateRecordCount(gauge._id)
    return { gaugeId: gauge._id, recordId: result._id }
  },

  previewChatImage(e) {
    const { imagePath } = e.currentTarget.dataset
    if (!imagePath) return
    wx.previewImage({ urls: [imagePath], current: imagePath })
  },

  goToDraftConfirm() {
    if (!this.data.visionDraft) {
      wx.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }
    wx.setStorageSync('aiAssistantRecordDraft', this.data.visionDraft)
    wx.navigateTo({ url: '/pages/camera/camera' })
  },

  goToManualEntry() {
    wx.navigateTo({ url: '/pages/camera/camera?tab=manual' })
  },

  scrollToBottom() {
    setTimeout(() => {
      let anchor = ''
      if (this.data.isVisionLoading) {
        anchor = 'msg-vision-loading'
      } else if (this.data.isCrudExecuting) {
        anchor = 'msg-crud-executing'
      } else if (this.data.isDirectSaving) {
        anchor = 'msg-direct-saving'
      } else if (this.data.isLoading) {
        anchor = 'msg-loading'
      }

      const lastMessage = this.data.messages[this.data.messages.length - 1]
      this.setData({
        scrollToView: anchor || `msg-${lastMessage?.id || 'tail'}`
      })
    }, 80)
  },

  formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  },

  onShareAppMessage() {
    return {
      title: TEXT.shareTitle,
      path: '/pages/ai-assistant/ai-assistant'
    }
  }
})


