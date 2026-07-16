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
        fail: () => {
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
        content: '未同意隐私保护指引，暂时无法使用本小程序。',
        showCancel: false,
        success: () => {
          wx.exitMiniProgram()
        }
      })
    }
  }
})
