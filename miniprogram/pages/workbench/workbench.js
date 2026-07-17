const dataAccess = require('../../services/data-access-service')
const { runSingleFlight } = require('../../utils/request-control')

const TEXT = {
  eyebrow: '设备中心',
  title: '设备中心',
  dashboardTitle: '仪表盘',
  dashboardNote: '',
  quickTitle: '常用操作',
  createEquipment: '新建设备',
  createEquipmentNote: '先建立设备档案',
  createGauge: '录入压力表',
  createGaugeNote: 'AI 识别或手动建档',
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
    this.pageActive = true
  },

  onReady() {
    this.pageReady = true
    const start = () => {
      if (!this.pageActive) return
      this.bootstrap().finally(() => {
        if (this.pageActive) this.hasLoadedOnce = true
      })
    }
    if (typeof wx.nextTick === 'function') wx.nextTick(start)
    else this.initialLoadTimer = setTimeout(start, 0)
  },

  onShow() {
    if (!this.pageReady || !this.hasLoadedOnce) return

    this.bootstrap()
  },

  onUnload() {
    this.pageActive = false
    if (this.initialLoadTimer) clearTimeout(this.initialLoadTimer)
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
    if (!options.force && this.hasLoadedOnce) {
      try {
        const versionResult = await dataAccess.request('getDataVersion')
        const serverVersion = Number(versionResult.version || 0)
        if (
          this.loadedLedgerVersion === ledgerVersion &&
          this.loadedServerVersion === serverVersion
        ) return
      } catch (error) {
        // 版本检查失败时继续加载，避免页面长期停留在旧数据。
      }
    }

    if (this.pageActive) this.setData({ loading: true, enterpriseUser })
    try {
      const dashboard = await dataAccess.request('getEnterpriseDashboard')
      const summary = dashboard.summary || {}
      const bindingData = dashboard.bindingReminder || {}
      const bindingItems = Array.isArray(bindingData.items) ? bindingData.items : []
      const inactiveItems = Array.isArray(dashboard.inactiveDevices) ? dashboard.inactiveDevices : []
      const summaryCards = buildSummaryCards({
        equipment: summary.equipmentCount,
        gauge: summary.gaugeCount,
        expired: summary.expiredCount,
        inactiveScrap: summary.inactiveCount
      })
      const bindingReminder = {
        count: Number(bindingData.count || 0),
        summary: Number(bindingData.count || 0)
          ? TEXT.bindingSummary.replace('{count}', String(bindingData.count))
          : TEXT.bindingEmpty,
        items: bindingItems.map((item) => ({
          _id: item._id,
          title: item.equipmentName || TEXT.fallbackEquipmentTitle,
          subtitle: item.location || item.equipmentNo || TEXT.fallbackEquipmentSubtitle
        }))
      }
      const inactiveDevices = inactiveItems.map((item) => ({
        _id: item._id,
        title: item.deviceName || item.factoryNo || TEXT.fallbackGaugeTitle,
        subtitle: item.equipmentName || item.factoryNo || TEXT.fallbackGaugeSubtitle,
        status: this.normalizeStatus(item.status || '-')
      }))
      if (!this.pageActive) return
      this.setData({
        summaryCards,
        bindingReminder,
        inactiveDevices,
        loading: false
      })
      this.loadedServerVersion = Number(dashboard.version || 0)
    } catch (error) {
      if (this.pageActive) {
        this.setData({
          summaryCards: buildSummaryCards(),
          bindingReminder: {
            count: 0,
            summary: TEXT.bindingEmpty,
            items: []
          },
          inactiveDevices: [],
          loading: false
        })
      }
    } finally {
      this.loadedLedgerVersion = ledgerVersion
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

  goToGaugeEntry() {
    wx.switchTab({ url: '/pages/ai-assistant/ai-assistant' })
  },

  handleBindingReminder() {
    const first = this.data.bindingReminder?.items?.[0]
    if (first?._id) {
      wx.navigateTo({ url: `/pages/equipment-detail/equipment-detail?id=${first._id}` })
    }
  },

  openUnboundEquipment(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
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

