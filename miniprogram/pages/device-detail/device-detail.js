const db = wx.cloud.database()
const deviceService = require('../../services/device-service')
const equipmentService = require('../../services/equipment-service')
const lifecycleService = require('../../services/lifecycle-service')

const STATUS_OPTIONS = ['\u5728\u7528', '\u5907\u7528', '\u9001\u68c0', '\u505c\u7528', '\u62a5\u5e9f']

const TEXT = {
  loading: '\u52a0\u8f7d\u4e2d...',
  loadFailed: '\u52a0\u8f7d\u5931\u8d25',
  chooseEquipmentFirst: '\u8bf7\u5148\u9009\u62e9\u6240\u5c5e\u8bbe\u5907',
  chooseDeviceName: '\u8bf7\u586b\u5199\u538b\u529b\u8868\u540d\u79f0',
  chooseEquipment: '\u8bf7\u9009\u62e9\u6240\u5c5e\u8bbe\u5907',
  saving: '\u4fdd\u5b58\u4e2d...',
  createSuccess: '\u5efa\u6863\u6210\u529f',
  saveSuccess: '\u4fdd\u5b58\u6210\u529f',
  saveFailed: '\u4fdd\u5b58\u5931\u8d25',
  createTitle: '\u65b0\u5efa\u538b\u529b\u8868',
  deviceArchive: '\u538b\u529b\u8868\u6863\u6848',
  detailTitle: '\u538b\u529b\u8868\u8be6\u60c5',
  unknownEquipment: '\u672a\u7ed1\u5b9a\u8bbe\u5907',
  statusChangePrefix: '\u72b6\u6001\u66f4\u65b0\u4e3a',
  locationRemarkPrefix: '\u5b89\u88c5\u4f4d\u7f6e\u66f4\u65b0\u4e3a\uff1a',
  rebindAction: '\u6362\u7ed1\u8bbe\u5907',
  manualInput: '\u624b\u52a8\u5f55\u5165',
  aiExtract: 'AI\u8bc6\u522b'
}

Page({
  data: {
    text: TEXT,
    deviceId: '',
    mode: 'view',
    device: {
      deviceNo: '',
      deviceName: '',
      factoryNo: '',
      manufacturer: '',
      modelSpec: '',
      equipmentId: '',
      equipmentName: '',
      status: STATUS_OPTIONS[0],
      installLocation: ''
    },
    originalDevice: null,
    statusOptions: STATUS_OPTIONS,
    statusIndex: 0,
    equipments: [],
    equipmentIndex: -1,
    logs: [],
    archiveRecords: [],
    enterpriseUser: null
  },

  async onLoad(options = {}) {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    this.setData({ enterpriseUser })

    await this.loadEquipments()

    if (options.scene) {
      const scene = decodeURIComponent(options.scene)
      this.setData({ deviceId: scene, mode: 'view' })
      await this.loadDeviceBundle(scene)
      return
    }

    if (options.mode === 'create') {
      const equipmentId = options.equipmentId || ''
      const equipmentName = options.equipmentName ? decodeURIComponent(options.equipmentName) : ''

      if (!equipmentId) {
        wx.showToast({ title: TEXT.chooseEquipmentFirst, icon: 'none' })
        wx.navigateTo({ url: '/pages/archive/archive' })
        return
      }

      this.setData({
        mode: 'create',
        equipmentIndex: this.findEquipmentIndex(equipmentId),
        device: {
          ...this.data.device,
          equipmentId,
          equipmentName
        }
      })
      wx.setNavigationBarTitle({ title: TEXT.createTitle })
      return
    }

    if (options.id) {
      this.setData({ deviceId: options.id, mode: 'view' })
      await this.loadDeviceBundle(options.id)
    }
  },

  onShow() {
    if (this.hasLoadedOnce && this.data.deviceId) {
      this.loadDeviceBundle(this.data.deviceId)
    }
  },

  async loadDeviceBundle(deviceId) {
    await Promise.all([
      this.loadDeviceDetail(deviceId),
      this.loadLifecycleLogs(deviceId),
      this.loadArchiveRecords(deviceId)
    ])
    this.hasLoadedOnce = true
  },

  async loadEquipments() {
    const enterpriseUser = this.data.enterpriseUser
    if (!enterpriseUser?.companyName) {
      this.setData({ equipments: [] })
      return
    }

    try {
      const equipments = await equipmentService.loadEquipments({ enterpriseUser })
      this.setData({ equipments })
    } catch (error) {
      this.setData({ equipments: [] })
    }
  },

  findEquipmentIndex(equipmentId) {
    return this.data.equipments.findIndex((item) => item._id === equipmentId)
  },

  async loadDeviceDetail(id) {
    wx.showLoading({ title: TEXT.loading })
    try {
      const device = await deviceService.getDeviceById(id)
      if (!device) {
        wx.showToast({ title: TEXT.loadFailed, icon: 'none' })
        return
      }

      const equipmentIndex = this.findEquipmentIndex(device.equipmentId)
      const statusIndex = Math.max(0, STATUS_OPTIONS.indexOf(device.status || STATUS_OPTIONS[0]))

      this.setData({
        device: {
          ...this.data.device,
          ...device
        },
        originalDevice: {
          equipmentId: device.equipmentId || '',
          equipmentName: device.equipmentName || '',
          status: device.status || STATUS_OPTIONS[0],
          installLocation: device.installLocation || ''
        },
        equipmentIndex,
        statusIndex
      })
    } catch (error) {
      wx.showToast({ title: TEXT.loadFailed, icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async loadLifecycleLogs(id) {
    try {
      const logs = await lifecycleService.getDeviceLogs(id)
      this.setData({ logs })
    } catch (error) {
      this.setData({ logs: [] })
    }
  },

  async loadArchiveRecords(deviceId) {
    try {
      const res = await db.collection('pressure_records')
        .where({
          deviceId,
          isDeleted: db.command.neq(true)
        })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get()

      this.setData({ archiveRecords: res.data || [] })
    } catch (error) {
      this.setData({ archiveRecords: [] })
    }
  },

  goRecordDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({
      [`device.${field}`]: e.detail.value
    })
  },

  onStatusChange(e) {
    const index = Number(e.detail.value || 0)
    const status = STATUS_OPTIONS[index] || STATUS_OPTIONS[0]
    this.setData({
      statusIndex: index,
      'device.status': status
    })
  },

  onEquipmentChange(e) {
    const index = Number(e.detail.value || -1)
    const equipment = this.data.equipments[index]
    if (!equipment) return

    this.setData({
      equipmentIndex: index,
      'device.equipmentId': equipment._id,
      'device.equipmentName': equipment.equipmentName
    })
  },

  async saveDevice() {
    const { device, mode, deviceId, enterpriseUser, originalDevice } = this.data

    if (!String(device.deviceName || '').trim()) {
      wx.showToast({ title: TEXT.chooseDeviceName, icon: 'none' })
      return
    }

    if (!String(device.equipmentId || '').trim()) {
      wx.showToast({ title: TEXT.chooseEquipment, icon: 'none' })
      return
    }

    wx.showLoading({ title: TEXT.saving })
    try {
      if (mode === 'create') {
        await deviceService.createDevice(device, { enterpriseUser })
        wx.showToast({ title: TEXT.createSuccess, icon: 'success' })
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }

      await deviceService.updateDevice(deviceId, device)
      await this.handleDeviceLifecycleChange(device, originalDevice)

      wx.showToast({ title: TEXT.saveSuccess, icon: 'success' })
      this.setData({
        originalDevice: {
          equipmentId: device.equipmentId || '',
          equipmentName: device.equipmentName || '',
          status: device.status || STATUS_OPTIONS[0],
          installLocation: device.installLocation || ''
        }
      })

      await Promise.all([
        this.loadLifecycleLogs(deviceId),
        this.loadDeviceDetail(deviceId)
      ])
    } catch (error) {
      wx.showToast({ title: TEXT.saveFailed, icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async handleDeviceLifecycleChange(device, originalDevice) {
    if (!originalDevice || !this.data.enterpriseUser) return

    const { enterpriseUser, deviceId } = this.data
    const logs = []

    if (originalDevice.equipmentId !== device.equipmentId) {
      await Promise.all([
        originalDevice.equipmentId ? equipmentService.updateGaugeCount(originalDevice.equipmentId) : Promise.resolve(),
        device.equipmentId ? equipmentService.updateGaugeCount(device.equipmentId) : Promise.resolve()
      ])

      logs.push({
        deviceId,
        action: TEXT.rebindAction,
        operator: enterpriseUser.companyName,
        operatorId: enterpriseUser._id,
        remark: `由 ${originalDevice.equipmentName || TEXT.unknownEquipment} 调整到 ${device.equipmentName || TEXT.unknownEquipment}`
      })
    }

    if (originalDevice.status !== device.status || originalDevice.installLocation !== device.installLocation) {
      logs.push({
        deviceId,
        action: `${TEXT.statusChangePrefix}[${device.status || STATUS_OPTIONS[0]}]`,
        operator: enterpriseUser.companyName,
        operatorId: enterpriseUser._id,
        remark: `${TEXT.locationRemarkPrefix}${device.installLocation || '-'}`
      })
    }

    for (const item of logs) {
      await lifecycleService.logEvent(item)
    }
  }
})
