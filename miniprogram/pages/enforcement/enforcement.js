const TEXT = {
  heroTopline: 'Enforcement',
  heroTitle: '\u73b0\u573a\u6838\u9a8c',
  heroDesc: '\u901a\u8fc7\u626b\u7801\u6838\u9a8c\u8bbe\u5907\u72b6\u6001\uff0c\u62cd\u6444\u73b0\u573a\u56fe\u7247\u5e76\u63d0\u4ea4\u7559\u75d5\u3002',
  verifyAction: '\u626b\u7801\u6838\u9a8c',
  evidenceAction: '\u73b0\u573a\u53d6\u8bc1',
  verifyTitle: '\u6838\u9a8c\u7ed3\u679c',
  evidenceTitle: '\u672c\u6b21\u53d6\u8bc1',
  historyTitle: '\u5386\u53f2\u53d6\u8bc1',
  noDevice: '\u8bf7\u5148\u5b8c\u6210\u626b\u7801\u6838\u9a8c',
  scanUnknown: '\u65e0\u6cd5\u8bc6\u522b\u8be5\u4e8c\u7ef4\u7801',
  scanCancel: '\u5df2\u53d6\u6d88\u626b\u7801',
  verifyLoading: '\u6838\u9a8c\u4e2d...',
  takeEvidenceFirst: '\u8bf7\u5148\u62cd\u6444\u53d6\u8bc1\u56fe\u7247',
  submitLoading: '\u63d0\u4ea4\u4e2d...',
  submitSuccess: '\u53d6\u8bc1\u6210\u529f',
  submitFail: '\u63d0\u4ea4\u5931\u8d25',
  placeholder: '\u586b\u5199\u73b0\u573a\u5907\u6ce8\uff08\u53ef\u9009\uff09',
  hashLabel: '\u672c\u6b21\u54c8\u5e0c',
  fields: {
    status: '\u72b6\u6001',
    deviceName: '\u8bbe\u5907\u540d\u79f0',
    factoryNo: '\u51fa\u5382\u7f16\u53f7',
    expiryDate: '\u5230\u671f\u65e5\u671f',
    conclusion: '\u68c0\u5b9a\u7ed3\u8bba',
    daysToExpiry: '\u5269\u4f59\u5929\u6570'
  },
  statusMap: {
    normal: '\u6b63\u5e38',
    expiring: '\u4e34\u671f',
    expired: '\u903e\u671f',
    unknown: '\u672a\u77e5'
  }
}

Page({
  data: {
    text: TEXT,
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
      wx.redirectTo({
        url: '/pages/admin-login/admin-login'
      })
    }
  },

  async scanDevice() {
    try {
      const scanRes = await new Promise((resolve, reject) => {
        wx.scanCode({ success: resolve, fail: reject })
      })

      const parsed = this.parseScanResult(scanRes)
      if (!parsed.deviceId && !parsed.qrCode) {
        wx.showToast({ title: TEXT.scanUnknown, icon: 'none' })
        return
      }

      await this.verifyDevice(parsed)
    } catch (error) {
      wx.showToast({ title: TEXT.scanCancel, icon: 'none' })
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
    wx.showLoading({ title: TEXT.verifyLoading })
    try {
      const res = await wx.cloud.callFunction({
        name: 'regulator',
        data: { action: 'verifyDevice', deviceId, qrCode }
      })

      if (!res.result?.success) {
        wx.showToast({ title: res.result?.error || TEXT.submitFail, icon: 'none' })
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
    if (status === '\u6b63\u5e38') return 'normal'
    if (status === '\u4e34\u671f') return 'expiring'
    if (status === '\u903e\u671f') return 'expired'
    if (status === '\u672a\u5efa\u6863') return 'unknown'
    if (status === '\u672a\u77e5\u5230\u671f') return 'unknown'
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
    } catch (error) {
      console.error('Load evidence cases failed:', error)
    }
  },

  async takeEvidence() {
    if (!this.data.deviceId) {
      wx.showToast({ title: TEXT.noDevice, icon: 'none' })
      return
    }

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

      const files = (res.tempFiles || []).map((file) => ({
        path: file.tempFilePath,
        fileID: ''
      }))

      this.setData({
        evidenceImages: [...this.data.evidenceImages, ...files].slice(0, 9)
      })
    } catch (error) {
      console.error('Take evidence failed:', error)
    }
  },

  previewEvidence(e) {
    const idx = Number(e.currentTarget.dataset.index || 0)
    const urls = this.data.evidenceImages.map((item) => item.path)
    wx.previewImage({
      urls,
      current: urls[idx]
    })
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  async submitEvidence() {
    const { deviceId, evidenceImages, remark, verifyResult } = this.data
    if (!deviceId) {
      wx.showToast({ title: TEXT.noDevice, icon: 'none' })
      return
    }
    if (!evidenceImages.length) {
      wx.showToast({ title: TEXT.takeEvidenceFirst, icon: 'none' })
      return
    }

    const adminUser = wx.getStorageSync('adminUser') || {}
    this.setData({ submitting: true })
    wx.showLoading({ title: TEXT.submitLoading, mask: true })

    try {
      const uploads = []
      for (const item of evidenceImages) {
        if (item.fileID) {
          uploads.push(Promise.resolve(item.fileID))
          continue
        }
        const cloudPath = `enforcement/${deviceId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
        uploads.push(wx.cloud.uploadFile({ cloudPath, filePath: item.path }).then((res) => res.fileID))
      }

      const fileIDs = await Promise.all(uploads)
      let location = null

      try {
        const loc = await new Promise((resolve, reject) => {
          wx.getLocation({ type: 'gcj02', success: resolve, fail: reject })
        })
        location = {
          latitude: loc.latitude,
          longitude: loc.longitude
        }
      } catch (error) {
        console.error('Get location failed:', error)
      }

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
        wx.showToast({ title: res.result?.error || TEXT.submitFail, icon: 'none' })
        return
      }

      this.setData({
        lastCaseHash: res.result.data.caseHash || '',
        evidenceImages: evidenceImages.map((item, index) => ({
          ...item,
          fileID: fileIDs[index]
        }))
      })

      await this.loadEvidenceCases(deviceId)
      wx.showToast({ title: TEXT.submitSuccess, icon: 'success' })
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  }
})
