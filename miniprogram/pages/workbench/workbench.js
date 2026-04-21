const db = wx.cloud.database()
const _ = db.command
const expiryReminderService = require('../../services/expiry-reminder-service')

const TEXT = {
  eyebrow: '\u8bbe\u5907\u4e2d\u5fc3',
  title: '\u8bbe\u5907\u4e2d\u5fc3',
  dashboardTitle: '\u4eea\u8868\u76d8',
  dashboardNote: '\u70b9\u51fb\u5361\u7247\u53ef\u67e5\u770b\u76f8\u5e94\u660e\u7ec6',
  createEquipment: '\u65b0\u5efa\u8bbe\u5907',
  reminderTitle: '\u5230\u671f\u63d0\u9192',
  reminderManage: '\u7ba1\u7406\u63d0\u9192',
  reminderSummary: '\u60a8\u6709 {expired} \u53f0\u5df2\u8fc7\u671f\uff0c{expiring} \u53f0\u5c06\u5728 30 \u5929\u5185\u5230\u671f',
  reminderEmpty: '\u6682\u65f6\u6ca1\u6709\u9700\u8981\u5904\u7406\u7684\u5230\u671f\u63d0\u9192',
  reminderExpired: '\u67e5\u770b\u5df2\u8fc7\u671f',
  reminderExpiring: '\u67e5\u770b\u5373\u5c06\u5230\u671f',
  reminderSubscribeOn: '\u5fae\u4fe1\u63d0\u9192\u5df2\u5f00\u542f',
  reminderInAppOn: '\u7ad9\u5185\u63d0\u9192\u5df2\u5f00\u542f',
  reminderSubscribeOff: '\u672a\u5f00\u542f\u5fae\u4fe1\u63d0\u9192',
  reminderMetaExpired: '\u5df2\u8fc7\u671f',
  reminderMetaExpiring: '\u5373\u5c06\u5230\u671f',
  recentTitle: '\u6700\u8fd1\u5f55\u5165',
  recentMore: '\u5168\u90e8',
  recentEmpty: '\u6682\u65e0\u6700\u8fd1\u8bb0\u5f55',
  cards: {
    equipment: '\u8bbe\u5907\u53f0\u8d26',
    gauge: '\u538b\u529b\u8868',
    expiring: '30\u5929\u5185\u5230\u671f',
    expired: '\u5df2\u8fc7\u671f'
  },
  fallbackRecordTitle: '\u65b0\u8bb0\u5f55',
  fallbackRecordSubtitle: '\u5f85\u8865\u5145\u4eea\u8868\u4fe1\u606f'
}

Page({
  data: {
    text: TEXT,
    enterpriseUser: null,
    summaryCards: [],
    expiryReminder: null,
    recentRecords: [],
    loading: false
  },

  onLoad() {
    this.bootstrap()
  },

  onShow() {
    this.bootstrap()
  },

  onPullDownRefresh() {
    this.bootstrap().finally(() => wx.stopPullDownRefresh())
  },

  async bootstrap() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    if (!enterpriseUser || !enterpriseUser.companyName) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }

    this.setData({
      enterpriseUser,
      loading: true
    })

    try {
      await Promise.all([
        this.loadDashboard(enterpriseUser),
        this.loadExpiryReminder(enterpriseUser),
        this.loadRecentRecords(enterpriseUser)
      ])
    } catch (error) {
      console.error('设备中心初始化失败', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadDashboard(enterpriseUser) {
    const companyName = enterpriseUser.companyName
    const today = this.formatDate(new Date())
    const threshold = this.formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

    const [equipmentRes, gaugeRes, expiringRes, expiredRes] = await Promise.all([
      db.collection('equipments').where({ enterpriseName: companyName }).count(),
      db.collection('devices').where({ enterpriseName: companyName }).count(),
      db.collection('pressure_records').where({
        enterpriseName: companyName,
        expiryDate: _.gte(today).and(_.lte(threshold))
      }).count(),
      db.collection('pressure_records').where({
        enterpriseName: companyName,
        expiryDate: _.lt(today)
      }).count()
    ])

    this.setData({
      summaryCards: [
        { key: 'equipment', label: TEXT.cards.equipment, value: equipmentRes.total || 0, tone: '' },
        { key: 'gauge', label: TEXT.cards.gauge, value: gaugeRes.total || 0, tone: '' },
        { key: 'expiring', label: TEXT.cards.expiring, value: expiringRes.total || 0, tone: 'warning' },
        { key: 'expired', label: TEXT.cards.expired, value: expiredRes.total || 0, tone: 'danger' }
      ]
    })
  },

  async loadRecentRecords(enterpriseUser) {
    const res = await db.collection('pressure_records')
      .where({ enterpriseName: enterpriseUser.companyName })
      .orderBy('createTime', 'desc')
      .limit(5)
      .get()

    this.setData({
      recentRecords: (res.data || []).map((item) => ({
        _id: item._id,
        title: item.factoryNo || item.certNo || TEXT.fallbackRecordTitle,
        subtitle: item.instrumentName || item.sendUnit || TEXT.fallbackRecordSubtitle,
        meta: item.verificationDate || this.formatCreateTime(item.createTime)
      }))
    })
  },

  async loadExpiryReminder(enterpriseUser) {
    const res = await expiryReminderService.getEnterpriseExpiryDashboard(enterpriseUser, 30)
    if (!res || !res.success) {
      this.setData({ expiryReminder: null })
      return
    }

    const data = res.data || {}
    const expiredCount = data.expiredCount || 0
    const expiringCount = data.expiringCount || 0
    const summary = TEXT.reminderSummary
      .replace('{expired}', String(expiredCount))
      .replace('{expiring}', String(expiringCount))

    const items = (data.recentItems || []).map((item) => ({
      _id: item._id,
      title: item.factoryNo || item.instrumentName || TEXT.fallbackRecordTitle,
      subtitle: item.instrumentName || TEXT.fallbackRecordSubtitle,
      meta: item.expiryDate || '',
      statusText: item.expiryStatus === 'expired' ? TEXT.reminderMetaExpired : TEXT.reminderMetaExpiring
    }))

    this.setData({
      expiryReminder: {
        expiredCount,
        expiringCount,
        summary,
        items,
        wxSubscribed: !!data.subscription?.wxSubscribed,
        inAppEnabled: data.subscription?.alertEnabled !== false
      }
    })
  },

  onTapDashboardCard(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'gauge') {
      wx.navigateTo({ url: '/pages/device-list/device-list' })
      return
    }
    wx.navigateTo({ url: '/pages/archive/archive' })
  },

  goToAlertSettings() {
    wx.switchTab({ url: '/pages/user/user' })
  },

  goToExpiredRecords() {
    wx.navigateTo({ url: '/pages/archive/archive?filter=expired' })
  },

  goToExpiringRecords() {
    wx.navigateTo({ url: '/pages/archive/archive?filter=expiring' })
  },

  openExpiryRecord(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  goToCreateEquipment() {
    wx.navigateTo({ url: '/pages/equipment-detail/equipment-detail?mode=create' })
  },

  openRecord(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  goToAllRecords() {
    wx.navigateTo({ url: '/pages/archive/archive' })
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  formatCreateTime(value) {
    if (!value) return ''
    if (typeof value === 'string') return value

    const date = value instanceof Date ? value : value.toDate ? value.toDate() : new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${month}-${day}`
  }
})
