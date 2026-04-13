const db = wx.cloud.database()
const _ = db.command

const TEXT = {
  eyebrow: '\u8bbe\u5907\u4e2d\u5fc3',
  title: '\u8bbe\u5907\u4e2d\u5fc3',
  companyFallback: '\u672a\u767b\u5f55\u4f01\u4e1a',
  companyTag: '\u4f01\u4e1a\u7aef',
  dashboardTitle: '\u4eea\u8868\u76d8',
  dashboardNote: '\u70b9\u51fb\u5361\u7247\u53ef\u67e5\u770b\u76f8\u5e94\u660e\u7ec6',
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

  onTapDashboardCard(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'gauge') {
      wx.navigateTo({ url: '/pages/device-list/device-list' })
      return
    }
    wx.navigateTo({ url: '/pages/archive/archive' })
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
