const { runSingleFlight } = require('../../utils/request-control')
const expiryReminderService = require('../../services/expiry-reminder-service')

const TEXT = {
  heroTitle: '\u9884\u89c8\u5e73\u53f0',
  heroDesc: '',
  switchPreview: '\u9884\u89c8\u5e73\u53f0',
  switchWorkbench: '\u7ba1\u7406\u5de5\u4f5c\u53f0',
  summaryTitle: '\u6838\u5fc3\u603b\u89c8',
  summaryDesc: '',
  districtStatsTitle: '\u8f96\u533a\u7edf\u8ba1',
  districtStatsDesc: '\u6309\u8bbe\u5907\u6240\u5c5e\u8f96\u533a\u6c47\u603b',
  emptyDistrictStats: '\u6682\u65e0\u8f96\u533a\u6570\u636e',
  taskTitle: '监管待办',
  pendingEnterprise: '待审核企业',
  pendingReview: '待复核整改',
  overdueTask: '逾期整改',
  riskTitle: '\u98ce\u9669\u63d0\u9192',
  riskDesc: '',
  enterpriseRiskTitle: '\u91cd\u70b9\u4f01\u4e1a',
  emptyRisk: '\u6682\u65e0',
  totalRecords: '\u68c0\u5b9a\u8bb0\u5f55',
  expiredCount: '逾期',
  expiringCount: '30\u5929\u5185\u5230\u671f',
  enterpriseCount: '\u6d89\u53ca\u4f01\u4e1a',
  focusExpiredSuffix: '逾期',
  focusExpiringSuffix: '\u5373\u5c06\u5230\u671f',
  viewAll: '\u67e5\u770b\u5168\u90e8',
  noPhone: '-',
  loading: '\u52a0\u8f7d\u4e2d...',
  entryReminderTitle: '\u4eca\u65e5\u76d1\u7ba1\u98ce\u9669',
  entryReminderConfirm: '\u53bb\u5904\u7406',
  entryReminderCancel: '\u7a0d\u540e\u5904\u7406',
  entryReminderBadge: '\u5230\u671f\u63d0\u9192',
  entryReminderFallbackSubtitle: ''
}

Page({
  data: {
    text: TEXT,
    overviewData: {
      totalRecords: 0
    },
    expirySummary: {
      expiredCount: 0,
      expiringCount: 0,
      enterpriseCount: 0
    },
    expiryEnterprises: [],
    districtStats: [],
    totalDistrictEquipments: 0,
    taskSummary: {
      pendingEnterpriseCount: 0,
      pendingReviewCount: 0,
      overdueCount: 0
    },
    adminName: '',
    adminDistrict: '',
    isAdmin: true,
    loading: true,
    reminderVisible: false,
    reminderCard: {
      title: '',
      summary: '',
      items: []
    }
  },

  onLoad() {
    this.checkAdminType()
  },

  onShow() {
    if (!this.hasLoadedOnce || !this.data.adminName) return
    this.loadAllData({ silent: true })
  },

  onPullDownRefresh() {
    this.loadAllData({ force: true }).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  checkAdminType() {
    const adminInfo = wx.getStorageSync('adminUser')
    if (!adminInfo) {
      wx.redirectTo({
        url: '/pages/admin-login/admin-login'
      })
      return
    }

    const isDistrictAdmin = adminInfo.role === 'district' && adminInfo.district
    this.setData({
      isAdmin: !isDistrictAdmin,
      adminDistrict: isDistrictAdmin ? adminInfo.district : '',
      adminName: isDistrictAdmin ? `${adminInfo.district}\u8f96\u533a` : '\u603b\u7ba1\u7406\u7aef'
    }, () => {
      this.loadAllData()
    })
  },

  loadAllData(options = {}) {
    return runSingleFlight(this, 'loadAllData', () => this.performLoadAllData(options), {
      queueLatest: !!options.force
    })
  },

  async performLoadAllData(options = {}) {
    if (!options.silent) this.setData({ loading: true })

    try {
      const result = await expiryReminderService.getAdminWorkspaceSummary(30, this.data.adminDistrict || '')
      if (!result?.success) throw new Error(result?.error || '监管数据加载失败')

      const data = result.data || {}
      const summary = data.summary || {}
      const taskSummary = data.taskSummary || {}
      const totalDistrictEquipments = Number(data.totalDistrictEquipments || 0)
      const districtStats = this.data.isAdmin
        ? (data.districtStats || []).map((item) => ({
          ...item,
          percent: totalDistrictEquipments > 0
            ? Math.round(Number(item.count || 0) / totalDistrictEquipments * 100)
            : 0
        })).slice(0, 6)
        : []

      this.setData({
        'overviewData.totalRecords': Number(summary.totalRecords || 0),
        expirySummary: {
          expiredCount: Number(summary.expiredCount || 0),
          expiringCount: Number(summary.expiringCount || 0),
          enterpriseCount: Number(summary.enterpriseCount || 0)
        },
        expiryEnterprises: (data.enterpriseStats || []).slice(0, 5),
        districtStats,
        totalDistrictEquipments: this.data.isAdmin ? totalDistrictEquipments : 0,
        taskSummary: {
          pendingEnterpriseCount: Number(data.pendingEnterpriseCount || 0),
          pendingReviewCount: Number(taskSummary.pendingReviewCount || 0),
          overdueCount: Number(taskSummary.overdueCount || 0)
        }
      })
      this.loadedServerVersion = Number(data.version || 0)
      this.maybeOpenAdminReminder()
    } catch (error) {
      console.error('Dashboard load failed:', error)
      wx.showToast({
        title: '\u6570\u636e\u52a0\u8f7d\u5931\u8d25',
        icon: 'none'
      })
    } finally {
      this.hasLoadedOnce = true
      this.setData({ loading: false })
    }
  },

  buildAdminReminderStorageKey() {
    return `adminRiskReminder_${this.data.adminDistrict || 'all'}`
  },

  hasDeferredAdminReminderToday() {
    return wx.getStorageSync(this.buildAdminReminderStorageKey()) === this.formatDate(new Date())
  },

  deferAdminReminderToday() {
    wx.setStorageSync(this.buildAdminReminderStorageKey(), this.formatDate(new Date()))
  },

  maybeOpenAdminReminder() {
    const app = typeof getApp === 'function' ? getApp() : null
    const token = app?.globalData?.entryReminderToken || 0

    if (token && app?.globalData?.entryReminderHandledToken === token) {
      return
    }

    if (this.hasDeferredAdminReminderToday()) {
      if (app?.globalData && token) {
        app.globalData.entryReminderHandledToken = token
      }
      return
    }

    const expiredCount = Number(this.data.expirySummary.expiredCount || 0)
    const expiringCount = Number(this.data.expirySummary.expiringCount || 0)
    const enterpriseCount = Number(this.data.expirySummary.enterpriseCount || 0)

    if (expiredCount + expiringCount <= 0) return

    const scope = this.data.adminDistrict
      ? `${this.data.adminDistrict}\u8f96\u533a`
      : '\u5f53\u524d\u5e73\u53f0'
    const summary = `${scope}\u6709 ${enterpriseCount} \u5bb6\u91cd\u70b9\u4f01\u4e1a\u9700\u8981\u8ddf\u8fdb\uff0c\u5176\u4e2d ${expiredCount} \u53f0\u5df2\u8fc7\u671f\uff0c${expiringCount} \u53f0\u5c06\u5728 30 \u5929\u5185\u5230\u671f\u3002`

    if (app?.globalData && token) {
      app.globalData.entryReminderHandledToken = token
    }

    this.setData({
      reminderVisible: true,
      reminderCard: {
        title: TEXT.entryReminderTitle,
        summary,
        items: this.data.expiryEnterprises || []
      }
    })
  },

  closeReminderCard() {
    this.deferAdminReminderToday()
    this.setData({ reminderVisible: false })
  },

  confirmReminderCard() {
    this.setData({ reminderVisible: false })
    this.goToRiskEnterpriseList()
  },

  onTapSummary() {
    this.goToLedger()
  },

  onTapRisk(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === 'enterprise') {
      this.goToRiskEnterpriseList()
      return
    }

    wx.navigateTo({
      url: `/pages/admin/admin?from=dashboard&filter=${filter}`
    })
  },

  onTapTask(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'enterprise') {
      wx.navigateTo({ url: '/pages/enterprise-list/enterprise-list' })
      return
    }
    const status = type === 'pendingReview' ? 'pending_review' : 'overdue'
    wx.navigateTo({ url: `/pages/admin-notices/admin-notices?status=${status}` })
  },

  goToLedger() {
    wx.navigateTo({
      url: '/pages/admin/admin?from=dashboard'
    })
  },

  goToAdminWorkbench() {
    wx.redirectTo({
      url: '/pages/admin-workbench/admin-workbench'
    })
  },

  goToRiskEnterpriseList() {
    const enterpriseList = this.data.expiryEnterprises || []
    wx.setStorageSync('dashboardRiskEnterprises', enterpriseList)
    wx.navigateTo({
      url: '/pages/enterprise-list/enterprise-list?mode=risk'
    })
  },

  openRiskEnterpriseList() {
    this.goToRiskEnterpriseList()
  },

  openDistrictList() {
    if (!this.data.isAdmin) return
    wx.navigateTo({
      url: '/pages/district-list/district-list'
    })
  },

  formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
})
