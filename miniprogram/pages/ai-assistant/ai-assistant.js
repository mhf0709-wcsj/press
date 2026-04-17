const ocrService = require('../../services/ocr-service')
const aiExtractService = require('../../services/ai-extract-service')

const TEXT = {
  heroTopline: '\u667a\u80fd\u7ba1\u5bb6\u9996\u9875',
  heroTitle: 'AI\u667a\u80fd\u7ba1\u5bb6',
  heroDesc: '\u5728\u8fd9\u91cc\u76f4\u63a5\u5411 AI \u7ba1\u5bb6\u63d0\u95ee\uff0c\u6216\u4e0a\u4f20\u538b\u529b\u8868\u7167\u7247\uff0c\u7528\u5bf9\u8bdd\u65b9\u5f0f\u5b8c\u6210\u8bc6\u522b\u3001\u5efa\u6863\u548c\u95ee\u7b54\u3002',
  guest: '\u8bbf\u5ba2',
  emptyChatTitle: '\u7b49\u4f60\u5f00\u59cb\u5bf9\u8bdd',
  emptyChatDesc: '\u70b9\u201c\u4e0a\u4f20\u7167\u7247\u201d\uff0cAI \u7ba1\u5bb6\u5c31\u4f1a\u5f00\u59cb\u5f15\u5bfc\u4f60\u8fdb\u884c\u8bc6\u522b\u3001\u5f55\u5165\u6216\u53f0\u8d26\u64cd\u4f5c\u3002',
  loadingAnswer: 'AI \u7ba1\u5bb6\u6b63\u5728\u6574\u7406\u7b54\u6848...',
  planningAction: 'AI \u7ba1\u5bb6\u6b63\u5728\u7406\u89e3\u4f60\u7684\u64cd\u4f5c\u8bf7\u6c42...',
  executingAction: 'AI \u7ba1\u5bb6\u6b63\u5728\u6267\u884c\u64cd\u4f5c...',
  uploadCta: '\u4e0a\u4f20\u7167\u7247',
  uploadAgain: '\u91cd\u65b0\u4e0a\u4f20',
  confirmDraft: '\u53bb\u786e\u8ba4\u5e76\u4fdd\u5b58',
  confirmExecute: '\u786e\u8ba4\u6267\u884c',
  cancelExecute: '\u53d6\u6d88',
  useThisOne: '\u5c31\u9009\u8fd9\u6761',
  operationResultTitle: '\u64cd\u4f5c\u7ed3\u679c',
  candidateTitle: '\u5019\u9009\u8bb0\u5f55',
  inputPlaceholder: '\u7ee7\u7eed\u5411 AI \u7ba1\u5bb6\u63d0\u95ee\uff0c\u6216\u8005\u76f4\u63a5\u4e0a\u4f20\u538b\u529b\u8868\u7167\u7247',
  send: '\u53d1\u9001',
  composerTip: '\u5bf9\u8bdd\u53ef\u7528\u4e8e\u8bc6\u522b\u5efa\u6863\u3001\u77e5\u8bc6\u95ee\u7b54\u548c\u53f0\u8d26\u64cd\u4f5c\uff0c\u6d89\u53ca\u68c0\u5b9a\u7ed3\u8bba\u8bf7\u4ee5\u6b63\u5f0f\u8bb0\u5f55\u4e3a\u51c6\u3002',
  me: '\u6211',
  uploadPrompt: '\u8bf7\u4e0a\u4f20\u538b\u529b\u8868\u68c0\u5b9a\u8bc1\u4e66\u6216\u4eea\u8868\u7167\u7247\uff0c\u6211\u4f1a\u5148\u5e2e\u4f60\u8bc6\u522b\u5173\u952e\u4fe1\u606f\uff0c\u518d\u81ea\u52a8\u5224\u65ad\u8bbe\u5907\u5206\u7c7b\u3002',
  uploadReceived: '\u6211\u5df2\u6536\u5230\u56fe\u7247\uff0c\u6b63\u5728\u5206\u6790\u8bc1\u4e66\u5185\u5bb9\u548c\u8bbe\u5907\u5f52\u5c5e...',
  analysisDone: '\u6211\u5df2\u7ecf\u5b8c\u6210\u8fd9\u5f20\u56fe\u7247\u7684\u5206\u6790\uff0c\u4f60\u53ef\u4ee5\u76f4\u63a5\u53bb\u786e\u8ba4\u5e76\u5b58\u6863\u3002',
  draftReady: '\u5df2\u7ecf\u5e2e\u4f60\u51c6\u5907\u597d\u5efa\u6863\u8349\u7a3f',
  extractionTitle: '\u672c\u6b21\u8bc6\u522b\u7ed3\u679c',
  fields: {
    certNo: '\u8bc1\u4e66\u7f16\u53f7',
    sendUnit: '\u9001\u68c0\u5355\u4f4d',
    instrumentName: '\u4eea\u8868\u540d\u79f0',
    modelSpec: '\u578b\u53f7\u89c4\u683c',
    factoryNo: '\u51fa\u5382\u7f16\u53f7',
    manufacturer: '\u5236\u9020\u5355\u4f4d',
    verificationStd: '\u68c0\u5b9a\u4f9d\u636e',
    conclusion: '\u68c0\u5b9a\u7ed3\u8bba',
    verificationDate: '\u68c0\u5b9a\u65e5\u671f',
    categoryLabel: '\u8bbe\u5907\u5206\u7c7b',
    matchName: '\u5f52\u6863\u8bbe\u5907'
  },
  answers: {
    fallback: '\u62b1\u6b49\uff0c\u6211\u6682\u65f6\u65e0\u6cd5\u56de\u7b54\u8fd9\u4e2a\u95ee\u9898\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002',
    network: '\u7f51\u7edc\u8fde\u63a5\u51fa\u73b0\u95ee\u9898\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002',
    extractFailed: '\u56fe\u7247\u5206\u6790\u5931\u8d25\uff0c\u4f60\u53ef\u4ee5\u91cd\u65b0\u4e0a\u4f20\u4e00\u5f20\u66f4\u6e05\u6670\u7684\u7167\u7247\u3002',
    executeCancelled: '\u597d\u7684\uff0c\u6211\u5df2\u53d6\u6d88\u8fd9\u6b21\u64cd\u4f5c\u3002',
    executeFailed: '\u8fd9\u6b21\u64cd\u4f5c\u6ca1\u6709\u6267\u884c\u6210\u529f\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
  },
  shareTitle: 'AI\u667a\u80fd\u7ba1\u5bb6 - \u5bf9\u8bdd\u5f0f\u5efa\u6863'
}

Page({
  data: {
    text: TEXT,
    messages: [],
    inputValue: '',
    isLoading: false,
    isVisionLoading: false,
    isCrudExecuting: false,
    scrollToView: '',
    userInfo: null,
    userType: 'guest',
    userScope: TEXT.guest,
    visionDraft: null,
    pendingCrudPlan: null
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
        userScope: isDistrictAdmin ? `${adminUser.district}\u8f96\u533a\u7ba1\u7406\u5458` : '\u603b\u7ba1\u7406\u5458'
      }
    }

    if (enterpriseUser) {
      return {
        userType: 'enterprise',
        userInfo: enterpriseUser,
        userScope: enterpriseUser.companyName || '\u4f01\u4e1a\u7528\u6237'
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
        this.createTextMessage('assistant', '\u4f60\u4e5f\u53ef\u4ee5\u76f4\u63a5\u5411\u6211\u63d0\u95ee\uff0c\u6216\u8005\u8bf4\u201c\u5e2e\u6211\u67e5\u4e00\u4e0b\u67d0\u5757\u538b\u529b\u8868\u201d\u3001\u201c\u628a\u67d0\u6761\u8bb0\u5f55\u6539\u6210\u5408\u683c\u201d\uff0c\u6211\u4f1a\u6309\u5bf9\u8bdd\u65b9\u5f0f\u5e2e\u4f60\u5904\u7406\u3002')
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
      items: Array.isArray(plan.items) ? plan.items : []
    }
  },

  createCrudConfirmMessage(plan) {
    return {
      ...this.createBaseMessage('assistant', 'crud_confirm'),
      title: plan.entityLabel || TEXT.operationResultTitle,
      content: plan.answer || TEXT.answers.fallback,
      items: Array.isArray(plan.items) ? plan.items : [],
      payload: plan.payload || null
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
      payloadBase: plan.payloadBase || null
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
    return /(查|查询|查找|找出|列出|搜索|看看|修改|改成|改为|更新|变更|新增|创建|录入|添加|删除|移除|作废)/.test(question)
  },

  async onSend() {
    const question = this.data.inputValue.trim()
    if (!question || this.data.isLoading || this.data.isVisionLoading || this.data.isCrudExecuting) return

    this.setData({
      messages: [...this.data.messages, this.createTextMessage('user', question)],
      inputValue: '',
      isLoading: true
    }, () => this.scrollToBottom())

    const normalized = question.toLowerCase()
    if (
      normalized.includes('\u4e0a\u4f20') ||
      normalized.includes('\u7167\u7247') ||
      normalized.includes('\u8bc1\u4e66') ||
      normalized.includes('photo') ||
      normalized.includes('image')
    ) {
      this.setData({ isLoading: false })
      this.appendMessages([this.createTextMessage('assistant', TEXT.uploadPrompt)])
      return
    }

    try {
      if (this.looksLikeCrudQuestion(question)) {
        const crudPlan = await this.requestCrudPlan(question)
        const crudMessage = this.buildCrudMessage(crudPlan)

        if (crudMessage) {
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
              : null
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

    if (plan.mode === 'result') {
      return this.createCrudResultMessage(plan)
    }

    if (plan.mode === 'confirm' && plan.payload) {
      return this.createCrudConfirmMessage(plan)
    }

    if (plan.mode === 'select' && Array.isArray(plan.items) && plan.items.length) {
      return this.createCrudSelectMessage(plan)
    }

    if (plan.mode === 'collect') {
      return this.createTextMessage('assistant', plan.answer || TEXT.answers.fallback)
    }

    return null
  },

  async confirmCrudExecution() {
    const payload = this.data.pendingCrudPlan?.payload
    if (!payload || this.data.isCrudExecuting) return

    this.setData({
      isCrudExecuting: true
    }, () => this.scrollToBottom())

    try {
      const result = await this.requestCrudExecute(payload)
      this.setData({
        messages: [...this.data.messages, this.createTextMessage('assistant', result.answer || TEXT.answers.fallback)],
        isCrudExecuting: false,
        pendingCrudPlan: null
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
    this.setData({
      pendingCrudPlan: null
    })
    this.appendMessages([this.createTextMessage('assistant', TEXT.answers.executeCancelled)])
  },

  selectCrudItem(e) {
    const item = e.currentTarget.dataset.item
    const payloadBase = e.currentTarget.dataset.payloadBase || {}
    if (!item || !item.id || !payloadBase.operation || !payloadBase.entity) return

    const answer = payloadBase.operation === 'delete'
      ? `\u6211\u51c6\u5907\u5220\u9664\u300c${item.title}\u300d\uff0c\u662f\u5426\u786e\u8ba4\uff1f`
      : `\u6211\u51c6\u5907\u5bf9\u300c${item.title}\u300d\u6267\u884c\u8fd9\u6b21\u64cd\u4f5c\uff0c\u662f\u5426\u786e\u8ba4\uff1f`

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
      pendingCrudPlan: nextPlan
    })

    this.appendMessages([this.createCrudConfirmMessage(nextPlan)])
  },

  getEntityLabel(entity) {
    if (entity === 'device') return '\u538b\u529b\u8868'
    if (entity === 'equipment') return '\u8bbe\u5907'
    return '\u68c0\u5b9a\u8bb0\u5f55'
  },

  startVisionFlow() {
    this.appendMessages([this.createTextMessage('assistant', TEXT.uploadPrompt)])
    this.onUploadVisionImage()
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
      console.error('Select image failed:', error)
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
        isVisionLoading: false
      })

      this.appendMessages([
        this.createResultMessage(draft),
        this.createTextMessage('assistant', `${TEXT.analysisDone}${TEXT.draftReady}`)
      ])
    } catch (error) {
      console.error('Image analysis failed:', error)
      this.setData({ isVisionLoading: false })
      this.appendMessages([this.createTextMessage('assistant', error.message || TEXT.answers.extractFailed)])
    }
  },

  buildVisionDraft(result, imagePath) {
    const fields = []
    const pushField = (key, value) => {
      if (!value || !TEXT.fields[key]) return
      fields.push({
        key,
        label: TEXT.fields[key],
        value: String(value)
      })
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

    const categoryLabel = result.categoryLabel || this.inferCategoryLabel(result)
    const matchName = result.match?.name || ''
    pushField('categoryLabel', categoryLabel)
    pushField('matchName', matchName)

    return {
      imagePath,
      extractedData: result,
      summary: this.buildResultSummary(result, categoryLabel, matchName),
      fields
    }
  },

  inferCategoryLabel(result) {
    const source = `${result.instrumentName || ''} ${result.modelSpec || ''}`.toLowerCase()
    if (
      source.includes('\u538b\u529b') ||
      source.includes('pressure') ||
      source.includes('gauge') ||
      source.includes('mpa') ||
      source.includes('kpa')
    ) {
      return '\u538b\u529b\u8868'
    }
    return '\u901a\u7528\u4eea\u8868'
  },

  buildResultSummary(result, categoryLabel, matchName) {
    const certPart = result.certNo ? `\u8bc1\u4e66\u7f16\u53f7 ${result.certNo}` : '\u5df2\u8bfb\u53d6\u5230\u8bc1\u4e66\u4fe1\u606f'
    const instrumentPart = result.instrumentName ? `\u4eea\u8868\u540d\u79f0 ${result.instrumentName}` : '\u4eea\u8868\u540d\u79f0\u5f85\u786e\u8ba4'
    const categoryPart = categoryLabel ? `\u8bc6\u522b\u4e3a ${categoryLabel}` : '\u5df2\u5b8c\u6210\u8bbe\u5907\u7c7b\u578b\u5224\u65ad'

    if (matchName) {
      return `${certPart}\uff0c${instrumentPart}\uff0c${categoryPart}\uff0c\u5efa\u8bae\u5f52\u6863\u5230\u201c${matchName}\u201d\u3002`
    }

    return `${certPart}\uff0c${instrumentPart}\uff0c${categoryPart}\uff0c\u4f60\u53ef\u4ee5\u7ee7\u7eed\u53bb\u786e\u8ba4\u5e76\u8865\u5168\u8bbe\u5907\u5f52\u5c5e\u3002`
  },

  previewChatImage(e) {
    const { imagePath } = e.currentTarget.dataset
    if (!imagePath) return
    wx.previewImage({ urls: [imagePath], current: imagePath })
  },

  goToDraftConfirm() {
    if (!this.data.visionDraft) {
      wx.showToast({
        title: '\u8bf7\u5148\u4e0a\u4f20\u56fe\u7247',
        icon: 'none'
      })
      return
    }

    wx.setStorageSync('aiAssistantRecordDraft', this.data.visionDraft)
    wx.navigateTo({
      url: '/pages/camera/camera'
    })
  },

  scrollToBottom() {
    setTimeout(() => {
      let anchor = ''
      if (this.data.isVisionLoading) {
        anchor = 'msg-vision-loading'
      } else if (this.data.isCrudExecuting) {
        anchor = 'msg-crud-executing'
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
