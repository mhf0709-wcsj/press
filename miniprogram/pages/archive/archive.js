const db = wx.cloud.database()
const equipmentService = require('../../services/equipment-service')

Page({
  data: {
    equipments: [],
    searchKeyword: '',
    enterpriseUser: null,
    swipeIndex: -1,  // 当前滑开的记录索引
    startX: 0,       // 触摸起始X坐标
    startY: 0        // 触摸起始Y坐标
  },

  onLoad() {
    this.loadEnterpriseInfo()
  },

  loadEnterpriseInfo() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser: enterpriseUser })
    this.loadEquipments()
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadEquipments()
  },

  // 下拉刷新
  onPullDownRefresh() {
    console.log('存档页面下拉刷新触发')
    this.loadEquipments()
    setTimeout(() => {
      wx.stopPullDownRefresh()
      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1500
      })
    }, 800)
  },

  async loadEquipments() {
    wx.showLoading({ title: '加载中...' })
    
    const enterpriseUser = this.data.enterpriseUser || wx.getStorageSync('enterpriseUser')
    if (!enterpriseUser || !enterpriseUser.companyName) {
      wx.hideLoading()
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    try {
      const equipments = await equipmentService.searchEquipments(this.data.searchKeyword, { enterpriseUser })
      this.setData({ equipments })
    } catch (err) {
      console.error('加载设备库失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // ========== 关键修复：添加 onSearch 方法 ==========
  onSearch(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })
    
    // 延迟搜索，避免频繁请求
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.loadEquipments()
    }, 300)
  },
  // ===============================================

  viewDetail(e) {
    // 如果有滑开的项，先关闭
    if (this.data.swipeIndex >= 0) {
      this.setData({ swipeIndex: -1 })
      return
    }
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/equipment-detail/equipment-detail?id=${id}`
    })
  },

  // ========== 左滑删除相关方法 ==========
  
  onTouchStart(e) {
    this.setData({
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY
    })
  },

  onTouchMove(e) {
    const { startX, startY, swipeIndex } = this.data
    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const index = e.currentTarget.dataset.index
    
    // 计算滑动距离
    const diffX = startX - currentX
    const diffY = Math.abs(startY - currentY)
    
    // 如果垂直滑动大于水平滑动，不处理（避免影响滚动）
    if (diffY > Math.abs(diffX)) return
    
    // 左滑超过30px且当前项未展开
    if (diffX > 30 && swipeIndex !== index) {
      this.setData({ swipeIndex: index })
    }
    // 右滑超过30px且当前项已展开
    else if (diffX < -30 && swipeIndex === index) {
      this.setData({ swipeIndex: -1 })
    }
  },

  onTouchEnd(e) {
    // 触摸结束，保持当前状态
  },

  // 确认删除
  confirmDelete(e) {
    const id = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#ff4757',
      success: (res) => {
        if (res.confirm) {
          this.performDelete(id, index)
        } else {
          // 取消时关闭滑动
          this.setData({ swipeIndex: -1 })
        }
      }
    })
  },

  // 执行删除
  performDelete(id, index) {
    wx.showLoading({ title: '删除中...' })
    
    db.collection('equipments').doc(id).remove()
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '删除成功', icon: 'success' })
        
        // 从列表中移除
        const equipments = this.data.equipments
        equipments.splice(index, 1)
        this.setData({ 
          equipments: equipments,
          swipeIndex: -1
        })
      })
      .catch(err => {
        wx.hideLoading()
        console.error('删除失败:', err)
        wx.showToast({ title: '删除失败', icon: 'none' })
        this.setData({ swipeIndex: -1 })
      })
  },

  createEquipment() {
    wx.navigateTo({ url: '/pages/equipment-detail/equipment-detail?mode=create' })
  }

})
