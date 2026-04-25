const deviceService = require('../../services/device-service')

const TEXT = {
  loginFirst: '\u8bf7\u5148\u767b\u5f55',
  listTitle: '\u538b\u529b\u8868\u5217\u8868',
  listSubtitle: '',
  inactiveTitle: '\u505c\u7528\u53ca\u62a5\u5e9f\u538b\u529b\u8868',
  inactiveSubtitle: '',
  loading: '\u52a0\u8f7d\u4e2d...',
  loadFailed: '\u52a0\u8f7d\u5931\u8d25',
  deleteTitle: '\u5220\u9664\u538b\u529b\u8868',
  deletePrompt: '\u5220\u9664\u540e\uff0c\u8fd9\u5757\u538b\u529b\u8868\u5c06\u4ece\u4f01\u4e1a\u7aef\u5217\u8868\u4e2d\u79fb\u9664\uff0c\u7ba1\u7406\u7aef\u4f1a\u4fdd\u7559\u5220\u9664\u7559\u75d5\u3002\n\n\u662f\u5426\u7ee7\u7eed\u5220\u9664\u201c{name}\u201d\uff1f',
  deletePromptAgainTitle: '\u518d\u6b21\u786e\u8ba4\u5220\u9664',
  deletePromptAgain: '\u8bf7\u518d\u6b21\u786e\u8ba4\uff1a\n\n\u5220\u9664\u540e\u5c06\u65e0\u6cd5\u5728\u4f01\u4e1a\u7aef\u76f4\u63a5\u6062\u590d\u3002\n\n\u786e\u5b9a\u5220\u9664\u201c{name}\u201d\u5417\uff1f',
  deleteSuccess: '\u5df2\u5220\u9664',
  deleteSuccessWithLog: '\u5df2\u5220\u9664\u5e76\u8bb0\u5f55\u7559\u75d5',
  deleteFailed: '\u5220\u9664\u5931\u8d25',
  createHint: '\u8bf7\u5148\u9009\u62e9\u8bbe\u5907'
}

Page({
  data: {
    devices: [],
    searchKeyword: '',
    isLoading: false,
    enterpriseUser: null,
    statuses: [],
    pageTitle: TEXT.listTitle,
    pageSubtitle: TEXT.listSubtitle,
    swipeOpenId: '',
    deletingId: ''
  },

  onLoad(options = {}) {
    const user = wx.getStorageSync('enterpriseUser')
    if (!user) {
      wx.showToast({ title: TEXT.loginFirst, icon: 'none' })
      return
    }

    const statuses = String(options.statuses || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    const isInactiveOnly = statuses.length > 0 && statuses.every((item) => ['\u505c\u7528', '\u62a5\u5e9f'].includes(item))

    this.setData({
      enterpriseUser: user,
      statuses,
      pageTitle: isInactiveOnly ? TEXT.inactiveTitle : TEXT.listTitle,
      pageSubtitle: isInactiveOnly ? TEXT.inactiveSubtitle : TEXT.listSubtitle
    })
    this.loadData()
  },

  onShow() {
    if (this.data.enterpriseUser) {
      this.loadData()
    }
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadData() {
    if (this.data.isLoading || !this.data.enterpriseUser) return
    this.setData({ isLoading: true, swipeOpenId: '' })

    try {
      wx.showLoading({ title: TEXT.loading })
      let devices = await deviceService.searchDevices(this.data.searchKeyword, {
        enterpriseUser: this.data.enterpriseUser
      })

      if (this.data.statuses.length) {
        devices = devices.filter((item) => this.data.statuses.includes(item.status))
      }

      this.setData({ devices })
    } catch (error) {
      wx.showToast({ title: TEXT.loadFailed, icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ isLoading: false })
    }
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  onSearch() {
    this.loadData()
  },

  onTouchStart(e) {
    const touch = e.changedTouches[0]
    this.touchStartX = touch.pageX
    this.touchStartY = touch.pageY
    this.touchItemId = e.currentTarget.dataset.id || ''
  },

  onTouchEnd(e) {
    const touch = e.changedTouches[0]
    const deltaX = touch.pageX - (this.touchStartX || 0)
    const deltaY = touch.pageY - (this.touchStartY || 0)
    const itemId = this.touchItemId

    this.touchStartX = 0
    this.touchStartY = 0
    this.touchItemId = ''

    if (!itemId || Math.abs(deltaY) > 50) return

    if (deltaX < -60) {
      this.setData({ swipeOpenId: itemId })
      return
    }

    if (deltaX > 40 && this.data.swipeOpenId === itemId) {
      this.setData({ swipeOpenId: '' })
    }
  },

  closeSwipe() {
    if (this.data.swipeOpenId) {
      this.setData({ swipeOpenId: '' })
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return

    if (this.data.swipeOpenId && this.data.swipeOpenId !== id) {
      this.setData({ swipeOpenId: '' })
      return
    }

    if (this.data.swipeOpenId === id) {
      this.setData({ swipeOpenId: '' })
      return
    }

    wx.navigateTo({
      url: `/pages/device-detail/device-detail?id=${id}`
    })
  },

  async onDeleteDevice(e) {
    const { id } = e.currentTarget.dataset
    const item = this.data.devices.find((entry) => entry._id === id)
    if (!id || !item || this.data.deletingId) return

    const name = item.deviceName || item.factoryNo || '\u8be5\u538b\u529b\u8868'
    const firstConfirm = await this.confirmModal(
      TEXT.deleteTitle,
      TEXT.deletePrompt.replace('{name}', name)
    )
    if (!firstConfirm) return

    const secondConfirm = await this.confirmModal(
      TEXT.deletePromptAgainTitle,
      TEXT.deletePromptAgain.replace('{name}', name)
    )
    if (!secondConfirm) return

    this.setData({ deletingId: id })
    try {
      const result = await deviceService.softDeleteDevice(id, {
        enterpriseUser: this.data.enterpriseUser
      })
      this.setData({
        devices: this.data.devices.filter((entry) => entry._id !== id),
        swipeOpenId: ''
      })
      this.setData({ swipeOpenId: '' })
      wx.showToast({
        title: result.relatedRecordCount > 0 ? TEXT.deleteSuccessWithLog : TEXT.deleteSuccess,
        icon: 'success'
      })
      this.loadData()
    } catch (error) {
      wx.showToast({
        title: error.message || TEXT.deleteFailed,
        icon: 'none'
      })
    } finally {
      this.setData({ deletingId: '' })
    }
  },

  confirmModal(title, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        confirmColor: '#d92d20',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      })
    })
  },

  createNewDevice() {
    wx.showToast({ title: TEXT.createHint, icon: 'none' })
    wx.navigateTo({ url: '/pages/archive/archive' })
  }
})
