const recordService = require('../../services/record-service')
const equipmentService = require('../../services/equipment-service')
const deviceService = require('../../services/device-service')
const lifecycleService = require('../../services/lifecycle-service')
const { calculateExpiryDate } = require('../../utils/helpers/date')

const DISTRICT_OPTIONS = [
  '\u5927\u5ce8\u6240',
  '\u73ca\u6eaa\u6240',
  '\u5de8\u5c7f\u6240',
  '\u5ce3\u53e3\u6240',
  '\u9ec4\u5766\u6240',
  '\u897f\u5751\u6240',
  '\u7389\u58f6\u6240',
  '\u5357\u7530\u6240',
  '\u767e\u4e08\u6f08\u6240'
]
const CONCLUSION_OPTIONS = ['\u5408\u683c', '\u4e0d\u5408\u683c']
const DEVICE_STATUS_OPTIONS = ['\u5728\u7528', '\u5907\u7528', '\u9001\u68c0', '\u505c\u7528', '\u62a5\u5e9f']

Page({
  data: {
    recordId: '',
    record: {},
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
    districtOptions: DISTRICT_OPTIONS,
    districtIndex: -1,
    conclusionOptions: CONCLUSION_OPTIONS,
    conclusionIndex: -1,
    deviceStatusOptions: DEVICE_STATUS_OPTIONS,
    deviceStatusIndex: 0,
    equipments: [],
    equipmentIndex: -1,
    selectedEquipmentId: '',
    selectedEquipmentName: '',
    expiryDateText: '',
    saving: false,
    enterpriseUser: null,
    adminUser: null
  },

  async onLoad(options) {
    const recordId = options.id || ''
    if (!recordId) {
      wx.showToast({ title: '\u7f3a\u5c11\u8bb0\u5f55\u7f16\u53f7', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }

    const enterpriseUser = wx.getStorageSync('enterpriseUser') || null
    const adminUser = wx.getStorageSync('adminUser') || null
    this.setData({ recordId, enterpriseUser, adminUser })

    await this.loadEquipments()
    await this.loadRecord(recordId)
  },

  async loadEquipments() {
    const { enterpriseUser, adminUser } = this.data
    try {
      const equipments = await equipmentService.loadEquipments({
        enterpriseUser,
        fromAdmin: !!adminUser,
        district: adminUser?.district || ''
      })
      this.setData({ equipments })
    } catch (error) {
      this.setData({ equipments: [] })
      wx.showToast({ title: '\u52a0\u8f7d\u8bbe\u5907\u5931\u8d25', icon: 'none' })
    }
  },

  async loadRecord(recordId) {
    wx.showLoading({ title: '\u52a0\u8f7d\u4e2d...' })
    try {
      const record = await recordService.getRecordById(recordId)
      const conclusionIndex = Math.max(0, CONCLUSION_OPTIONS.indexOf(record.conclusion || CONCLUSION_OPTIONS[0]))
      const districtIndex = this.findDistrictIndex(record.district)
      const deviceStatusIndex = Math.max(0, DEVICE_STATUS_OPTIONS.indexOf(record.deviceStatus || DEVICE_STATUS_OPTIONS[0]))
      const equipmentIndex = this.findEquipmentIndex(record.equipmentId)

      this.setData({
        record,
        formData: {
          certNo: record.certNo || '',
          sendUnit: record.sendUnit || '',
          instrumentName: record.instrumentName || '',
          modelSpec: record.modelSpec || '',
          factoryNo: record.factoryNo || '',
          manufacturer: record.manufacturer || '',
          verificationStd: record.verificationStd || '',
          conclusion: record.conclusion || '',
          verificationDate: record.verificationDate || '',
          district: record.district || '',
          deviceStatus: record.deviceStatus || DEVICE_STATUS_OPTIONS[0]
        },
        districtIndex,
        conclusionIndex,
        deviceStatusIndex,
        equipmentIndex,
        selectedEquipmentId: record.equipmentId || '',
        selectedEquipmentName: record.equipmentName || '',
        expiryDateText: record.expiryDate || calculateExpiryDate(record.verificationDate || '')
      })
    } catch (error) {
      wx.showToast({ title: '\u52a0\u8f7d\u8bb0\u5f55\u5931\u8d25', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  findDistrictIndex(district) {
    return DISTRICT_OPTIONS.findIndex((item) => item === district)
  },

  findEquipmentIndex(equipmentId) {
    return this.data.equipments.findIndex((item) => item._id === equipmentId)
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`formData.${field}`]: value
    })
  },

  onDistrictChange(e) {
    const index = Number(e.detail.value || -1)
    this.setData({
      districtIndex: index,
      'formData.district': DISTRICT_OPTIONS[index] || ''
    })
  },

  onEquipmentChange(e) {
    const index = Number(e.detail.value || -1)
    const equipment = this.data.equipments[index]
    if (!equipment) return

    this.setData({
      equipmentIndex: index,
      selectedEquipmentId: equipment._id,
      selectedEquipmentName: equipment.equipmentName
    })
  },

  onConclusionChange(e) {
    const index = Number(e.detail.value || 0)
    this.setData({
      conclusionIndex: index,
      'formData.conclusion': CONCLUSION_OPTIONS[index] || ''
    })
  },

  onDateChange(e) {
    const verificationDate = e.detail.value
    this.setData({
      'formData.verificationDate': verificationDate,
      expiryDateText: calculateExpiryDate(verificationDate)
    })
  },

  onDeviceStatusChange(e) {
    const index = Number(e.detail.value || 0)
    this.setData({
      deviceStatusIndex: index,
      'formData.deviceStatus': DEVICE_STATUS_OPTIONS[index] || DEVICE_STATUS_OPTIONS[0]
    })
  },

  async saveRecord() {
    const { recordId, record, formData, selectedEquipmentId, selectedEquipmentName, expiryDateText } = this.data
    if (this.data.saving) return

    if (!selectedEquipmentId) {
      wx.showToast({ title: '\u8bf7\u9009\u62e9\u6240\u5c5e\u8bbe\u5907', icon: 'none' })
      return
    }

    if (!formData.verificationDate) {
      wx.showToast({ title: '\u8bf7\u9009\u62e9\u68c0\u5b9a\u65e5\u671f', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '\u4fdd\u5b58\u4e2d...' })

    const updateData = {
      certNo: formData.certNo,
      sendUnit: formData.sendUnit,
      instrumentName: formData.instrumentName,
      modelSpec: formData.modelSpec,
      factoryNo: formData.factoryNo,
      manufacturer: formData.manufacturer,
      verificationStd: formData.verificationStd,
      conclusion: formData.conclusion,
      verificationDate: formData.verificationDate,
      expiryDate: expiryDateText || calculateExpiryDate(formData.verificationDate),
      district: formData.district,
      equipmentId: selectedEquipmentId,
      equipmentName: selectedEquipmentName,
      deviceStatus: formData.deviceStatus
    }

    try {
      await recordService.updateRecord(recordId, updateData)
      await this.syncDeviceArchive(updateData)
      this.setData({ record: { ...record, ...updateData } })
      wx.showToast({ title: '\u4fdd\u5b58\u6210\u529f', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '\u4fdd\u5b58\u5931\u8d25', icon: 'none' })
    } finally {
      this.setData({ saving: false })
      wx.hideLoading()
    }
  },

  async syncDeviceArchive(updateData) {
    const { record, enterpriseUser, adminUser } = this.data
    if (!record.deviceId) return

    const oldEquipmentId = record.equipmentId || ''
    const oldEquipmentName = record.equipmentName || ''
    const nextEquipmentId = updateData.equipmentId || ''
    const nextEquipmentName = updateData.equipmentName || ''
    const equipmentChanged = oldEquipmentId !== nextEquipmentId
    const statusChanged = (record.deviceStatus || DEVICE_STATUS_OPTIONS[0]) !== (updateData.deviceStatus || DEVICE_STATUS_OPTIONS[0])

    await deviceService.updateDevice(record.deviceId, {
      equipmentId: nextEquipmentId,
      equipmentName: nextEquipmentName,
      status: updateData.deviceStatus || DEVICE_STATUS_OPTIONS[0],
      factoryNo: updateData.factoryNo || '',
      manufacturer: updateData.manufacturer || '',
      modelSpec: updateData.modelSpec || '',
      deviceName: record.deviceName || updateData.instrumentName || ''
    })

    if (equipmentChanged) {
      await Promise.all([
        oldEquipmentId ? equipmentService.updateGaugeCount(oldEquipmentId) : Promise.resolve(),
        nextEquipmentId ? equipmentService.updateGaugeCount(nextEquipmentId) : Promise.resolve()
      ])
    }

    if (equipmentChanged || statusChanged) {
      const operatorName = enterpriseUser?.companyName || adminUser?.username || '\u7cfb\u7edf'
      const operatorId = enterpriseUser?._id || adminUser?.username || 'system'
      const remarks = []

      if (equipmentChanged) {
        remarks.push(`\u6240\u5c5e\u8bbe\u5907\u7531${oldEquipmentName || '\u672a\u7ed1\u5b9a'}\u8c03\u6574\u4e3a${nextEquipmentName || '\u672a\u7ed1\u5b9a'}`)
      }

      if (statusChanged) {
        remarks.push(`\u8bbe\u5907\u72b6\u6001\u66f4\u65b0\u4e3a${updateData.deviceStatus || DEVICE_STATUS_OPTIONS[0]}`)
      }

      await lifecycleService.logEvent({
        deviceId: record.deviceId,
        action: equipmentChanged ? '\u6362\u7ed1\u8bbe\u5907' : '\u66f4\u65b0\u72b6\u6001',
        operator: operatorName,
        operatorId,
        remark: remarks.join('\uff1b')
      }).catch(() => {})
    }
  },

  previewImage() {
    const fileID = this.data.record.fileID
    if (!fileID) return
    wx.previewImage({ urls: [fileID] })
  },

  previewInstallPhoto() {
    const fileID = this.data.record.installPhotoFileID
    if (!fileID) return
    wx.previewImage({ urls: [fileID] })
  },

  deleteRecord() {
    const { recordId } = this.data
    wx.showModal({
      title: '\u5220\u9664\u8bb0\u5f55',
      content: '\u5220\u9664\u540e\u65e0\u6cd5\u6062\u590d\uff0c\u786e\u8ba4\u7ee7\u7eed\u5417\uff1f',
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '\u5220\u9664\u4e2d...' })
        try {
          const enterpriseUser = wx.getStorageSync('enterpriseUser') || {}
          await recordService.deleteRecord(recordId, {
            deletedBy: enterpriseUser.companyName || this.data.record.enterpriseName || '',
            deletedById: enterpriseUser._id || ''
          })
          wx.showToast({ title: '\u5df2\u5220\u9664', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1200)
        } catch (error) {
          wx.showToast({ title: '\u5220\u9664\u5931\u8d25', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  }
})
