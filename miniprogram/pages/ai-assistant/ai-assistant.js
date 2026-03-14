const app = getApp()

// 不同用户类型的快捷问题
const QUICK_QUESTIONS = {
  enterprise: [
    '我们还有多少设备即将到期？',
    '本月检定了多少台设备？',
    '我们的检定合格率是多少？',
    '压力表检定周期是多久？',
    '检定不合格的标准是什么？'
  ],
  district_admin: [
    '辖区内有多少设备即将到期？',
    '本月辖区检定了多少台？',
    '辖区检定合格率是多少？',
    '压力表检定周期是多久？',
    '如何判断压力表需要更换？'
  ],
  super_admin: [
    '平台有多少设备即将到期？',
    '本月全平台检定了多少台？',
    '平台检定合格率是多少？',
    '压力表检定周期是多久？',
    '检定不合格的标准是什么？'
  ],
  default: [
    '压力表检定周期是多久？',
    '检定不合格的标准是什么？',
    '压力表如何选型？',
    '什么情况需要更换压力表？',
    '压力表如何安装？'
  ]
}

Page({
  data: {
    messages: [],
    inputValue: '',
    isLoading: false,
    scrollToView: '',
    quickQuestions: QUICK_QUESTIONS.default,
    userInfo: null,
    userType: 'enterprise', // enterprise 或 admin
    userScope: '' // 显示用户权限范围
  },

  onLoad(options) {
    // 判断用户类型并设置相应的快捷问题
    const adminUser = wx.getStorageSync('adminUser')
    const enterpriseUser = wx.getStorageSync('userInfo')
    
    if (adminUser) {
      // 管理员用户
      const isDistrictAdmin = adminUser.role === 'district' && adminUser.district
      const userTypeKey = isDistrictAdmin ? 'district_admin' : 'super_admin'
      const userScope = isDistrictAdmin ? `${adminUser.district}辖区管理员` : '总管理员'
      
      this.setData({ 
        userType: 'admin',
        userInfo: adminUser,
        quickQuestions: QUICK_QUESTIONS[userTypeKey],
        userScope
      })
    } else if (enterpriseUser) {
      // 企业用户
      const userScope = enterpriseUser.companyName || '企业用户'
      
      this.setData({ 
        userType: 'enterprise',
        userInfo: enterpriseUser,
        quickQuestions: QUICK_QUESTIONS.enterprise,
        userScope
      })
    } else {
      // 访客
      this.setData({
        quickQuestions: QUICK_QUESTIONS.default,
        userScope: '访客'
      })
    }
  },

  // 输入处理
  onInput(e) {
    this.setData({
      inputValue: e.detail.value
    })
  },

  // 发送消息
  async onSend() {
    const question = this.data.inputValue.trim()
    if (!question || this.data.isLoading) return

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: question,
      time: this.formatTime(new Date())
    }

    this.setData({
      messages: [...this.data.messages, userMessage],
      inputValue: '',
      isLoading: true
    })

    // 滚动到底部
    this.scrollToBottom()

    try {
      // 调用AI云函数
      const res = await wx.cloud.callFunction({
        name: 'aiAssistant',
        data: {
          question,
          userType: this.data.userType,
          userInfo: this.data.userInfo
        }
      })

      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: res.result.answer || '抱歉，我暂时无法回答这个问题，请稍后再试。',
        time: this.formatTime(new Date())
      }

      this.setData({
        messages: [...this.data.messages, aiMessage],
        isLoading: false
      })
    } catch (error) {
      console.error('AI请求失败:', error)
      
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: '网络连接出现问题，请检查网络后重试。',
        time: this.formatTime(new Date())
      }

      this.setData({
        messages: [...this.data.messages, errorMessage],
        isLoading: false
      })
    }

    // 滚动到底部
    this.scrollToBottom()
  },

  // 快捷问题点击
  onQuickQuestion(e) {
    const question = e.currentTarget.dataset.question
    this.setData({
      inputValue: question
    }, () => {
      this.onSend()
    })
  },

  // 滚动到底部
  scrollToBottom() {
    setTimeout(() => {
      const lastMsgId = this.data.isLoading ? 'msg-loading' : `msg-${this.data.messages[this.data.messages.length - 1]?.id}`
      this.setData({
        scrollToView: lastMsgId
      })
    }, 100)
  },

  // 格式化时间
  formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  },

  // 分享
  onShareAppMessage() {
    return {
      title: 'AI智能管家 - 压力表检定助手',
      path: '/pages/ai-assistant/ai-assistant'
    }
  }
})
