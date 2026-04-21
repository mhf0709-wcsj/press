const db = wx.cloud.database()
const equipmentService = require('../../services/equipment-service')

Page({
  data: {
    equipments: [],
    searchKeyword: '',
    enterpriseUser: null,
    swipeIndex: -1,
    startX: 0,
    startY: 0
  },

  onLoad() {
    this.loadEnterpriseInfo()
  },

  loadEnterpriseInfo() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser })
    this.loadEquipments()
  },

  onShow() {
    this.loadEquipments()
  },

  onPullDownRefresh() {
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

  onSearch(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })

    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.loadEquipments()
    }, 300)
  },

  viewDetail(e) {
    if (this.data.swipeIndex >= 0) {
      this.setData({ swipeIndex: -1 })
      return
    }
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/equipment-detail/equipment-detail?id=${id}`
    })
  },

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

    const diffX = startX - currentX
    const diffY = Math.abs(startY - currentY)

    if (diffY > Math.abs(diffX)) return

    if (diffX > 30 && swipeIndex !== index) {
      this.setData({ swipeIndex: index })
    } else if (diffX < -30 && swipeIndex === index) {
      this.setData({ swipeIndex: -1 })
    }
  },

  onTouchEnd() {},

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
          this.setData({ swipeIndex: -1 })
        }
      }
    })
  },

  performDelete(id, index) {
    wx.showLoading({ title: '删除中...' })

    db.collection('equipments').doc(id).remove()
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '删除成功', icon: 'success' })

        const equipments = this.data.equipments
        equipments.splice(index, 1)
        this.setData({
          equipments,
          swipeIndex: -1
        })
      })
      .catch((err) => {
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
