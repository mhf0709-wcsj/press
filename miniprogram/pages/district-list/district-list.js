const db = wx.cloud.database()

const TEXT = {
  heroTopline: 'District Stats',
  heroTitle: '\u8f96\u533a\u7edf\u8ba1',
  heroDesc: '\u6309\u8f96\u533a\u67e5\u770b\u8bbe\u5907\u5206\u5e03\uff0c\u70b9\u51fb\u4efb\u4e00\u8f96\u533a\u53ef\u7ee7\u7eed\u8fdb\u5165\u53f0\u8d26\u4e2d\u5fc3\u7b5b\u9009\u3002',
  summaryTitle: '\u8bbe\u5907\u603b\u6570',
  summaryDesc: '\u5168\u5e73\u53f0\u5df2\u5efa\u6863\u8bbe\u5907',
  empty: '\u6682\u65f6\u6ca1\u6709\u8f96\u533a\u6570\u636e',
  unit: '\u53f0'
}

Page({
  data: {
    text: TEXT,
    districtStats: [],
    totalEquipments: 0,
    loading: true
  },

  onLoad() {
    this.loadDistrictData()
  },

  onPullDownRefresh() {
    this.loadDistrictData()
      .finally(() => wx.stopPullDownRefresh())
  },

  async loadDistrictData() {
    this.setData({ loading: true })

    try {
      const res = await db.collection('equipments')
        .field({ district: true })
        .limit(1000)
        .get()

      const equipments = res.data || []
      const totalEquipments = equipments.length
      const districtMap = {}

      equipments.forEach((item) => {
        const district = item.district || '\u672a\u8bbe\u7f6e'
        districtMap[district] = (districtMap[district] || 0) + 1
      })

      const districtStats = Object.keys(districtMap)
        .map((district) => ({
          district,
          count: districtMap[district],
          percent: totalEquipments > 0 ? Math.round(districtMap[district] / totalEquipments * 100) : 0
        }))
        .sort((a, b) => b.count - a.count)

      this.setData({
        districtStats,
        totalEquipments,
        loading: false
      })
    } catch (error) {
      console.error('District data load failed:', error)
      this.setData({ loading: false })
      wx.showToast({
        title: '\u52a0\u8f7d\u5931\u8d25',
        icon: 'none'
      })
    }
  },

  goToDistrictRecords(e) {
    const district = e.currentTarget.dataset.district
    if (!district) return
    wx.navigateTo({
      url: `/pages/admin/admin?view=equipments&from=dashboard&district=${encodeURIComponent(district)}`
    })
  }
})
