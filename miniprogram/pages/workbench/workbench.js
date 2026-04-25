const db = wx.cloud.database()
const _ = db.command
const equipmentService = require('../../services/equipment-service')

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
    inactive: '停用',
    scrap: '报废'
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
    { key: 'inactive', label: TEXT.cards.inactive, value: Number(values.inactive || 0), tone: 'warning' },
    { key: 'scrap', label: TEXT.cards.scrap, value: Number(values.scrap || 0), tone: 'danger' }
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
      this.setData({ loading: false })
    }
  },

  async loadDashboard(enterpriseUser) {
    const companyName = enterpriseUser.companyName

    try {
      const [equipmentRes, gaugeRes, inactiveRes, scrapRes] = await Promise.all([
        db.collection('equipments').where({
          enterpriseName: companyName,
          isDeleted: _.neq(true)
        }).count(),
        db.collection('devices').where({
          enterpriseName: companyName,
          isDeleted: _.neq(true)
        }).count(),
        db.collection('devices').where({
          enterpriseName: companyName,
          status: '停用',
          isDeleted: _.neq(true)
        }).count(),
        db.collection('devices').where({
          enterpriseName: companyName,
          status: '报废',
          isDeleted: _.neq(true)
        }).count()
      ])

      this.setData({
        summaryCards: buildSummaryCards({
          equipment: equipmentRes.total,
          gauge: gaugeRes.total,
          inactive: inactiveRes.total,
          scrap: scrapRes.total
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
      const res = await db.collection('devices')
        .where({
          enterpriseName: enterpriseUser.companyName,
          status: _.in(['停用', '报废']),
          isDeleted: _.neq(true)
        })
        .orderBy('updateTime', 'desc')
        .orderBy('createTime', 'desc')
        .limit(5)
        .get()

      this.setData({
        inactiveDevices: (res.data || []).map((item) => ({
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
    if (key === 'inactive') {
      wx.navigateTo({ url: `/pages/device-list/device-list?statuses=${encodeURIComponent('停用')}` })
      return
    }
    if (key === 'scrap') {
      wx.navigateTo({ url: `/pages/device-list/device-list?statuses=${encodeURIComponent('报废')}` })
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
      wx.navigateTo({ url: `/pages/equipment-detail/equipment-detail?id=${first._id}` })
      return
    }
    this.goToCreateEquipment()
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
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
})

