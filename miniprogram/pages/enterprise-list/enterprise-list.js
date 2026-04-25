const db = wx.cloud.database()

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
      this.loadEnterpriseList()
    })
  },

  onPullDownRefresh() {
    this.loadEnterpriseList()
      .finally(() => wx.stopPullDownRefresh())
  },

  async loadEnterpriseList() {
    this.setData({ loading: true })

    try {
      if (this.data.mode === 'risk') {
        const stored = wx.getStorageSync('dashboardRiskEnterprises') || []
        const enterpriseList = stored.map((item) => ({
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

      const res = await db.collection('enterprises')
        .orderBy('createTime', 'desc')
        .limit(100)
        .get()

      const enterpriseList = (res.data || []).map((item) => ({
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
