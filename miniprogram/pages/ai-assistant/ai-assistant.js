
const ocrService = require('../../services/ocr-service')
const aiExtractService = require('../../services/ai-extract-service')
const recordService = require('../../services/record-service')
const deviceService = require('../../services/device-service')
const equipmentService = require('../../services/equipment-service')
const formValidator = require('../../utils/form-validator')
const { calculateExpiryDate } = require('../../utils/helpers/date')

const DRAFT_STATUS_OPTIONS = ['在用', '备用', '送检', '停用', '报废']
const DRAFT_DISTRICT_OPTIONS = ['大峃所', '珊溪所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所']

const TEXT = {
  heroTopline: '智能管家首页',
  heroTitle: 'AI智能管家',
  heroDesc: '在这里直接向 AI 管家提问，或上传压力表照片，用对话方式完成识别、建档和问答。',
  guest: '访客',
  emptyChatTitle: '等你开始对话',
  emptyChatDesc: '点“上传照片”，AI 管家就会开始引导你进行识别、录入或台账操作。',
  loadingAnswer: 'AI 管家正在整理答案...',
  executingAction: 'AI 管家正在执行操作...',
  savingDraft: 'AI 管家正在直接存档...',
  uploadCta: '上传照片',
  uploadAgain: '重新上传',
  manualEntry: '手动录入',
  confirmDraft: '去确认并保存',
  confirmExecute: '确认执行',
  cancelExecute: '取消',
  useThisOne: '就选这条',
  debugToggle: '查看排查信息',
  debugCollapse: '收起排查信息',
  operationResultTitle: '操作结果',
  candidateTitle: '候选记录',
  inputPlaceholder: '继续向 AI 管家提问，或者直接上传压力表照片',
  send: '发送',
  composerTip: '对话可用于识别建档、知识问答和台账操作，涉及检定结论请以正式记录为准。',
  me: '我',
  uploadPrompt: '请上传压力表检定证书或仪表照片，我会先帮你识别关键信息，再自动判断设备分类。',
  uploadReceived: '我已收到图片，正在分析证书内容和设备归属...',
  analysisDone: '我已经完成这张图片的分析。',
  draftReady: '已经帮你准备好建档草稿。',
  draftEditHint: '你也可以直接对我说：“把这个仪表的型号改成 Y-100”，我会先帮你修改当前识别草稿。',
  draftMissingPrefix: '当前还有这些关键信息需要你补全：',
  draftSummaryTitle: '待你确认的变更摘要：',
  directSaveReady: '如果这些信息已经正确，你可以直接对我说“确认保存”，我会直接存档。',
  installPhotoPrompt: '如果压力表状态是“在用”，还需要再上传一张安装照片。你可以直接对我说“上传安装照片”。',
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
  shareTitle: 'AI智能管家 - 对话式建档'
}

Page({
  data: {
    text: TEXT,
    messages: [],
    inputValue: '',
    isLoading: false,
    isVisionLoading: false,
    isCrudExecuting: false,
    isDirectSaving: false,
    scrollToView: '',
    debugExpandedMap: {},
    userInfo: null,
    userType: 'guest',
    userScope: TEXT.guest,
    visionDraft: null,
    draftHistory: [],
    pendingCrudPlan: null,
    lastCrudContext: null
  },

  async onLoad() {
    await this.bootstrap()
    this.ensureGuideConversation()
  },

  async onShow() {
    await this.bootstrap()
    this.ensureGuideConversation()
  },

  onPullDownRefresh() {
    this.bootstrap()
      .then(() => this.ensureGuideConversation())
      .finally(() => wx.stopPullDownRefresh())
  },

  async bootstrap() {
    this.setData(this.resolveUserProfile())
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
        this.createTextMessage('assistant', '你也可以直接向我提问，或者说“帮我查一下某块压力表”“把某条记录改成合格”，我会按对话方式帮你处理。')
      ]
    }, () => this.scrollToBottom())
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

  createResultMessage(result) {
    return {
      ...this.createBaseMessage('assistant', 'result'),
      title: TEXT.extractionTitle,
      summary: result.summary,
      fields: result.fields,
      imagePath: result.imagePath
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

  async requestCrudPlan(question) {
    const res = await wx.cloud.callFunction({
      name: 'aiAssistant',
      data: {
        action: 'crudPlan',
        question,
        userType: this.getCloudUserType(),
        userInfo: this.data.userInfo
      }
    })
    return res.result || {}
  },

  async requestCrudExecute(payload) {
    const res = await wx.cloud.callFunction({
      name: 'aiAssistant',
      data: {
        action: 'crudExecute',
        payload,
        userType: this.getCloudUserType(),
        userInfo: this.data.userInfo
      }
    })
    return res.result || {}
  },

  looksLikeCrudQuestion(question) {
    return /(查|查询|查找|搜索|看看|列出|找出|修改|改成|改为|更新|变更|新增|创建|录入|添加|删除|移除|作废)/.test(question)
  },

  looksLikeDraftUndoQuestion(question) {
    return !!this.data.visionDraft && /(撤销|恢复上一步|撤回上一步|回退上一步)/.test(question)
  },

  looksLikeDraftSaveQuestion(question) {
    return !!this.data.visionDraft && /(确认保存|确认存档|直接保存|就这样保存|去保存|去确认并保存)/.test(question)
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
          userType: this.getCloudUserType(),
          userInfo: this.data.userInfo
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

    this.setData({ isCrudExecuting: true }, () => this.scrollToBottom())

    try {
      const result = await this.requestCrudExecute(payload)
      this.setData({
        messages: [...this.data.messages, this.createTextMessage('assistant', result.answer || TEXT.answers.fallback)],
        isCrudExecuting: false,
        pendingCrudPlan: null,
        lastCrudContext: {
          entity: payload.entity,
          targetId: payload.targetId,
          title: this.data.pendingCrudPlan?.items?.[0]?.title || ''
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

    this.setData({ isCrudExecuting: true }, () => this.scrollToBottom())
    try {
      const result = await this.requestCrudExecute(payload)
      this.setData({
        isCrudExecuting: false,
        lastCrudContext: {
          ...context,
          entity: payload.entity,
          targetId: payload.targetId
        }
      })
      this.appendMessages([this.createTextMessage('assistant', result.answer || '好的，已进行修改。')])
      return true
    } catch (error) {
      console.error('context crud failed:', error)
      this.setData({ isCrudExecuting: false })
      this.appendMessages([this.createTextMessage('assistant', error.message || TEXT.answers.executeFailed)])
      return true
    }
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
      const imagePath = await ocrService.chooseImage()
      if (!imagePath) return

      this.appendMessages([
        this.createImageMessage(imagePath),
        this.createTextMessage('assistant', TEXT.uploadReceived)
      ])

      await this.processVisionImage(imagePath)
    } catch (error) {
      console.error('select image failed:', error)
    }
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

      const draft = this.buildVisionDraft(result, imagePath)
      wx.setStorageSync('aiAssistantRecordDraft', draft)

      this.setData({
        visionDraft: draft,
        draftHistory: [],
        isVisionLoading: false
      })

      this.appendMessages([
        this.createResultMessage(draft),
        this.createTextMessage('assistant', `${TEXT.analysisDone}${TEXT.draftReady}`),
        this.createTextMessage('assistant', TEXT.draftEditHint),
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
    const nextResult = {
      certNo: result.certNo || previous.certNo || '',
      sendUnit: result.sendUnit || previous.sendUnit || '',
      instrumentName: result.instrumentName || previous.instrumentName || '',
      modelSpec: result.modelSpec || previous.modelSpec || '',
      factoryNo: result.factoryNo || previous.factoryNo || '',
      manufacturer: result.manufacturer || previous.manufacturer || '',
      verificationStd: result.verificationStd || previous.verificationStd || '',
      conclusion: result.conclusion || previous.conclusion || '',
      verificationDate: result.verificationDate || previous.verificationDate || '',
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
      fields: this.buildDraftFields(nextResult)
    }
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
      return `${certPart}，${instrumentPart}，${categoryPart}，建议归档到“${matchName}”。`
    }

    return `${certPart}，${instrumentPart}，${categoryPart}，你可以继续补全辖区、所属设备等信息。`
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
    const nextDraft = this.refreshVisionDraft(nextResult, { pushHistory: true })

    this.appendMessages(this.buildDraftFollowUpMessages(nextDraft, {
      changeSummary: summary,
      includeResultMessage: true
    }))

    return true
  },

  refreshVisionDraft(nextResult, options = {}) {
    const currentDraft = this.data.visionDraft
    const draft = this.buildVisionDraft(nextResult, currentDraft?.imagePath || '', currentDraft)
    wx.setStorageSync('aiAssistantRecordDraft', draft)
    this.setData({
      visionDraft: draft,
      draftHistory: options.pushHistory && currentDraft
        ? [...this.data.draftHistory, currentDraft]
        : this.data.draftHistory
    })
    return draft
  },

  buildDraftFollowUpMessages(draft, options = {}) {
    const messages = []
    if (options.includeResultMessage !== false) {
      messages.push(this.createResultMessage(draft))
    }

    if (options.changeSummary) {
      messages.push(this.createTextMessage('assistant', `${TEXT.draftSummaryTitle}${options.changeSummary}。`))
    }

    const missingPrompt = this.buildDraftMissingPrompt(draft)
    if (missingPrompt) {
      messages.push(this.createTextMessage('assistant', missingPrompt))
    } else {
      messages.push(this.createTextMessage('assistant', TEXT.directSaveReady))
    }

    return messages
  },

  buildDraftMissingPrompt(draft) {
    const missing = this.getDraftMissingFields(draft)
    if (!missing.length) return ''

    const lines = missing.map((item) => `- ${item.label}：${item.key === 'installPhotoPath' ? TEXT.installPhotoPrompt : item.prompt}`)
    return `${TEXT.draftMissingPrefix}\n${lines.join('\n')}`
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
      this.appendMessages([
        this.createTextMessage('assistant', TEXT.answers.draftSaveBlocked),
        this.createTextMessage('assistant', this.buildDraftMissingPrompt(draft))
      ])
      return
    }

    if ((draft.extractedData.conclusion || '').trim() !== '合格') {
      this.appendMessages([this.createTextMessage('assistant', '当前仅支持检定结论为“合格”的压力表直接存档。你可以把检定结论改成“合格”，或者继续走人工确认。')])
      return
    }

    this.setData({ isDirectSaving: true }, () => this.scrollToBottom())

    try {
      const equipment = await this.resolveDraftEquipment(draft)
      if (!equipment?._id) {
        this.setData({ isDirectSaving: false })
        this.appendMessages([this.createTextMessage('assistant', '我还没能匹配到所属设备。你可以直接说“把所属设备改成 XXX”，或者继续去确认页处理。')])
        return
      }

      const saveResult = await this.saveDraftDirectly(draft, equipment)
      this.setData({
        isDirectSaving: false,
        lastCrudContext: saveResult?.recordId
          ? {
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
    const db = wx.cloud.database()
    const existed = await db.collection('devices')
      .where({ equipmentId, factoryNo })
      .limit(1)
      .get()

    if (existed.data && existed.data[0]) {
      return existed.data[0]
    }

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


