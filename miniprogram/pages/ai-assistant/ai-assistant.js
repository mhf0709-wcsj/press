const ocrService = require('../../services/ocr-service')
const aiExtractService = require('../../services/ai-extract-service')

const TEXT = {
  heroTopline: '\u667a\u80fd\u7ba1\u5bb6\u9996\u9875',
  heroTitle: '\u0041\u0049\u667a\u80fd\u7ba1\u5bb6',
  heroDesc: '\u5728\u8fd9\u91cc\u76f4\u63a5\u5411 AI \u7ba1\u5bb6\u63d0\u95ee\uff0c\u6216\u4e0a\u4f20\u538b\u529b\u8868\u7167\u7247\uff0c\u7528\u5bf9\u8bdd\u65b9\u5f0f\u5b8c\u6210\u8bc6\u522b\u3001\u5efa\u6863\u548c\u95ee\u7b54\u3002',
  currentIdentity: '\u5f53\u524d\u8eab\u4efd',
  guest: '\u8bbf\u5ba2',
  sectionQuestionTitle: '\u5e38\u7528\u63d0\u95ee',
  sectionQuestionSubtitle: '\u5feb\u901f\u95ee AI\uff0c\u4e5f\u53ef\u4ee5\u8ba9 AI \u4e3b\u52a8\u5f15\u5bfc\u4f60\u4e0a\u4f20\u56fe\u7247',
  sectionChatTitle: '\u5bf9\u8bdd\u533a',
  sectionChatSubtitle: '\u4f60\u53ef\u4ee5\u5728\u8fd9\u91cc\u63d0\u95ee\uff0c\u6216\u8005\u8ba9 AI \u5f15\u5bfc\u4f60\u4e0a\u4f20\u56fe\u7247\u8fdb\u884c\u5efa\u6863',
  emptyChatTitle: '\u7b49\u4f60\u5f00\u59cb\u5bf9\u8bdd',
  emptyChatDesc: '\u70b9\u201c\u4e0a\u4f20\u7167\u7247\u201d\uff0cAI \u7ba1\u5bb6\u5c31\u4f1a\u5f00\u59cb\u5f15\u5bfc\u4f60\u8fdb\u884c\u8bc6\u522b\u548c\u5f55\u5165\u3002',
  loadingAnswer: 'AI \u7ba1\u5bb6\u6b63\u5728\u6574\u7406\u7b54\u6848...',
  uploadCta: '\u4e0a\u4f20\u7167\u7247',
  uploadAgain: '\u91cd\u65b0\u4e0a\u4f20',
  confirmDraft: '\u53bb\u786e\u8ba4\u5e76\u4fdd\u5b58',
  inputPlaceholder: '\u7ee7\u7eed\u5411 AI \u7ba1\u5bb6\u63d0\u95ee\uff0c\u6216\u8005\u76f4\u63a5\u4e0a\u4f20\u538b\u529b\u8868\u7167\u7247',
  send: '\u53d1\u9001',
  composerTip: '\u5bf9\u8bdd\u53ef\u7528\u4e8e\u8bc6\u522b\u5efa\u6863\u548c\u77e5\u8bc6\u95ee\u7b54\uff0c\u6d89\u53ca\u68c0\u5b9a\u7ed3\u8bba\u8bf7\u4ee5\u6b63\u5f0f\u8bb0\u5f55\u4e3a\u51c6\u3002',
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
    extractFailed: '\u56fe\u7247\u5206\u6790\u5931\u8d25\uff0c\u4f60\u53ef\u4ee5\u91cd\u65b0\u4e0a\u4f20\u4e00\u5f20\u66f4\u6e05\u6670\u7684\u7167\u7247\u3002'
  },
  shareTitle: '\u0041\u0049\u667a\u80fd\u7ba1\u5bb6 - \u5bf9\u8bdd\u5f0f\u5efa\u6863'
}

const QUICK_QUESTIONS = {
  enterprise: [
    '\u6211\u4eec\u8fd8\u6709\u591a\u5c11\u8bbe\u5907\u5373\u5c06\u5230\u671f\uff1f',
    '\u672c\u6708\u68c0\u5b9a\u4e86\u591a\u5c11\u5757\u538b\u529b\u8868\uff1f',
    '\u6211\u4eec\u7684\u68c0\u5b9a\u5408\u683c\u7387\u662f\u591a\u5c11\uff1f',
    '\u538b\u529b\u8868\u68c0\u5b9a\u5468\u671f\u662f\u591a\u4e45\uff1f'
  ],
  district_admin: [
    '\u8f96\u533a\u5185\u6709\u591a\u5c11\u8bbe\u5907\u5373\u5c06\u5230\u671f\uff1f',
    '\u672c\u6708\u8f96\u533a\u68c0\u5b9a\u4e86\u591a\u5c11\u5757\u538b\u529b\u8868\uff1f',
    '\u8f96\u533a\u68c0\u5b9a\u5408\u683c\u7387\u662f\u591a\u5c11\uff1f',
    '\u5982\u4f55\u5224\u65ad\u538b\u529b\u8868\u9700\u8981\u66f4\u6362\uff1f'
  ],
  super_admin: [
    '\u5e73\u53f0\u6709\u591a\u5c11\u8bbe\u5907\u5373\u5c06\u5230\u671f\uff1f',
    '\u672c\u6708\u5168\u5e73\u53f0\u68c0\u5b9a\u4e86\u591a\u5c11\u5757\u538b\u529b\u8868\uff1f',
    '\u5e73\u53f0\u68c0\u5b9a\u5408\u683c\u7387\u662f\u591a\u5c11\uff1f',
    '\u68c0\u5b9a\u4e0d\u5408\u683c\u7684\u6807\u51c6\u662f\u4ec0\u4e48\uff1f'
  ],
  default: [
    '\u8bf7\u5f15\u5bfc\u6211\u4e0a\u4f20\u538b\u529b\u8868\u7167\u7247',
    '\u538b\u529b\u8868\u68c0\u5b9a\u5468\u671f\u662f\u591a\u4e45\uff1f',
    '\u538b\u529b\u8868\u5982\u4f55\u9009\u578b\uff1f',
    '\u4ec0\u4e48\u60c5\u51b5\u9700\u8981\u66f4\u6362\u538b\u529b\u8868\uff1f'
  ]
}

Page({
  data: {
    text: TEXT,
    messages: [],
    inputValue: '',
    isLoading: false,
    isVisionLoading: false,
    scrollToView: '',
    quickQuestions: QUICK_QUESTIONS.default,
    userInfo: null,
    userType: 'guest',
    userScope: TEXT.guest,
    visionDraft: null
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
    const profile = this.resolveUserProfile()
    this.setData(profile)
  },

  resolveUserProfile() {
    const adminUser = wx.getStorageSync('adminUser')
    const enterpriseUser = wx.getStorageSync('enterpriseUser')

    if (adminUser) {
      const isDistrictAdmin = adminUser.role === 'district' && adminUser.district
      return {
        userType: isDistrictAdmin ? 'district_admin' : 'super_admin',
        userInfo: adminUser,
        userScope: isDistrictAdmin
          ? `${adminUser.district}\u8f96\u533a\u7ba1\u7406\u5458`
          : '\u603b\u7ba1\u7406\u5458',
        quickQuestions: QUICK_QUESTIONS[isDistrictAdmin ? 'district_admin' : 'super_admin']
      }
    }

    if (enterpriseUser) {
      return {
        userType: 'enterprise',
        userInfo: enterpriseUser,
        userScope: enterpriseUser.companyName || '\u4f01\u4e1a\u7528\u6237',
        quickQuestions: QUICK_QUESTIONS.enterprise
      }
    }

    return {
      userType: 'guest',
      userInfo: null,
      userScope: TEXT.guest,
      quickQuestions: QUICK_QUESTIONS.default
    }
  },

  ensureGuideConversation() {
    if (this.data.messages.length > 0) return
    const openingMessages = [
      this.createTextMessage('assistant', TEXT.uploadPrompt),
      this.createTextMessage('assistant', '\u4f60\u4e5f\u53ef\u4ee5\u76f4\u63a5\u5411\u6211\u63d0\u95ee\uff0c\u4f46\u5982\u679c\u4f60\u60f3\u5feb\u901f\u5efa\u6863\uff0c\u73b0\u5728\u4e0a\u4f20\u7167\u7247\u6700\u5408\u9002\u3002')
    ]
    this.setData({ messages: openingMessages }, () => this.scrollToBottom())
  },

  createTextMessage(role, content) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role,
      kind: 'text',
      content,
      time: this.formatTime(new Date())
    }
  },

  createImageMessage(imagePath) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      kind: 'image',
      imagePath,
      content: TEXT.uploadCta,
      time: this.formatTime(new Date())
    }
  },

  createResultMessage(result) {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      kind: 'result',
      title: TEXT.extractionTitle,
      summary: result.summary,
      fields: result.fields,
      imagePath: result.imagePath,
      time: this.formatTime(new Date())
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

  async onSend() {
    const question = this.data.inputValue.trim()
    if (!question || this.data.isLoading || this.data.isVisionLoading) return

    const userMessage = this.createTextMessage('user', question)

    this.setData({
      messages: [...this.data.messages, userMessage],
      inputValue: '',
      isLoading: true
    })

    this.scrollToBottom()

    const normalized = question.toLowerCase()
    if (normalized.includes('\u4e0a\u4f20') || normalized.includes('\u7167\u7247') || normalized.includes('\u8bc1\u4e66') || normalized.includes('photo') || normalized.includes('image')) {
      this.setData({ isLoading: false })
      this.appendMessages([this.createTextMessage('assistant', TEXT.uploadPrompt)])
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'aiAssistant',
        data: {
          question,
          userType: this.data.userType === 'district_admin' || this.data.userType === 'super_admin' ? 'admin' : this.data.userType,
          userInfo: this.data.userInfo
        }
      })

      const aiMessage = this.createTextMessage('assistant', res.result.answer || TEXT.answers.fallback)
      this.setData({
        messages: [...this.data.messages, aiMessage],
        isLoading: false
      }, () => this.scrollToBottom())
    } catch (error) {
      console.error('AI 请求失败:', error)
      const errorMessage = this.createTextMessage('assistant', TEXT.answers.network)
      this.setData({
        messages: [...this.data.messages, errorMessage],
        isLoading: false
      }, () => this.scrollToBottom())
    }
  },

  onQuickQuestion(e) {
    const question = e.currentTarget.dataset.question
    this.setData({
      inputValue: question
    }, () => {
      this.onSend()
    })
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
      console.error('选择图片失败:', error)
    }
  },

  async processVisionImage(imagePath) {
    const userType = this.data.userType === 'district_admin' || this.data.userType === 'super_admin' ? 'admin' : this.data.userType
    this.setData({ isVisionLoading: true })

    try {
      const result = await aiExtractService.extractFromImage(imagePath, {
        userType,
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
      console.error('图片分析失败:', error)
      this.setData({ isVisionLoading: false })
      this.appendMessages([this.createTextMessage('assistant', error.message || TEXT.answers.extractFailed)])
    }
  },

  buildVisionDraft(result, imagePath) {
    const fields = []
    const pushField = (key, value) => {
      if (!value) return
      if (!TEXT.fields[key]) return
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
    if (source.includes('\u538b\u529b') || source.includes('pressure') || source.includes('gauge') || source.includes('mpa') || source.includes('kpa')) {
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
      const loadingAnchor = this.data.isVisionLoading ? 'msg-vision-loading' : ''
      const lastMessage = this.data.messages[this.data.messages.length - 1]
      this.setData({
        scrollToView: loadingAnchor || `msg-${lastMessage?.id || 'tail'}`
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
