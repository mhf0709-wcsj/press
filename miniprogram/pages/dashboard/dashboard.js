const db = wx.cloud.database()

const TEXT = {
  heroTopline: 'Regulatory Home',
  heroTitle: '\u76d1\u7ba1\u9996\u9875',
  heroDesc: '\u5728\u8fd9\u91cc\u67e5\u770b\u5168\u5c40\u603b\u89c8\u3001\u98ce\u9669\u63d0\u9192\u548c\u5feb\u6377\u5165\u53e3\uff0c\u628a\u9996\u9875\u4fdd\u6301\u5728\u8f7b\u91cf\u51b3\u7b56\u5c42\u3002',
  summaryTitle: '\u6838\u5fc3\u603b\u89c8',
  summaryDesc: '\u70b9\u51fb\u6570\u5b57\u53ef\u7ee7\u7eed\u4e0b\u94bb\u5230\u53f0\u8d26\u6216\u7ba1\u7406\u5217\u8868',
  riskTitle: '\u98ce\u9669\u63d0\u9192',
  riskDesc: '\u4f18\u5148\u5904\u7406\u8fc7\u671f\u548c 30 \u5929\u5185\u5230\u671f\u8bbe\u5907',
  entryTitle: '\u5feb\u6377\u5165\u53e3',
  entryDesc: '\u7ba1\u7406\u7aef\u7684\u5e38\u7528\u64cd\u4f5c\u90fd\u4ece\u8fd9\u91cc\u8fdb',
  enterpriseRiskTitle: '\u91cd\u70b9\u4f01\u4e1a',
  emptyRisk: '\u6682\u65f6\u6ca1\u6709\u9700\u8981\u4f18\u5148\u5904\u7406\u7684\u4f01\u4e1a',
  filteredEnterpriseTitle: '\u98ce\u9669\u4f01\u4e1a',
  totalRecords: '\u68c0\u5b9a\u8bb0\u5f55',
  totalEnterprises: '\u4f01\u4e1a\u6570',
  totalDistricts: '\u8f96\u533a\u6570',
  expiredCount: '\u5df2\u8fc7\u671f',
  expiringCount: '30\u5929\u5185\u5230\u671f',
  enterpriseCount: '\u6d89\u53ca\u4f01\u4e1a',
  viewAll: '\u67e5\u770b\u5168\u90e8',
  noPhone: '\u672a\u7559\u8054\u7cfb\u65b9\u5f0f',
  loading: '\u52a0\u8f7d\u4e2d...'
}

Page({
  data: {
    text: TEXT,
    overviewData: {
      totalRecords: 0,
      totalEnterprises: 0,
      totalDistricts: 0
    },
    expirySummary: {
      expiredCount: 0,
      expiringCount: 0,
      enterpriseCount: 0
    },
    expiryEnterprises: [],
    adminName: '',
    adminDistrict: '',
    isAdmin: true,
    loading: true,
    quickEntries: []
  },

  onLoad() {
    this.checkAdminType()
  },

  onShow() {
    if (this.data.adminName) {
      this.loadAllData()
    }
  },

  onPullDownRefresh() {
    this.loadAllData()
      .finally(() => {
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
      adminName: isDistrictAdmin ? `${adminInfo.district}\u8f96\u533a` : '\u603b\u7ba1\u7406\u7aef',
      quickEntries: this.buildQuickEntries(!isDistrictAdmin)
    }, () => {
      this.loadAllData()
    })
  },

  buildQuickEntries(isAdmin) {
    const entries = [
      {
        key: 'ledger',
        title: '\u53f0\u8d26\u4e2d\u5fc3',
        subtitle: '\u67e5\u770b\u8bb0\u5f55\u3001\u8bbe\u5907\u548c\u7b5b\u9009\u7ed3\u679c',
        action: 'goToLedger'
      },
      {
        key: 'enterprise',
        title: '\u4f01\u4e1a\u7ba1\u7406',
        subtitle: '\u67e5\u770b\u4f01\u4e1a\u8d26\u53f7\u3001\u8054\u7cfb\u4eba\u548c\u8f96\u533a',
        action: 'goToEnterpriseList'
      },
      {
        key: 'enforcement',
        title: '\u73b0\u573a\u6838\u9a8c',
        subtitle: '\u626b\u7801\u6838\u9a8c\u3001\u62cd\u7167\u53d6\u8bc1\u548c\u7559\u75d5',
        action: 'goToEnforcement'
      },
      {
        key: 'settings',
        title: '\u8d26\u53f7\u8bbe\u7f6e',
        subtitle: '\u67e5\u770b\u7ba1\u7406\u7aef\u8d26\u53f7\u548c\u5b89\u5168\u8bbe\u7f6e',
        action: 'goToAccountSettings'
      }
    ]

    if (isAdmin) {
      entries.splice(2, 0, {
        key: 'district',
        title: '\u8f96\u533a\u7edf\u8ba1',
        subtitle: '\u6309\u8f96\u533a\u67e5\u770b\u8bbe\u5907\u548c\u8bb0\u5f55\u5206\u5e03',
        action: 'goToDistrictList'
      })
    }

    return entries
  },

  async loadAllData() {
    this.setData({ loading: true })
    wx.showLoading({ title: TEXT.loading })

    try {
      await Promise.all([
        this.loadOverviewData(),
        this.loadExpiryData()
      ])
    } catch (error) {
      console.error('Dashboard load failed:', error)
      wx.showToast({
        title: '\u6570\u636e\u52a0\u8f7d\u5931\u8d25',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
    }
  },

  async loadOverviewData() {
    const recordsQuery = this.buildScopedRecordQuery()
    const countRes = await recordsQuery.count()

    const listRes = await this.buildScopedRecordQuery()
      .field({
        enterpriseName: true,
        district: true
      })
      .limit(1000)
      .get()

    const enterpriseSet = new Set()
    const districtSet = new Set()

    ;(listRes.data || []).forEach((item) => {
      if (item.enterpriseName) enterpriseSet.add(item.enterpriseName)
      if (item.district) districtSet.add(item.district)
    })

    this.setData({
      'overviewData.totalRecords': countRes.total || 0,
      'overviewData.totalEnterprises': enterpriseSet.size,
      'overviewData.totalDistricts': districtSet.size
    })
  },

  buildScopedRecordQuery() {
    let query = db.collection('pressure_records')
    if (this.data.adminDistrict) {
      query = query.where({
        district: this.data.adminDistrict
      })
    }
    return query
  },

  async loadExpiryData() {
    const data = {
      action: 'getExpiringSummary',
      days: 30
    }

    if (this.data.adminDistrict) {
      data.district = this.data.adminDistrict
    }

    const res = await wx.cloud.callFunction({
      name: 'expiryReminder',
      data
    })

    if (!res.result || !res.result.success) {
      throw new Error('Expiry summary failed.')
    }

    const summary = res.result.data?.summary || {}
    const enterprises = (res.result.data?.enterpriseStats || []).slice(0, 5)

    this.setData({
      expirySummary: {
        expiredCount: summary.expiredCount || 0,
        expiringCount: summary.expiringCount || 0,
        enterpriseCount: summary.enterpriseCount || 0
      },
      expiryEnterprises: enterprises
    })
  },

  onTapSummary(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'records') {
      this.goToLedger()
      return
    }

    if (type === 'enterprises') {
      this.goToEnterpriseList()
      return
    }

    if (type === 'districts') {
      this.goToDistrictList()
    }
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

  onTapEntry(e) {
    const action = e.currentTarget.dataset.action
    if (!action || typeof this[action] !== 'function') return
    this[action]()
  },

  goToLedger() {
    wx.navigateTo({
      url: '/pages/admin/admin?from=dashboard'
    })
  },

  goToEnterpriseList() {
    wx.navigateTo({
      url: '/pages/enterprise-list/enterprise-list'
    })
  },

  goToRiskEnterpriseList() {
    const enterpriseList = this.data.expiryEnterprises || []
    wx.setStorageSync('dashboardRiskEnterprises', enterpriseList)
    wx.navigateTo({
      url: '/pages/enterprise-list/enterprise-list?mode=risk'
    })
  },

  goToDistrictList() {
    if (!this.data.isAdmin) {
      this.goToLedger()
      return
    }

    wx.navigateTo({
      url: '/pages/district-list/district-list'
    })
  },

  goToEnforcement() {
    wx.navigateTo({
      url: '/pages/enforcement/enforcement'
    })
  },

  goToAccountSettings() {
    wx.navigateTo({
      url: '/pages/account-settings/account-settings'
    })
  }
})
