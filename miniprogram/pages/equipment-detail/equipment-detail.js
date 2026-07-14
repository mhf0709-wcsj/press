const equipmentService = require('../../services/equipment-service')
const deviceService = require('../../services/device-service')
const recordService = require('../../services/record-service')

Page({
  data: {
    equipmentId: '',
    mode: 'view',
    returnTo: '',
    isInitSetup: false,
    saving: false,
    isAdminView: false,
    highlightGaugeId: '',
    dashboard: {
      totalGauges: 0,
      expired: 0,
      expiring: 0,
      normal: 0
    },
    equipment: {
      equipmentName: '',
      equipmentNo: '',
      location: ''
    },
    gauges: []
  },

  onLoad(options) {
    wx.setNavigationBarTitle({ title: '设备详情' })

    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    const adminUser = wx.getStorageSync('adminUser')
    const isAdminView = options.adminView === '1' || (!enterpriseUser && !!adminUser)
    this.setData({ isAdminView })

    if (!enterpriseUser && !adminUser) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }

    if (options.mode === 'create') {
      if (isAdminView) {
        wx.showToast({ title: '管理端不能新建设备', icon: 'none' })
        return
      }
      this.setData({
        mode: 'create',
        returnTo: options.returnTo || '',
        isInitSetup: options.init === '1'
      })
      wx.setNavigationBarTitle({ title: '新建设备' })
      return
    }

    const id = options.id ? options.id : (options.scene ? decodeURIComponent(options.scene) : '')
    if (id) {
      this.setData({ equipmentId: id, mode: 'view' })
      if (options.highlightGaugeId) {
        this.setData({ highlightGaugeId: options.highlightGaugeId })
      }
      Promise.all([
        this.loadEquipment(id),
        this.loadGauges(id)
      ]).finally(() => {
        this.hasLoadedOnce = true
      })
    }
  },

  onShow() {
    if (!this.hasLoadedOnce) return

    const { equipmentId, mode } = this.data
    if (!equipmentId || mode === 'create') return

    this.loadEquipment(equipmentId)
    this.loadGauges(equipmentId)
  },

  async loadEquipment(id) {
    wx.showLoading({ title: '加载中' })
    try {
      const equipment = await equipmentService.getEquipmentById(id)
      this.setData({ equipment })
    } catch (error) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async loadGauges(equipmentId) {
    try {
      const gauges = (await deviceService.loadDevices({
        enterpriseUser: wx.getStorageSync('enterpriseUser'),
        fromAdmin: this.data.isAdminView
      })).filter((item) => item.equipmentId === equipmentId)
      this.setData({ gauges })
      await this.loadGaugeLatestRecords(equipmentId, gauges)
      this.scrollToHighlight()
    } catch (error) {}
  },

  async loadGaugeLatestRecords(equipmentId, gauges) {
    try {
      const records = (await recordService.getRecords({ limit: 100 })).filter((item) => item.equipmentId === equipmentId)
      const latestByDevice = {}
      for (const record of records) {
        const deviceId = record.deviceId
        if (!deviceId) continue
        const current = latestByDevice[deviceId]
        if (!current || compareYmd(record.verificationDate, current.verificationDate) > 0) {
          latestByDevice[deviceId] = record
        }
      }

      const today = formatYmd(new Date())
      let expired = 0
      let expiring = 0
      let normal = 0

      const enriched = gauges.map((gauge) => {
        const lastRecord = latestByDevice[gauge._id] || null
        const { status, statusText, daysToExpiry } = computeExpiryStatus(today, lastRecord?.expiryDate || '')

        if (status === 'expired') expired += 1
        else if (status === 'expiring') expiring += 1
        else if (status === 'normal') normal += 1

        return {
          ...gauge,
          lastRecord,
          expiryStatus: status,
          expiryStatusText: statusText,
          daysToExpiry
        }
      })

      this.setData({
        gauges: enriched,
        dashboard: {
          totalGauges: gauges.length,
          expired,
          expiring,
          normal
        }
      })
    } catch (error) {
      this.setData({
        dashboard: {
          totalGauges: gauges.length,
          expired: 0,
          expiring: 0,
          normal: 0
        }
      })
    }
  },

  scrollToHighlight() {
    const id = this.data.highlightGaugeId
    if (!id) return
    const query = wx.createSelectorQuery()
    query.selectViewport().scrollOffset()
    query.select(`#gauge-${id}`).boundingClientRect()
    query.exec((res) => {
      const viewport = res && res[0] ? res[0] : null
      const rect = res && res[1] ? res[1] : null
      if (!viewport || !rect) return
      wx.pageScrollTo({
        scrollTop: Math.max(0, viewport.scrollTop + rect.top - 120),
        duration: 260
      })
      setTimeout(() => {
        if (this.data.highlightGaugeId === id) this.setData({ highlightGaugeId: '' })
      }, 3500)
    })
  },

  onGaugeTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return

    if (this.data.isAdminView) {
      wx.navigateTo({
        url: `/pages/admin/admin?from=dashboard&deviceId=${id}`
      })
      return
    }

    wx.navigateTo({ url: `/pages/device-detail/device-detail?id=${id}` })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`equipment.${field}`]: e.detail.value })
  },

  async saveEquipment() {
    if (this.data.saving) return
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    const { equipment, mode, equipmentId } = this.data

    if (!equipment.equipmentName) {
      wx.showToast({ title: '请填写设备名称', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中' })

    try {
      if (mode === 'create') {
        const res = await equipmentService.createEquipment(equipment, { enterpriseUser })
        wx.showToast({ title: '创建成功', icon: 'success' })
        setTimeout(() => {
          if (this.data.returnTo === 'camera') {
            wx.setStorageSync('selectedEquipmentForNewGauge', {
              id: res._id,
              name: res.equipmentName || ''
            })
            wx.navigateBack()
            return
          }
          if (this.data.isInitSetup) {
            wx.setStorageSync('selectedEquipmentForNewGauge', {
              id: res._id,
              name: res.equipmentName || ''
            })
            wx.switchTab({ url: '/pages/ai-assistant/ai-assistant' })
            return
          }
          wx.redirectTo({ url: `/pages/equipment-detail/equipment-detail?id=${res._id}` })
        }, 800)
      } else {
        await equipmentService.updateEquipment(equipmentId, equipment)
        wx.showToast({ title: '保存成功', icon: 'success' })
      }
    } catch (error) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  },

  createGauge() {
    const { equipmentId, equipment } = this.data
    wx.setStorageSync('selectedEquipmentForNewGauge', {
      id: equipmentId,
      name: equipment.equipmentName || ''
    })
    wx.switchTab({ url: '/pages/ai-assistant/ai-assistant' })
  }
})

function formatYmd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function compareYmd(a, b) {
  const sa = String(a || '')
  const sb = String(b || '')
  if (!sa && !sb) return 0
  if (!sa) return -1
  if (!sb) return 1
  if (sa === sb) return 0
  return sa > sb ? 1 : -1
}

function diffDays(fromYmd, toYmd) {
  const from = new Date(`${fromYmd}T00:00:00`)
  const to = new Date(`${toYmd}T00:00:00`)
  const ms = to.getTime() - from.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

function computeExpiryStatus(todayYmd, expiryDateYmd) {
  if (!expiryDateYmd) return { status: 'unknown', statusText: '未检定', daysToExpiry: null }
  const days = diffDays(todayYmd, expiryDateYmd)
  if (days < 0) return { status: 'expired', statusText: '逾期', daysToExpiry: days }
  if (days <= 30) return { status: 'expiring', statusText: '临期', daysToExpiry: days }
  return { status: 'normal', statusText: '正常', daysToExpiry: days }
}
