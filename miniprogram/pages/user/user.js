const { SUBSCRIBE_TEMPLATE_IDS } = require('../../constants/index')
const expiryReminderService = require('../../services/expiry-reminder-service')

const TEXT = {
  title: '\u6211\u7684',
  signedOut: '\u672a\u767b\u5f55',
  tapToLogin: '\u672a\u767b\u5f55',
  legalPerson: '\u6cd5\u4eba',
  companyInfo: '\u4f01\u4e1a\u4fe1\u606f',
  companyName: '\u4f01\u4e1a\u540d\u79f0',
  creditCode: '\u4fe1\u7528\u4ee3\u7801',
  phone: '\u8054\u7cfb\u7535\u8bdd',
  reminderSettings: '\u63d0\u9192\u8bbe\u7f6e',
  subscribe: '\u8ba2\u9605\u5230\u671f\u9884\u8b66\u901a\u77e5',
  subscribeOn: '\u5df2\u5f00\u542f',
  subscribeOff: '\u672a\u5f00\u542f',
  subscribeHintOn: '\u5df2\u6388\u6743',
  subscribeHintOff: '\u672a\u6388\u6743',
  subscribeFallbackTitle: '\u5df2\u5f00\u542f\u7ad9\u5185\u63d0\u9192',
  subscribeFallbackContent: '\u5df2\u5f00\u542f\u7ad9\u5185\u63d0\u9192\u3002',
  lastSubscribeTime: '\u6700\u8fd1\u6388\u6743',
  entryReminderTitle: '\u4eca\u65e5\u5230\u671f\u63d0\u9192',
  entryReminderConfirm: '\u53bb\u5904\u7406',
  entryReminderCancel: '\u7a0d\u540e\u5904\u7406',
  entryReminderBadge: '\u5230\u671f\u63d0\u9192',
  entryReminderFallbackSubtitle: '',
  assets: '\u6863\u6848\u5165\u53e3',
  archive: '\u8bbe\u5907\u6863\u6848',
  gauges: '\u538b\u529b\u8868\u6863\u6848',
  clearCache: '\u6e05\u7406\u7f13\u5b58',
  logout: '\u9000\u51fa\u767b\u5f55',
  version: '\u538b\u529b\u8868\u68c0\u5b9a\u667a\u80fd\u4f53 v1.2.0'
}

Page({
  data: {
    text: TEXT,
    enterpriseUser: null,
    alertSettings: null,
    reminderVisible: false,
    reminderCard: {
      title: '',
      summary: '',
      items: []
    }
  },

  onLoad() {
    this.loadEnterpriseInfo()
  },

  onShow() {
    this.loadEnterpriseInfo()
  },

  async loadEnterpriseInfo() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser })

    if (enterpriseUser) {
      await this.loadAlertSettings(enterpriseUser)
      await this.maybeShowEntryReminder(enterpriseUser)
      return
    }

    this.setData({ alertSettings: null })
  },

  async loadAlertSettings(enterpriseUser) {
    const res = await expiryReminderService.getEnterpriseExpiryDashboard(enterpriseUser, 30)
    if (!res || !res.success) {
      this.setData({ alertSettings: null })
      return
    }

    this.setData({
      alertSettings: res.data?.subscription || null
    })
  },

  async maybeShowEntryReminder(enterpriseUser) {
    const app = typeof getApp === 'function' ? getApp() : null
    const token = app?.globalData?.entryReminderToken || 0

    if (token && app?.globalData?.entryReminderHandledToken === token) return
    if (expiryReminderService.hasDeferredToday(enterpriseUser)) {
      if (app?.globalData && token) {
        app.globalData.entryReminderHandledToken = token
      }
      return
    }

    const res = await expiryReminderService.getEnterpriseExpiryDashboard(enterpriseUser, 30)
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
      reminderCard: {
        title: TEXT.entryReminderTitle,
        summary: `您有 ${expiredCount} 台已过期，${expiringCount} 台将在 30 天内到期。`,
        items: (data.recentItems || []).slice(0, 3).map((item) => ({
          title: item.factoryNo || item.instrumentName || TEXT.archive,
          subtitle: item.instrumentName || TEXT.gauges,
          expiredCount: item.expiryStatus === 'expired' ? 1 : 0,
          expiringCount: item.expiryStatus === 'expired' ? 0 : 1
        }))
      }
    })
  },

  closeReminderCard() {
    if (this.data.enterpriseUser) {
      expiryReminderService.deferTodayReminder(this.data.enterpriseUser)
    }
    this.setData({ reminderVisible: false })
  },

  confirmReminderCard() {
    this.setData({ reminderVisible: false })
    wx.navigateTo({ url: '/pages/archive/archive?filter=expiry' })
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

  goToGaugeLibrary() {
    wx.navigateTo({ url: '/pages/device-list/device-list' })
  },

  goToLogin() {
    wx.reLaunch({ url: '/pages/login/login' })
  },

  async subscribeAlert() {
    const enterpriseUser = this.data.enterpriseUser
    if (!enterpriseUser) {
      this.goToLogin()
      return
    }

    const appConfig = wx.getStorageSync('appConfig') || {}
    const tmplId = appConfig.deviceExpiryTemplateId || SUBSCRIBE_TEMPLATE_IDS.DEVICE_EXPIRY
    if (!tmplId) {
      await expiryReminderService.saveAlertSettings(enterpriseUser, {
        alertEnabled: true,
        channels: {
          wxSubscribe: false,
          inApp: true,
          sms: false
        },
        strategy: {
          dailyDigestEnabled: true,
          expiredEnabled: true,
          expiringDays: [30]
        }
      })
      await this.loadAlertSettings(enterpriseUser)
      wx.showModal({
        title: TEXT.subscribeFallbackTitle,
        content: TEXT.subscribeFallbackContent,
        showCancel: false
      })
      return
    }

    try {
      const res = await expiryReminderService.requestSubscribeMessage([tmplId])
      if (res[tmplId] === 'accept') {
        await expiryReminderService.confirmWxSubscription(enterpriseUser, tmplId)
        await expiryReminderService.saveAlertSettings(enterpriseUser, {
          alertEnabled: true,
          channels: {
            wxSubscribe: true,
            inApp: true,
            sms: false
          },
          strategy: {
            dailyDigestEnabled: true,
            expiredEnabled: true,
            expiringDays: [30]
          }
        })
        await this.loadAlertSettings(enterpriseUser)
        wx.showToast({ title: '\u8ba2\u9605\u6210\u529f', icon: 'success' })
        return
      }

      wx.showToast({ title: '\u5df2\u53d6\u6d88\u8ba2\u9605', icon: 'none' })
    } catch (err) {
      console.error('subscribe message auth failed', err)
      wx.showToast({ title: '\u8ba2\u9605\u5931\u8d25', icon: 'none' })
    }
  },

  logout() {
    wx.showModal({
      title: '\u9000\u51fa\u767b\u5f55',
      content: '\u786e\u8ba4\u9000\u51fa\u5f53\u524d\u4f01\u4e1a\u8d26\u53f7\uff1f',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ enterpriseUser: null, alertSettings: null })
        wx.clearStorageSync()
        wx.showToast({ title: '\u5df2\u9000\u51fa', icon: 'success' })
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/login/login' })
        }, 1200)
      }
    })
  }
})
