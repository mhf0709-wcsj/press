Component({
  data: {
    showPrivacy: false
  },

  lifetimes: {
    attached() {
      // 监听隐私协议弹窗
      if (wx.onNeedPrivacyAuthorization) {
        wx.onNeedPrivacyAuthorization((resolve, eventInfo) => {
          console.log('触发隐私授权弹窗', eventInfo)
          this.setData({ showPrivacy: true })
          this.resolvePrivacyAuthorization = resolve
        })
      }
    }
  },

  methods: {
    // 打开隐私协议
    openPrivacyContract() {
      wx.openPrivacyContract({
        success: (res) => {
          console.log('打开隐私协议成功', res)
        },
        fail: (err) => {
          console.error('打开隐私协议失败', err)
          wx.showToast({ title: '打开失败', icon: 'none' })
        }
      })
    },

    // 同意隐私协议
    handleAgree() {
      this.setData({ showPrivacy: false })
      if (this.resolvePrivacyAuthorization) {
        this.resolvePrivacyAuthorization({ event: 'agree', buttonId: 'agree-btn' })
        this.resolvePrivacyAuthorization = null
      }
    },

    // 拒绝隐私协议
    handleDisagree() {
      this.setData({ showPrivacy: false })
      if (this.resolvePrivacyAuthorization) {
        this.resolvePrivacyAuthorization({ event: 'disagree' })
        this.resolvePrivacyAuthorization = null
      }
      wx.showModal({
        title: '温馨提示',
        content: '您拒绝了隐私协议，部分功能可能无法正常使用。您可以稍后在设置中重新授权。',
        showCancel: false,
        success: () => {
          wx.exitMiniProgram()
        }
      })
    }
  }
})
