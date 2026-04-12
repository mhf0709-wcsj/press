const equipmentService = require('../../services/equipment-service')

Page({
  data: {
    equipmentId: '',
    mode: 'view',
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
        wx.showToast({ title: '监管预览模式不可新建', icon: 'none' })
        return
      }
      this.setData({ mode: 'create' })
      wx.setNavigationBarTitle({ title: '新建设备' })
      return
    }

    const id = options.id ? options.id : (options.scene ? decodeURIComponent(options.scene) : '')
    if (id) {
      this.setData({ equipmentId: id, mode: 'view' })
      if (options.highlightGaugeId) {
        this.setData({ highlightGaugeId: options.highlightGaugeId })
      }
      this.loadEquipment(id)
      this.loadGauges(id)
    }
  },

  async loadEquipment(id) {
    wx.showLoading({ title: '加载中' })
    try {
      const equipment = await equipmentService.getEquipmentById(id)
      this.setData({ equipment })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async loadGauges(equipmentId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('devices').where({ equipmentId }).orderBy('createTime', 'desc').limit(100).get()
      const gauges = res.data || []
      this.setData({ gauges })
      await this.loadGaugeLatestRecords(equipmentId, gauges)
      this.scrollToHighlight()
    } catch (e) {}
  },

  async loadGaugeLatestRecords(equipmentId, gauges) {
    try {
      const db = wx.cloud.database()
      const recRes = await db.collection('pressure_records')
        .where({ equipmentId })
        .field({
          deviceId: true,
          verificationDate: true,
          expiryDate: true,
          conclusion: true,
          certNo: true,
          createTime: true
        })
        .limit(1000)
        .get()

      const records = recRes.data || []
      const latestByDevice = {}
      for (const r of records) {
        const did = r.deviceId
        if (!did) continue
        const cur = latestByDevice[did]
        if (!cur) {
          latestByDevice[did] = r
          continue
        }
        if (compareYmd(r.verificationDate, cur.verificationDate) > 0) latestByDevice[did] = r
      }

      const today = formatYmd(new Date())
      let expired = 0
      let expiring = 0
      let normal = 0

      const enriched = gauges.map(g => {
        const lastRecord = latestByDevice[g._id] || null
        const { status, statusText, daysToExpiry } = computeExpiryStatus(today, lastRecord?.expiryDate || '')
        if (status === 'expired') expired += 1
        else if (status === 'expiring') expiring += 1
        else if (status === 'normal') normal += 1
        return {
          ...g,
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
    } catch (e) {
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

  async previewGaugeCode(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const idx = this.data.gauges.findIndex(x => x._id === id)
    const gauge = idx >= 0 ? this.data.gauges[idx] : null
    if (!gauge) return

    if (gauge.qrCodeImage) {
      wx.previewImage({ urls: [gauge.qrCodeImage] })
      return
    }

    if (this.data.isAdminView) {
      wx.showToast({ title: '暂无压力表码', icon: 'none' })
      return
    }

    wx.showLoading({ title: '生成中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'generateQRCode',
        data: {
          deviceId: id,
          page: 'pages/device-detail/device-detail'
        }
      })
      if (res.result?.success && res.result.fileID) {
        const key = `gauges[${idx}].qrCodeImage`
        this.setData({ [key]: res.result.fileID })
        wx.previewImage({ urls: [res.result.fileID] })
      } else {
        wx.showToast({ title: '生成失败', icon: 'none' })
      }
    } catch (e2) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
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
          wx.redirectTo({ url: `/pages/equipment-detail/equipment-detail?id=${res._id}` })
        }, 800)
      } else {
        await equipmentService.updateEquipment(equipmentId, equipment)
        wx.showToast({ title: '保存成功', icon: 'success' })
      }
    } catch (e) {
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
    wx.switchTab({ url: '/pages/camera/camera' })
  },

  goGaugeDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/device-detail/device-detail?id=${id}` })
  },

  async showEquipmentCode() {
    const { equipmentId, equipment } = this.data
    if (!equipmentId) return

    if (equipment.qrCodeImage) {
      wx.previewImage({ urls: [equipment.qrCodeImage] })
      return
    }

    wx.showLoading({ title: '生成中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'generateQRCode',
        data: {
          refId: equipmentId,
          refType: 'equipment',
          page: 'pages/equipment-detail/equipment-detail'
        }
      })

      if (res.result?.success) {
        this.setData({ 'equipment.qrCodeImage': res.result.fileID })
        wx.previewImage({ urls: [res.result.fileID] })
      } else {
        wx.showToast({ title: '生成失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
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
  const from = new Date(fromYmd + 'T00:00:00')
  const to = new Date(toYmd + 'T00:00:00')
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
