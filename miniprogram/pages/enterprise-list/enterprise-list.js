const dataAccess = require('../../services/data-access-service')

const TEXT = {
  heroTopline: '企业',
  heroTitle: '\u4f01\u4e1a\u7ba1\u7406',
  heroDesc: '',
  riskTitle: '\u98ce\u9669\u4f01\u4e1a',
  riskDesc: '',
  loading: '\u52a0\u8f7d\u4e2d...',
  empty: '\u6682\u65e0\u4f01\u4e1a',
  emptyRisk: '\u6682\u65e0\u98ce\u9669\u4f01\u4e1a',
  noDistrict: '\u672a\u8bbe\u7f6e\u8f96\u533a',
  fields: {
    legalPerson: '\u6cd5\u4eba\u4ee3\u8868',
    phone: '\u8054\u7cfb\u7535\u8bdd',
    createTime: '\u6ce8\u518c\u65f6\u95f4'
  }
}

Page({
  data: {
    text: TEXT,
    enterpriseList: [],
    loading: true,
    mode: 'all'
  },

  onLoad(options) {
    const mode = options.mode === 'risk' ? 'risk' : 'all'
    this.setData({ mode }, () => {
      this.loadEnterpriseList().finally(() => {
        this.hasLoadedOnce = true
      })
    })
  },

  onShow() {
    if (!this.hasLoadedOnce) return
    this.loadEnterpriseList()
  },

  onPullDownRefresh() {
    this.loadEnterpriseList()
      .finally(() => wx.stopPullDownRefresh())
  },

  async loadEnterpriseList() {
    this.setData({ loading: true })

    try {
      if (this.data.mode === 'risk') {
        const riskEnterprises = await this.loadRiskEnterprises()
        const enterpriseList = riskEnterprises.map((item) => ({
          _id: item.enterpriseName || item.phone || String(Math.random()),
          companyName: item.enterpriseName || '-',
          district: item.district || '',
          legalPerson: '',
          phone: item.phone || '',
          createTimeStr: '',
          expiredCount: item.expiredCount || 0,
          expiringCount: item.expiringCount || 0
        }))

        this.setData({
          enterpriseList,
          loading: false
        })
        return
      }

      const enterprises = await dataAccess.list('enterprises', {
        orderBy: { field: 'createTime', direction: 'desc' },
        limit: 100
      })

      const enterpriseList = enterprises.map((item) => ({
        ...item,
        createTimeStr: this.formatDateTime(item.createTime)
      }))

      this.setData({
        enterpriseList,
        loading: false
      })
    } catch (error) {
      console.error('Enterprise list load failed:', error)
      this.setData({ loading: false })
      wx.showToast({
        title: '\u52a0\u8f7d\u5931\u8d25',
        icon: 'none'
      })
    }
  },

  async loadRiskEnterprises() {
    const adminUser = wx.getStorageSync('adminUser') || {}
    const data = {
      action: 'getExpiringSummary',
      days: 30
    }
    if (adminUser.role === 'district' && adminUser.district) {
      data.district = adminUser.district
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'expiryReminder',
        data
      })
      if (!res.result?.success) throw new Error('风险企业加载失败')

      const list = res.result.data?.enterpriseStats || []
      wx.setStorageSync('dashboardRiskEnterprises', list)
      return list
    } catch (error) {
      return wx.getStorageSync('dashboardRiskEnterprises') || []
    }
  },

  formatDateTime(dateInput) {
    if (!dateInput) return '-'

    let date
    if (typeof dateInput === 'string') {
      date = new Date(dateInput)
    } else if (dateInput instanceof Date) {
      date = dateInput
    } else if (dateInput.$date) {
      date = new Date(dateInput.$date)
    } else {
      return '-'
    }

    if (Number.isNaN(date.getTime())) return '-'

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  previewEnterprise(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return

    wx.navigateTo({
      url: `/pages/admin/admin?view=equipments&enterprise=${encodeURIComponent(name)}&from=dashboard&filter=${this.data.mode === 'risk' ? 'risk' : 'expiry'}`
    })
  }
})
