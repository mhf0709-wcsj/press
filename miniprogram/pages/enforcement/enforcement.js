Page({
  data: {
    deviceId: '',
    verifyResult: null,
    statusClass: '',
    evidenceImages: [],
    remark: '',
    submitting: false,
    lastCaseHash: '',
    cases: []
  },

  onLoad() {
    const adminUser = wx.getStorageSync('adminUser')
    if (!adminUser) {
      wx.redirectTo({ url: '/pages/admin-login/admin-login' })
      return
    }
  },

  async scanDevice() {
    try {
      const scanRes = await new Promise((resolve, reject) => {
        wx.scanCode({ success: resolve, fail: reject })
      })

      const parsed = this.parseScanResult(scanRes)
      if (!parsed.deviceId && !parsed.qrCode) {
        wx.showToast({ title: '无法识别该码', icon: 'none' })
        return
      }

      await this.verifyDevice(parsed)
    } catch (e) {
      wx.showToast({ title: '扫码取消', icon: 'none' })
    }
  },

  parseScanResult(scanRes) {
    const path = scanRes?.path || ''
    if (path.includes('scene=')) {
      const scene = decodeURIComponent((path.split('scene=')[1] || '').split('&')[0])
      if (scene) return { deviceId: scene }
    }

    const result = scanRes?.result || ''
    if (result && /^QR-/.test(result)) return { qrCode: result }
    if (result && /^[0-9a-fA-F]{24,36}$/.test(result)) return { deviceId: result }
    return { qrCode: result || '' }
  },

  async verifyDevice({ deviceId, qrCode }) {
    wx.showLoading({ title: '核验中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'regulator',
        data: { action: 'verifyDevice', deviceId, qrCode }
      })

      if (!res.result?.success) {
        wx.showToast({ title: res.result?.error || '核验失败', icon: 'none' })
        return
      }

      const data = res.result.data
      const statusClass = this.mapStatusToClass(data?.verify?.status)
      this.setData({
        deviceId: data.device._id,
        verifyResult: data,
        statusClass,
        evidenceImages: [],
        remark: '',
        lastCaseHash: ''
      })

      await this.loadEvidenceCases(data.device._id)
    } finally {
      wx.hideLoading()
    }
  },

  mapStatusToClass(status) {
    if (status === '正常') return 'normal'
    if (status === '临期') return 'expiring'
    if (status === '逾期') return 'expired'
    if (status === '未建档') return 'unknown'
    if (status === '未知到期') return 'unknown'
    return 'unknown'
  },

  async loadEvidenceCases(deviceId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'regulator',
        data: { action: 'listEvidence', deviceId, limit: 20 }
      })
      if (res.result?.success) {
        this.setData({ cases: res.result.data || [] })
      }
    } catch (e) {}
  },

  async takeEvidence() {
    if (!this.data.deviceId) return
    try {
      const res = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 6,
          mediaType: ['image'],
          sourceType: ['camera'],
          success: resolve,
          fail: reject
        })
      })

      const files = (res.tempFiles || []).map(f => ({ path: f.tempFilePath, fileID: '' }))
      this.setData({ evidenceImages: [...this.data.evidenceImages, ...files].slice(0, 9) })
    } catch (e) {}
  },

  previewEvidence(e) {
    const idx = Number(e.currentTarget.dataset.index || 0)
    const urls = this.data.evidenceImages.map(i => i.path)
    wx.previewImage({ urls, current: urls[idx] })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  async submitEvidence() {
    const { deviceId, evidenceImages, remark, verifyResult } = this.data
    if (!deviceId) return
    if (!evidenceImages.length) {
      wx.showToast({ title: '请先拍照取证', icon: 'none' })
      return
    }

    const adminUser = wx.getStorageSync('adminUser') || {}

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...', mask: true })

    try {
      const uploads = []
      for (const item of evidenceImages) {
        if (item.fileID) {
          uploads.push(Promise.resolve(item.fileID))
          continue
        }
        const cloudPath = `enforcement/${deviceId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
        const up = wx.cloud.uploadFile({ cloudPath, filePath: item.path }).then(r => r.fileID)
        uploads.push(up)
      }
      const fileIDs = await Promise.all(uploads)

      let location = null
      try {
        const loc = await new Promise((resolve, reject) => {
          wx.getLocation({ type: 'gcj02', success: resolve, fail: reject })
        })
        location = { latitude: loc.latitude, longitude: loc.longitude }
      } catch (e) {}

      const res = await wx.cloud.callFunction({
        name: 'regulator',
        data: {
          action: 'submitEvidence',
          deviceId,
          verifyStatus: verifyResult?.verify?.status || '',
          remark,
          fileIDs,
          location,
          inspectorName: adminUser.username || ''
        }
      })

      if (!res.result?.success) {
        wx.showToast({ title: res.result?.error || '提交失败', icon: 'none' })
        return
      }

      this.setData({
        lastCaseHash: res.result.data.caseHash || '',
        evidenceImages: evidenceImages.map((img, i) => ({ ...img, fileID: fileIDs[i] }))
      })

      await this.loadEvidenceCases(deviceId)
      wx.showToast({ title: '取证成功', icon: 'success' })
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  }
})
