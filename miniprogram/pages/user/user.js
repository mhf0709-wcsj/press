const { SUBSCRIBE_TEMPLATE_IDS } = require('../../constants/index')

const TEXT = {
  title: '\u6211\u7684',
  signedOut: '\u672a\u767b\u5f55',
  tapToLogin: '\u70b9\u51fb\u767b\u5f55\u4f01\u4e1a\u8d26\u53f7',
  legalPerson: '\u6cd5\u4eba',
  companyInfo: '\u4f01\u4e1a\u4fe1\u606f',
  companyName: '\u4f01\u4e1a\u540d\u79f0',
  creditCode: '\u4fe1\u7528\u4ee3\u7801',
  phone: '\u8054\u7cfb\u7535\u8bdd',
  subscribe: '\u8ba2\u9605\u5230\u671f\u9884\u8b66\u901a\u77e5',
  archive: '\u8bbe\u5907\u6863\u6848',
  clearCache: '\u6e05\u7406\u7f13\u5b58',
  logout: '\u9000\u51fa\u767b\u5f55',
  version: '\u538b\u529b\u8868\u68c0\u5b9a\u667a\u80fd\u4f53 v1.2.0'
}

Page({
  data: {
    text: TEXT,
    enterpriseUser: null
  },

  onLoad() {
    this.loadEnterpriseInfo()
  },

  onShow() {
    this.loadEnterpriseInfo()
  },

  loadEnterpriseInfo() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser })
  },

  clearCache() {
    wx.showModal({
      title: '\u6e05\u7406\u7f13\u5b58',
      content: '\u786e\u5b9a\u8981\u6e05\u7406\u672c\u5730\u7f13\u5b58\u5417\uff1f\u4e0d\u4f1a\u5f71\u54cd\u4e91\u7aef\u6570\u636e\u3002',
      success: (res) => {
        if (!res.confirm) return
        const user = wx.getStorageSync('enterpriseUser')
        wx.clearStorageSync()
        if (user) wx.setStorageSync('enterpriseUser', user)
        wx.showToast({ title: '\u6e05\u7406\u6210\u529f', icon: 'success' })
      }
    })
  },

  goToEquipmentLibrary() {
    wx.navigateTo({ url: '/pages/archive/archive' })
  },

  goToLogin() {
    wx.reLaunch({ url: '/pages/login/login' })
  },

  subscribeAlert() {
    const appConfig = wx.getStorageSync('appConfig') || {}
    const tmplId = appConfig.deviceExpiryTemplateId || SUBSCRIBE_TEMPLATE_IDS.DEVICE_EXPIRY
    if (!tmplId) {
      wx.showModal({
        title: '\u672a\u914d\u7f6e\u6a21\u677f',
        content: '\u8bf7\u5148\u914d\u7f6e\u8bbe\u5907\u5230\u671f\u63d0\u9192\u6a21\u677f\u540e\u518d\u8bd5\u3002',
        showCancel: false
      })
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success(res) {
        if (res[tmplId] === 'accept') {
          wx.showToast({ title: '\u8ba2\u9605\u6210\u529f', icon: 'success' })
          return
        }
        wx.showToast({ title: '\u5df2\u53d6\u6d88\u8ba2\u9605', icon: 'none' })
      },
      fail(err) {
        console.error('订阅消息授权失败', err)
        wx.showToast({ title: '\u8ba2\u9605\u5931\u8d25', icon: 'none' })
      }
    })
  },

  logout() {
    wx.showModal({
      title: '\u9000\u51fa\u767b\u5f55',
      content: '\u786e\u8ba4\u9000\u51fa\u5f53\u524d\u4f01\u4e1a\u8d26\u53f7\uff1f',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ enterpriseUser: null })
        wx.clearStorageSync()
        wx.showToast({ title: '\u5df2\u9000\u51fa', icon: 'success' })
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/login/login' })
        }, 1200)
      }
    })
  }
})
