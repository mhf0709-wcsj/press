const db = wx.cloud.database()

Page({
  data: {
    enterpriseList: [],
    loading: true
  },

  onLoad() {
    this.loadEnterpriseList()
  },

  loadEnterpriseList() {
    this.setData({ loading: true })
    
    db.collection('enterprises')
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
      .then(res => {
        // 格式化时间
        const list = res.data.map(item => {
          return {
            ...item,
            createTimeStr: this.formatDateTime(item.createTime)
          }
        })
        this.setData({
          enterpriseList: list,
          loading: false
        })
      })
      .catch(err => {
        console.error('加载企业列表失败:', err)
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  // 格式化日期时间
  formatDateTime(dateInput) {
    if (!dateInput) return '-'
    
    let date
    if (typeof dateInput === 'string') {
      date = new Date(dateInput)
    } else if (dateInput instanceof Date) {
      date = dateInput
    } else if (dateInput.$date) {
      // MongoDB Date 格式
      date = new Date(dateInput.$date)
    } else {
      return '-'
    }
    
    if (isNaN(date.getTime())) return '-'
    
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  goBack() {
    wx.navigateBack()
  },

  previewEnterprise(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    wx.navigateTo({
      url: `/pages/admin/admin?view=equipment&enterprise=${encodeURIComponent(name)}&from=dashboard`
    })
  }
})
