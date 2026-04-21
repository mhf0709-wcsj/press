Component({
  data: {
    showPrivacy: false
  },

  lifetimes: {
    attached() {
      if (wx.onNeedPrivacyAuthorization) {
        wx.onNeedPrivacyAuthorization((resolve) => {
          this.setData({ showPrivacy: true })
          this.resolvePrivacyAuthorization = resolve
        })
      }
    }
  },

  methods: {
    openPrivacyContract() {
      wx.openPrivacyContract({
        success: () => {},
        fail: (err) => {
          console.error('打开隐私协议失败', err)
          wx.showToast({ title: '打开失败', icon: 'none' })
        }
      })
    },

    handleAgree() {
      this.setData({ showPrivacy: false })
      if (this.resolvePrivacyAuthorization) {
        this.resolvePrivacyAuthorization({ event: 'agree', buttonId: 'agree-btn' })
        this.resolvePrivacyAuthorization = null
      }
    },

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
