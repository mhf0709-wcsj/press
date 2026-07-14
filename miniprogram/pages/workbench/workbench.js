const dataAccess = require('../../services/data-access-service')
const equipmentService = require('../../services/equipment-service')
const expiryReminderService = require('../../services/expiry-reminder-service')
const { runSingleFlight } = require('../../utils/request-control')

const TEXT = {
  eyebrow: '设备中心',
  title: '设备中心',
  dashboardTitle: '仪表盘',
  dashboardNote: '',
  createEquipment: '新建设备',
  bindingTitle: '待绑定设备',
  bindingManage: '处理',
  bindingSummary: '{count} 台未绑定',
  bindingEmpty: '暂无',
  bindingTag: '未绑定',
  inactiveTitle: '停用 / 报废',
  inactiveMore: '全部',
  inactiveEmpty: '暂无',
  cards: {
    equipment: '设备',
    gauge: '压力表',
    expired: '逾期',
    inactiveScrap: '停用/报废'
  },
  fallbackGaugeTitle: '压力表',
  fallbackGaugeSubtitle: '',
  fallbackEquipmentTitle: '未命名设备',
  fallbackEquipmentSubtitle: '',
  fallbackInactiveSubtitle: ''
}
function buildSummaryCards(values = {}) {
  return [
    { key: 'equipment', label: TEXT.cards.equipment, value: Number(values.equipment || 0), tone: '' },
    { key: 'gauge', label: TEXT.cards.gauge, value: Number(values.gauge || 0), tone: '' },
    { key: 'expired', label: TEXT.cards.expired, value: Number(values.expired || 0), tone: 'danger' },
    { key: 'inactiveScrap', label: TEXT.cards.inactiveScrap, value: Number(values.inactiveScrap || 0), tone: 'warning' }
  ]
}

Page({
  data: {
    text: TEXT,
    enterpriseUser: null,
    summaryCards: buildSummaryCards(),
    bindingReminder: {
      count: 0,
      summary: TEXT.bindingEmpty,
      items: []
    },
    inactiveDevices: [],
    loading: false
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '设备中心' })
    this.bootstrap().finally(() => {
      this.hasLoadedOnce = true
    })
  },

  onShow() {
    if (!this.hasLoadedOnce) return

    wx.setNavigationBarTitle({ title: '设备中心' })
    this.bootstrap()
  },

  onPullDownRefresh() {
    this.bootstrap({ force: true }).finally(() => wx.stopPullDownRefresh())
  },

  bootstrap(options = {}) {
    return runSingleFlight(this, 'bootstrap', () => this.performBootstrap(options), {
      queueLatest: !!options.force
    })
  },

  async performBootstrap(options = {}) {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    if (!enterpriseUser || !enterpriseUser.companyName) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }

    const app = getApp()
    const ledgerVersion = Number(app.globalData.ledgerVersion || 0)
    const now = Date.now()
    if (
      !options.force &&
      this.lastBootstrapAt &&
      this.loadedLedgerVersion === ledgerVersion &&
      now - this.lastBootstrapAt < 15000
    ) {
      return
    }

    this.setData({
      enterpriseUser,
      loading: true
    })

    try {
      await Promise.all([
        this.loadDashboard(enterpriseUser, options),
        this.loadBindingReminder(enterpriseUser),
        this.loadInactiveDevices(enterpriseUser)
      ])
    } catch (error) {
      this.setData({
        summaryCards: buildSummaryCards(),
        bindingReminder: {
          count: 0,
          summary: TEXT.bindingEmpty,
          items: []
        },
        inactiveDevices: []
      })
    } finally {
      this.lastBootstrapAt = Date.now()
      this.loadedLedgerVersion = ledgerVersion
      this.setData({ loading: false })
    }
  },

  async loadDashboard(enterpriseUser, options = {}) {
    const companyName = enterpriseUser.companyName

    try {
      const [equipmentCount, gaugeCount, inactiveScrapCount, expiryDashboard] = await Promise.all([
        dataAccess.count('equipments', { isDeleted: false }),
        dataAccess.count('devices', { isDeleted: false }),
        dataAccess.count('devices', { status: { in: ['停用', '报废'] }, isDeleted: false }),
        expiryReminderService.getEnterpriseExpiryDashboard(enterpriseUser, 30, {
          force: !!options.force
        })
      ])

      this.setData({
        summaryCards: buildSummaryCards({
          equipment: equipmentCount,
          gauge: gaugeCount,
          expired: Number(expiryDashboard?.data?.expiredCount || 0),
          inactiveScrap: inactiveScrapCount
        })
      })
    } catch (error) {
      this.setData({ summaryCards: buildSummaryCards() })
    }
  },

  async loadBindingReminder(enterpriseUser) {
    try {
      const list = await equipmentService.loadUnboundEquipments({ enterpriseUser })
      const count = list.length

      this.setData({
        bindingReminder: {
          count,
          summary: count
            ? TEXT.bindingSummary.replace('{count}', String(count))
            : TEXT.bindingEmpty,
          items: list.map((item) => ({
            _id: item._id,
            title: item.equipmentName || TEXT.fallbackEquipmentTitle,
            subtitle: item.location || item.equipmentNo || TEXT.fallbackEquipmentSubtitle
          }))
        }
      })
    } catch (error) {
      this.setData({
        bindingReminder: {
          count: 0,
          summary: TEXT.bindingEmpty,
          items: []
        }
      })
    }
  },

  async loadInactiveDevices(enterpriseUser) {
    try {
      const devices = await dataAccess.list('devices', {
        filters: { status: { in: ['停用', '报废'] }, isDeleted: false },
        orderBy: { field: 'updateTime', direction: 'desc' },
        limit: 5
      })

      this.setData({
        inactiveDevices: devices.map((item) => ({
          _id: item._id,
          title: item.deviceName || item.factoryNo || TEXT.fallbackGaugeTitle,
          subtitle: item.equipmentName || item.factoryNo || TEXT.fallbackGaugeSubtitle,
          status: this.normalizeStatus(item.status || '-')
        }))
      })
    } catch (error) {
      this.setData({ inactiveDevices: [] })
    }
  },

  onTapDashboardCard(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'gauge') {
      wx.navigateTo({ url: '/pages/device-list/device-list' })
      return
    }
    if (key === 'expired') {
      wx.navigateTo({ url: '/pages/device-list/device-list?expiry=expired' })
      return
    }
    if (key === 'inactiveScrap') {
      wx.navigateTo({ url: `/pages/device-list/device-list?statuses=${encodeURIComponent('停用,报废')}` })
      return
    }
    wx.navigateTo({ url: '/pages/archive/archive' })
  },

  goToCreateEquipment() {
    wx.navigateTo({ url: '/pages/equipment-detail/equipment-detail?mode=create' })
  },

  handleBindingReminder() {
    const first = this.data.bindingReminder?.items?.[0]
    if (first?._id) {
      wx.setNavigationBarTitle({ title: '设备中心' })
      wx.navigateTo({ url: `/pages/equipment-detail/equipment-detail?id=${first._id}` })
      return
    }
    this.goToCreateEquipment()
  },

  openUnboundEquipment(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.setNavigationBarTitle({ title: '设备中心' })
    wx.navigateTo({ url: `/pages/equipment-detail/equipment-detail?id=${id}` })
  },

  openInactiveDevice(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/device-detail/device-detail?id=${id}` })
  },

  goToInactiveDevices() {
    const statuses = encodeURIComponent('停用,报废')
    wx.navigateTo({ url: `/pages/device-list/device-list?statuses=${statuses}` })
  },

  normalizeStatus(status) {
    if (status === '停用') return '停用'
    if (status === '报废') return '报废'
    return status
  }
})

