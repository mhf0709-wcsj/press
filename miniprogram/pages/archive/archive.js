const equipmentService = require('../../services/equipment-service')

const TEXT = {
  loginFirst: '请先登录',
  loading: '加载中...',
  loadFailed: '加载失败',
  refreshSuccess: '刷新成功',
  deleteTitle: '删除设备',
  deletePrompt: '删除后，该设备会从企业端设备档案中移除，管理端保留删除留痕。\n\n确定删除“{name}”吗？',
  deletePromptAgainTitle: '再次确认删除',
  deletePromptAgain: '请再次确认：删除设备不会删除已建档的压力表，但压力表会保留原所属设备快照。\n\n确定继续删除“{name}”吗？',
  deleteSuccess: '已删除并留痕',
  deleteFailed: '删除失败'
}

Page({
  data: {
    equipments: [],
    searchKeyword: '',
    enterpriseUser: null,
    swipeIndex: -1,
    startX: 0,
    startY: 0,
    deletingId: ''
  },

  onLoad() {
    this.loadEnterpriseInfo()
  },

  onShow() {
    if (this.data.enterpriseUser) {
      this.loadEquipments()
    }
  },

  loadEnterpriseInfo() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser })
    this.loadEquipments()
  },

  onPullDownRefresh() {
    this.loadEquipments().then(() => {
      wx.stopPullDownRefresh()
      wx.showToast({ title: TEXT.refreshSuccess, icon: 'success', duration: 1200 })
    })
  },

  async loadEquipments() {
    const enterpriseUser = this.data.enterpriseUser || wx.getStorageSync('enterpriseUser')
    if (!enterpriseUser || !enterpriseUser.companyName) {
      wx.showToast({ title: TEXT.loginFirst, icon: 'none' })
      return
    }

    wx.showLoading({ title: TEXT.loading })
    try {
      const equipments = await equipmentService.searchEquipments(this.data.searchKeyword, { enterpriseUser })
      this.setData({ equipments, enterpriseUser, swipeIndex: -1 })
    } catch (error) {
      wx.showToast({ title: TEXT.loadFailed, icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onSearch(e) {
    const keyword = String(e.detail.value || '').trim()
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
    if (!id) return
    wx.navigateTo({ url: `/pages/equipment-detail/equipment-detail?id=${id}` })
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

  async confirmDelete(e) {
    const id = e.currentTarget.dataset.id
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.equipments[index]
    if (!id || !item || this.data.deletingId) return

    const name = item.equipmentName || item.equipmentNo || '该设备'
    const firstConfirm = await this.confirmModal(
      TEXT.deleteTitle,
      TEXT.deletePrompt.replace('{name}', name)
    )
    if (!firstConfirm) {
      this.setData({ swipeIndex: -1 })
      return
    }

    const secondConfirm = await this.confirmModal(
      TEXT.deletePromptAgainTitle,
      TEXT.deletePromptAgain.replace('{name}', name)
    )
    if (!secondConfirm) {
      this.setData({ swipeIndex: -1 })
      return
    }

    this.performDelete(id)
  },

  async performDelete(id) {
    this.setData({ deletingId: id })
    wx.showLoading({ title: '删除中...' })

    try {
      await equipmentService.softDeleteEquipment(id, { enterpriseUser: this.data.enterpriseUser })
      this.setData({
        equipments: this.data.equipments.filter((item) => item._id !== id),
        swipeIndex: -1
      })
      wx.showToast({ title: TEXT.deleteSuccess, icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || TEXT.deleteFailed, icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ deletingId: '' })
    }
  },

  confirmModal(title, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        confirmText: '删除',
        confirmColor: '#d92d20',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      })
    })
  },

  createEquipment() {
    wx.navigateTo({ url: '/pages/equipment-detail/equipment-detail?mode=create' })
  }
})
