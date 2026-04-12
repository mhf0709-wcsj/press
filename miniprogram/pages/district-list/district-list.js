const db = wx.cloud.database()

Page({
  data: {
    districtStats: [],
    totalEquipments: 0,
    loading: true
  },

  onLoad() {
    this.loadDistrictData()
  },

  loadDistrictData() {
    this.setData({ loading: true })
    
    // 获取设备库统计辖区分布
    db.collection('equipments')
      .field({ district: true })
      .limit(1000)
      .get()
      .then(res => {
        const equipments = res.data
        const totalEquipments = equipments.length
        
        // 统计辖区分布
        const districtMap = {}
        equipments.forEach(r => {
          const d = r.district || '未设置'
          districtMap[d] = (districtMap[d] || 0) + 1
        })
        
        const districtStats = Object.keys(districtMap)
          .map(district => ({
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
      })
      .catch(err => {
        console.error('加载辖区数据失败:', err)
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  // 跳转到指定辖区的记录列表
  goToDistrictRecords(e) {
    const district = e.currentTarget.dataset.district
    wx.navigateTo({
      url: `/pages/admin/admin?view=equipment&from=dashboard&district=${encodeURIComponent(district)}`
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
