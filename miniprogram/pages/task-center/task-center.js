const TEXT = {
  eyebrow: 'Workbench',
  title: '\u5de5\u4f5c\u53f0',
  companyFallback: '\u4f01\u4e1a\u7528\u6237',
  tag: '\u5feb\u6377\u5165\u53e3',
  actionsTitle: '\u5feb\u6377\u64cd\u4f5c',
  shortcutsTitle: '\u5e38\u7528\u5165\u53e3'
}

Page({
  data: {
    text: TEXT,
    enterpriseUser: null,
    quickActions: [
      {
        key: 'camera',
        title: '\u62cd\u7167\u8bc6\u522b',
        desc: '\u4e0a\u4f20\u68c0\u5b9a\u8bc1\u4e66\uff0c\u5feb\u901f\u751f\u6210\u8349\u7a3f',
        accent: 'brand'
      },
      {
        key: 'manual',
        title: '\u624b\u52a8\u5f55\u5165',
        desc: '\u76f4\u63a5\u65b0\u5efa\u68c0\u5b9a\u8bb0\u5f55',
        accent: 'neutral'
      },
      {
        key: 'equipment',
        title: '\u65b0\u5efa\u8bbe\u5907',
        desc: '\u65b0\u5efa\u8bbe\u5907\u6863\u6848\u5e76\u7ed1\u5b9a\u4eea\u8868',
        accent: 'neutral'
      }
    ],
    shortcuts: [
      {
        key: 'archive',
        label: '\u8bbe\u5907\u6863\u6848',
        value: '\u67e5\u770b\u8bbe\u5907\u53f0\u8d26'
      },
      {
        key: 'gauge',
        label: '\u538b\u529b\u8868',
        value: '\u8fdb\u5165\u538b\u529b\u8868\u5217\u8868'
      },
      {
        key: 'profile',
        label: '\u6211\u7684',
        value: '\u8d26\u53f7\u548c\u8bbe\u7f6e'
      }
    ]
  },

  onLoad() {
    wx.switchTab({ url: '/pages/workbench/workbench' })
  },

  onShow() {
    this.loadEnterpriseUser()
  },

  loadEnterpriseUser() {
    this.setData({
      enterpriseUser: wx.getStorageSync('enterpriseUser') || null
    })
  },

  handleQuickAction(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'camera') {
      wx.switchTab({ url: '/pages/ai-assistant/ai-assistant' })
      return
    }
    if (key === 'manual') {
      wx.switchTab({ url: '/pages/ai-assistant/ai-assistant' })
      return
    }
    if (key === 'equipment') {
      wx.navigateTo({ url: '/pages/equipment-detail/equipment-detail?mode=create' })
    }
  },

  handleShortcut(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'archive') {
      wx.navigateTo({ url: '/pages/archive/archive' })
      return
    }
    if (key === 'gauge') {
      wx.navigateTo({ url: '/pages/device-list/device-list' })
      return
    }
    if (key === 'profile') {
      wx.switchTab({ url: '/pages/user/user' })
    }
  }
})
