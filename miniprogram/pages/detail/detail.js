const db = wx.cloud.database()

const DISTRICT_OPTIONS = [
  '\u5927\u5cd9\u6240',
  '\u73ca\u6eaa\u6240',
  '\u5de8\u5c7f\u6240',
  '\u5cd9\u53e3\u6240',
  '\u9ec4\u5766\u6240',
  '\u897f\u5751\u6240',
  '\u7389\u58f6\u6240',
  '\u5357\u7530\u6240',
  '\u767e\u4e08\u6f08\u6240'
]
const DEVICE_STATUS_OPTIONS = ['\u5728\u7528', '\u505c\u7528', '\u9001\u68c0']
const CONCLUSION_OPTIONS = ['\u5408\u683c', '\u4e0d\u5408\u683c']

Page({
  data: {
    record: {},
    recordId: '',
    formData: {
      certNo: '',
      sendUnit: '',
      instrumentName: '',
      modelSpec: '',
      factoryNo: '',
      manufacturer: '',
      verificationStd: '',
      conclusion: '',
      verificationDate: '',
      district: '',
      deviceStatus: '\u5728\u7528'
    },
    conclusionIndex: 0,
    districtIndex: 0,
    deviceStatusIndex: 0,
    deviceStatusOptions: DEVICE_STATUS_OPTIONS,
    districtOptions: DISTRICT_OPTIONS,
    expiryDateText: '',
    saving: false,
    devices: [],
    deviceIndex: -1,
    selectedDeviceId: '',
    selectedDeviceName: '',
    showNewDevice: false,
    newDevice: {
      deviceNo: '',
      deviceName: '',
      deviceType: ''
    }
  },

  onLoad(options) {
    const { id } = options || {}
    if (id) {
      this.setData({ recordId: id })
    }
    this.loadDevices().then(() => {
      if (id) this.loadRecord(id)
    })
  },

  goBack() {
    wx.navigateBack()
  },

  async loadRecord(id) {
    wx.showLoading({ title: '\u52a0\u8f7d\u4e2d...' })
    try {
      const res = await db.collection('pressure_records').doc(id).get()
      const record = res.data

      if (!record) {
        wx.hideLoading()
        wx.showToast({ title: '\u8bb0\u5f55\u4e0d\u5b58\u5728', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }

      const districtIndex = Math.max(0, this.data.districtOptions.indexOf(record.district || ''))
      const deviceStatusIndex = Math.max(0, this.data.deviceStatusOptions.indexOf(record.deviceStatus || '\u5728\u7528'))
      const deviceIndex = record.deviceId
        ? this.data.devices.findIndex((item) => item._id === record.deviceId)
        : -1
      const conclusionIndex = record.conclusion === '\u4e0d\u5408\u683c' ? 1 : 0

      this.setData({
        record,
        formData: {
          certNo: record.certNo || '',
          sendUnit: record.sendUnit || '',
          instrumentName: record.instrumentName || '\u538b\u529b\u8868',
          modelSpec: record.modelSpec || '',
          factoryNo: record.factoryNo || '',
          manufacturer: record.manufacturer || '',
          verificationStd: record.verificationStd || 'JJG52-2013',
          conclusion: record.conclusion || '\u5408\u683c',
          verificationDate: record.verificationDate || '',
          district: record.district || '',
          deviceStatus: record.deviceStatus || '\u5728\u7528'
        },
        districtIndex,
        deviceStatusIndex,
        deviceIndex,
        selectedDeviceId: record.deviceId || '',
        selectedDeviceName: record.deviceName || '',
        conclusionIndex,
        expiryDateText: record.expiryDate || ''
      })
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error('load detail failed:', err)
      wx.showToast({ title: '\u52a0\u8f7d\u5931\u8d25', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
    }
  },

  async loadDevices() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    const adminUser = wx.getStorageSync('adminUser')
    const whereCondition = {}

    if (adminUser && adminUser.district) {
      whereCondition.district = adminUser.district
    } else if (enterpriseUser && enterpriseUser.companyName) {
      whereCondition.enterpriseName = enterpriseUser.companyName
    }

    try {
      const res = await db.collection('devices')
        .where(whereCondition)
        .orderBy('createTime', 'desc')
        .limit(100)
        .get()
      this.setData({ devices: res.data || [] })
    } catch (err) {
      console.error('load devices failed:', err)
    }
  },

  onDeviceChange(e) {
    const index = Number(e.detail.value)
    const device = this.data.devices[index]
    if (!device) return

    this.setData({
      deviceIndex: index,
      selectedDeviceId: device._id,
      selectedDeviceName: device.deviceName,
      showNewDevice: false
    })
  },

  showNewDeviceForm() {
    this.setData({
      showNewDevice: true,
      newDevice: {
        deviceNo: '',
        deviceName: '',
        deviceType: '\u538b\u529b\u8868'
      }
    })
  },

  hideNewDeviceForm() {
    this.setData({ showNewDevice: false })
  },

  onNewDeviceInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`newDevice.${field}`]: value })
  },

  async saveNewDevice() {
    const { newDevice, formData } = this.data
    const enterpriseUser = wx.getStorageSync('enterpriseUser')

    if (!String(newDevice.deviceName || '').trim()) {
      wx.showToast({ title: '\u8bf7\u8f93\u5165\u8bbe\u5907\u540d\u79f0', icon: 'none' })
      return
    }

    wx.showLoading({ title: '\u521b\u5efa\u4e2d...' })
    try {
      const deviceData = {
        deviceNo: newDevice.deviceNo || `DEV-${Date.now()}`,
        deviceName: newDevice.deviceName,
        deviceType: newDevice.deviceType || '\u538b\u529b\u8868',
        enterpriseId: enterpriseUser?._id || enterpriseUser?.companyName || '',
        enterpriseName: enterpriseUser?.companyName || '',
        district: formData.district || '',
        factoryNo: '',
        createTime: this.formatDateTime(new Date()),
        updateTime: this.formatDateTime(new Date()),
        recordCount: 0
      }

      const res = await db.collection('devices').add({ data: deviceData })
      wx.hideLoading()
      wx.showToast({ title: '\u521b\u5efa\u6210\u529f', icon: 'success' })
      await this.loadDevices()
      const index = this.data.devices.findIndex((item) => item._id === res._id)
      this.setData({
        showNewDevice: false,
        selectedDeviceId: res._id,
        selectedDeviceName: newDevice.deviceName,
        deviceIndex: index
      })
    } catch (err) {
      wx.hideLoading()
      console.error('create device failed:', err)
      wx.showToast({ title: '\u521b\u5efa\u5931\u8d25', icon: 'none' })
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`formData.${field}`]: value })

    if (field === 'verificationDate' && value) {
      const expiryDate = this.calculateExpiryDate(value)
      this.setData({ expiryDateText: this.formatDate(expiryDate) })
    }
  },

  onDistrictChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      districtIndex: index,
      'formData.district': this.data.districtOptions[index]
    })
  },

  onDeviceStatusChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      deviceStatusIndex: index,
      'formData.deviceStatus': this.data.deviceStatusOptions[index]
    })
  },

  onConclusionChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      conclusionIndex: index,
      'formData.conclusion': CONCLUSION_OPTIONS[index]
    })
  },

  onDateChange(e) {
    const dateStr = e.detail.value
    const expiryDate = this.calculateExpiryDate(dateStr)
    this.setData({
      'formData.verificationDate': dateStr,
      expiryDateText: this.formatDate(expiryDate)
    })
  },

  calculateExpiryDate(verifyDateStr) {
    const date = new Date(verifyDateStr)
    date.setMonth(date.getMonth() + 6)
    date.setDate(date.getDate() - 1)
    return date
  },

  async saveRecord() {
    const { formData, recordId, selectedDeviceId, deviceIndex, devices } = this.data

    if (!String(formData.factoryNo || '').trim()) {
      wx.showToast({ title: '\u8bf7\u586b\u5199\u51fa\u5382\u7f16\u53f7', icon: 'none' })
      return
    }
    if (!formData.verificationDate) {
      wx.showToast({ title: '\u8bf7\u9009\u62e9\u68c0\u5b9a\u65e5\u671f', icon: 'none' })
      return
    }
    if (!selectedDeviceId) {
      wx.showToast({ title: '\u8bf7\u9009\u62e9\u5173\u8054\u538b\u529b\u8868', icon: 'none' })
      return
    }

    const selectedDevice = devices[deviceIndex]
    if (!selectedDevice || !selectedDevice.equipmentId) {
      wx.showToast({ title: '\u6240\u9009\u538b\u529b\u8868\u672a\u5173\u8054\u8bbe\u5907\uff0c\u8bf7\u5148\u7ed1\u5b9a', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '\u4fdd\u5b58\u4e2d...', mask: true })

    const verifyDate = new Date(formData.verificationDate)
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1)

    const updateData = {
      ...formData,
      expiryDate: this.formatDate(expiryDate),
      status: 'valid',
      updateTime: this.formatDateTime(new Date()),
      ocrSource: 'manual',
      equipmentId: selectedDevice.equipmentId || '',
      equipmentName: selectedDevice.equipmentName || '',
      deviceId: selectedDeviceId,
      deviceName: selectedDevice.deviceName || this.data.selectedDeviceName || '',
      deviceNo: selectedDevice.deviceNo || '',
      deviceStatus: formData.deviceStatus || selectedDevice.status || '\u5728\u7528'
    }

    try {
      await db.collection('pressure_records').doc(recordId).update({ data: updateData })
      if (selectedDeviceId) {
        this.updateDeviceRecordCount(selectedDeviceId)
      }
      wx.hideLoading()
      wx.showToast({ title: '\u4fdd\u5b58\u6210\u529f', icon: 'success', duration: 1500 })
      const pages = getCurrentPages()
      if (pages.length > 1) {
        const prevPage = pages[pages.length - 2]
        if (prevPage && prevPage.loadRecords) {
          prevPage.loadRecords()
        }
      }
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (err) {
      wx.hideLoading()
      console.error('save detail failed:', err)
      wx.showToast({ title: '\u4fdd\u5b58\u5931\u8d25', icon: 'none' })
      this.setData({ saving: false })
    }
  },

  deleteRecord() {
    wx.showModal({
      title: '\u786e\u8ba4\u5220\u9664',
      content: '\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\uff0c\u786e\u5b9a\u8981\u5220\u9664\u5417\uff1f',
      success: (res) => {
        if (res.confirm) {
          this.performDelete()
        }
      }
    })
  },

  async performDelete() {
    wx.showLoading({ title: '\u5220\u9664\u4e2d...' })
    try {
      await db.collection('pressure_records').doc(this.data.recordId).remove()
      wx.hideLoading()
      wx.showToast({ title: '\u5220\u9664\u6210\u529f', icon: 'success' })
      const pages = getCurrentPages()
      if (pages.length > 1) {
        const prevPage = pages[pages.length - 2]
        if (prevPage && prevPage.loadRecords) {
          prevPage.loadRecords()
        }
      }
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (err) {
      wx.hideLoading()
      console.error('delete detail failed:', err)
      wx.showToast({ title: '\u5220\u9664\u5931\u8d25', icon: 'none' })
    }
  },

  previewImage() {
    if (this.data.record.fileID) {
      wx.previewImage({ urls: [this.data.record.fileID] })
    }
  },

  previewInstallPhoto() {
    if (this.data.record.installPhotoFileID) {
      wx.previewImage({ urls: [this.data.record.installPhotoFileID] })
    }
  },

  formatDate(date) {
    const d = typeof date === 'string' ? new Date(date) : date
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  },

  formatDateTime(date) {
    const d = typeof date === 'string' ? new Date(date) : date
    return `${this.formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  },

  updateDeviceRecordCount(deviceId) {
    db.collection('pressure_records')
      .where({ deviceId })
      .count()
      .then((res) => {
        db.collection('devices').doc(deviceId).update({
          data: {
            recordCount: res.total,
            updateTime: this.formatDateTime(new Date())
          }
        })
      })
  }
})
