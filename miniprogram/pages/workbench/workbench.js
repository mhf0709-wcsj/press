const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    enterpriseUser: null,
    summary: {
      equipmentCount: 0,
      gaugeCount: 0,
      expiringSoon: 0,
      expired: 0
    },
    quickActions: [
      {
        key: 'camera',
        title: '拍照识别',
        desc: '上传检定证书并自动填表',
        accent: 'brand'
      },
      {
        key: 'manual',
        title: '手动录入',
        desc: '不拍照也能直接建档',
        accent: 'accent'
      },
      {
        key: 'equipment',
        title: '新建设备',
        desc: '补齐设备台账与绑定关系',
        accent: 'dark'
      }
    ],
    shortcuts: [
      { key: 'archive', label: '设备台账', value: '查看全部设备' },
      { key: 'alerts', label: '到期提醒', value: '追踪临期压力表' },
      { key: 'profile', label: '账号与订阅', value: '管理通知与设置' }
    ],
    recentEquipments: [],
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

    this.setData({ enterpriseUser, loading: true })

    try {
      await Promise.all([
        this.loadSummary(enterpriseUser),
        this.loadRecentEquipments(enterpriseUser),
        this.loadRecentRecords(enterpriseUser)
      ])
    } catch (error) {
      console.error('Workbench bootstrap failed:', error)
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadSummary(enterpriseUser) {
    const companyName = enterpriseUser.companyName
    const today = this.formatDate(new Date())
    const threshold = this.formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

    const equipmentPromise = db.collection('equipments')
      .where({ enterpriseName: companyName })
      .count()

    const gaugePromise = db.collection('devices')
      .where({ enterpriseName: companyName })
      .count()

    const expiringPromise = db.collection('pressure_records')
      .where({
        enterpriseName: companyName,
        expiryDate: _.gte(today).and(_.lte(threshold))
      })
      .count()

    const expiredPromise = db.collection('pressure_records')
      .where({
        enterpriseName: companyName,
        expiryDate: _.lt(today)
      })
      .count()

    const [equipmentRes, gaugeRes, expiringRes, expiredRes] = await Promise.all([
      equipmentPromise,
      gaugePromise,
      expiringPromise,
      expiredPromise
    ])

    this.setData({
      summary: {
        equipmentCount: equipmentRes.total || 0,
        gaugeCount: gaugeRes.total || 0,
        expiringSoon: expiringRes.total || 0,
        expired: expiredRes.total || 0
      }
    })
  },

  async loadRecentEquipments(enterpriseUser) {
    const res = await db.collection('equipments')
      .where({ enterpriseName: enterpriseUser.companyName })
      .orderBy('createTime', 'desc')
      .limit(3)
      .get()

    this.setData({
      recentEquipments: (res.data || []).map((item) => ({
        _id: item._id,
        title: item.equipmentName || '未命名设备',
        subtitle: item.location || item.equipmentNo || '待补充位置信息',
        meta: item.equipmentNo || '未填写编号'
      }))
    })
  },

  async loadRecentRecords(enterpriseUser) {
    const res = await db.collection('pressure_records')
      .where({ enterpriseName: enterpriseUser.companyName })
      .orderBy('createTime', 'desc')
      .limit(3)
      .get()

    this.setData({
      recentRecords: (res.data || []).map((item) => ({
        _id: item._id,
        title: item.factoryNo || item.certNo || '新建检定记录',
        subtitle: item.instrumentName || item.sendUnit || '待补充器具信息',
        meta: item.verificationDate || item.createTime || ''
      }))
    })
  },

  handleQuickAction(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'camera') {
      wx.navigateTo({ url: '/pages/camera/camera' })
      return
    }
    if (key === 'manual') {
      wx.navigateTo({ url: '/pages/camera/camera?tab=manual' })
      return
    }
    if (key === 'equipment') {
      wx.navigateTo({ url: '/pages/equipment-detail/equipment-detail?mode=create' })
    }
  },

  handleShortcut(e) {
    const { key } = e.currentTarget.dataset
    if (key === 'archive' || key === 'alerts') {
      wx.switchTab({ url: '/pages/archive/archive' })
      return
    }
    if (key === 'profile') {
      wx.switchTab({ url: '/pages/user/user' })
    }
  },

  openEquipment(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/equipment-detail/equipment-detail?id=${id}` })
  },

  openRecord(e) {
    const { id } = e.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
})
