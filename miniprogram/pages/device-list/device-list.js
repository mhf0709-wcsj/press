const deviceService = require('../../services/device-service')
const recordService = require('../../services/record-service')
const { runSingleFlight } = require('../../utils/request-control')

const TEXT = {
  loginFirst: '请先登录',
  listTitle: '压力表列表',
  inactiveTitle: '停用及报废压力表',
  expiredTitle: '逾期压力表',
  loading: '加载中...',
  loadFailed: '加载失败',
  deleteTitle: '删除压力表',
  deletePrompt: '删除后，这块压力表将从企业端列表中移除，管理端会保留删除留痕。\n\n是否继续删除“{name}”？',
  deletePromptAgainTitle: '再次确认删除',
  deletePromptAgain: '请再次确认：\n\n删除后将无法在企业端直接恢复。\n\n确定删除“{name}”吗？',
  deleteSuccess: '已删除',
  deleteSuccessWithLog: '已删除并记录留痕',
  deleteFailed: '删除失败',
  createHint: '请先选择设备',
  openDetailFailed: '打开详情失败'
}

Page({
  data: {
    devices: [],
    searchKeyword: '',
    isLoading: false,
    enterpriseUser: null,
    statuses: [],
    expiryFilter: '',
    pageTitle: TEXT.listTitle,
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
    const isInactiveOnly = statuses.length > 0 && statuses.every((item) => ['停用', '报废'].includes(item))
    const expiryFilter = String(options.expiry || '')
    const isExpiredOnly = expiryFilter === 'expired'

    this.setData({
      enterpriseUser: user,
      statuses,
      expiryFilter,
      pageTitle: isExpiredOnly ? TEXT.expiredTitle : (isInactiveOnly ? TEXT.inactiveTitle : TEXT.listTitle)
    })
    this.loadData().finally(() => {
      this.hasLoadedOnce = true
    })
  },

  onShow() {
    if (!this.hasLoadedOnce) return

    if (this.data.enterpriseUser) {
      this.loadData({ silent: true })
    }
  },

  onPullDownRefresh() {
    this.loadData({ force: true }).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadData(options = {}) {
    return runSingleFlight(this, 'loadData', () => this.performLoadData(options), {
      queueLatest: !!options.force
    })
  },

  async performLoadData(options = {}) {
    if (!this.data.enterpriseUser) return

    const app = getApp()
    const ledgerVersion = Number(app.globalData.ledgerVersion || 0)
    const now = Date.now()
    if (
      !options.force &&
      this.lastLoadAt &&
      this.loadedLedgerVersion === ledgerVersion &&
      now - this.lastLoadAt < 10000
    ) {
      return
    }

    this.setData({ isLoading: true, swipeOpenId: '' })

    try {
      if (!options.silent) {
        wx.showLoading({ title: TEXT.loading })
      }
      let devices = await deviceService.searchDevices(this.data.searchKeyword, {
        enterpriseUser: this.data.enterpriseUser
      })

      if (this.data.statuses.length) {
        devices = devices.filter((item) => this.data.statuses.includes(item.status))
      }

      if (this.data.expiryFilter === 'expired') {
        devices = await this.filterExpiredDevices(devices)
      }

      this.setData({ devices })
    } catch (error) {
      wx.showToast({ title: TEXT.loadFailed, icon: 'none' })
    } finally {
      if (!options.silent) {
        wx.hideLoading()
      }
      this.lastLoadAt = Date.now()
      this.loadedLedgerVersion = ledgerVersion
      this.setData({ isLoading: false })
    }
  },

  async filterExpiredDevices(devices = []) {
    if (!devices.length) return []

    const today = this.formatDate(new Date())
    const resolved = devices.filter((device) => device.latestExpiryDate)
    const legacy = devices.filter((device) => !device.latestExpiryDate)
    const expiredIds = new Set(
      resolved
        .filter((device) => device.latestExpiryDate < today)
        .map((device) => device._id)
    )

    if (!legacy.length) {
      return devices.filter((device) => expiredIds.has(device._id))
    }

    const records = await recordService.getRecords({ limit: 100 })

    const latestByDevice = {}
    records.forEach((record) => {
      const keys = [record.deviceId, record.factoryNo, record.certNo].filter(Boolean)
      keys.forEach((key) => {
        if (!latestByDevice[key]) latestByDevice[key] = record
      })
    })

    legacy.forEach((device) => {
      const latest = latestByDevice[device._id] || latestByDevice[device.factoryNo] || latestByDevice[device.certNo]
      if (latest?.expiryDate && latest.expiryDate < today) expiredIds.add(device._id)
    })

    return devices.filter((device) => expiredIds.has(device._id))
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  onSearch() {
    this.loadData({ force: true })
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

  goToDetail(e) {
    const id = e.currentTarget.dataset.id || e.target.dataset.id
    if (!id) return

    if (this.data.swipeOpenId === id) {
      this.setData({ swipeOpenId: '' })
      return
    }

    if (this.data.swipeOpenId && this.data.swipeOpenId !== id) {
      this.setData({ swipeOpenId: '' })
    }

    wx.navigateTo({
      url: `/pages/device-detail/device-detail?id=${id}`,
      fail: () => {
        wx.showToast({ title: TEXT.openDetailFailed, icon: 'none' })
      }
    })
  },

  async onDeleteDevice(e) {
    const { id } = e.currentTarget.dataset
    const item = this.data.devices.find((entry) => entry._id === id)
    if (!id || !item || this.data.deletingId) return

    const name = item.deviceName || item.factoryNo || '该压力表'
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
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
})
