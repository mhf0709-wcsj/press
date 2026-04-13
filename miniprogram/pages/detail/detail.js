const db = wx.cloud.database()

Page({
   data:{
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
      deviceStatus: '在用'
    },
    conclusionIndex: 0,
    districtIndex: 0,
    deviceStatusIndex: 0,
    deviceStatusOptions: ['在用', '停用', '送检'],
    districtOptions: ['大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所'],
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
    const { id } = options
    if (id) {
      this.setData({ recordId: id })
      this.loadRecord(id)
    }
    this.loadDevices()
  },

  loadRecord(id) {
    wx.showLoading({ title: '加载中...' })
    db.collection('pressure_records').doc(id).get()
      .then(res => {
        wx.hideLoading()
        if (res.data) {
          const record = res.data
          let districtIndex = 0
          if (record.district) {
            const idx = this.data.districtOptions.indexOf(record.district)
            if (idx > -1) districtIndex = idx
          }
          let deviceIndex = -1
          if (record.deviceId && this.data.devices.length > 0) {
            const idx = this.data.devices.findIndex(d => d._id === record.deviceId)
            if (idx > -1) deviceIndex = idx
          }
          let deviceStatusIndex = 0
          if (record.deviceStatus) {
            const idx = this.data.deviceStatusOptions.indexOf(record.deviceStatus)
            if (idx > -1) deviceStatusIndex = idx
          }
          
          this.setData({
            record: record,
            formData: {
              certNo: record.certNo || '',
              sendUnit: record.sendUnit || '',
              instrumentName: record.instrumentName || '压力表',
              modelSpec: record.modelSpec || '',
              factoryNo: record.factoryNo || '',
              manufacturer: record.manufacturer || '',
              verificationStd: record.verificationStd || 'JJG52-2013',
              conclusion: record.conclusion || '合格',
              verificationDate: record.verificationDate || '',
              district: record.district || '',
              deviceStatus: record.deviceStatus || '在用'
            },
            districtIndex: districtIndex,
            deviceIndex: deviceIndex,
            deviceStatusIndex: deviceStatusIndex,
            selectedDeviceId: record.deviceId || '',
            selectedDeviceName: record.deviceName || '',
            expiryDateText: record.expiryDate ? 
              `${new Date(record.expiryDate).getFullYear()}年${new Date(record.expiryDate).getMonth()+1}月${new Date(record.expiryDate).getDate()}日` : 
              ''
          })
          let conclusionIndex = 0
          if (record.conclusion === '不合格') conclusionIndex = 1
          this.setData({ conclusionIndex: conclusionIndex })
        } else {
          wx.showToast({ title: '记录不存在', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 2000)
        }
      })
      .catch(err => {
        wx.hideLoading()
        console.error('加载失败:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 2000)
      })
  },

  goBack() {
    wx.navigateBack()
  },
  loadDevices() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    const adminUser = wx.getStorageSync('adminUser')
    
    let whereCondition = {}
    
    if (adminUser) {
      if (adminUser.district) {
        whereCondition.district = adminUser.district
      }
    } else if (enterpriseUser) {
      whereCondition.enterpriseName = enterpriseUser.companyName
    }
    
    db.collection('devices').where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
      .then(res => {
        this.setData({ devices: res.data })
        if (this.data.record && this.data.record.deviceId) {
          const idx = res.data.findIndex(d => d._id === this.data.record.deviceId)
          if (idx > -1) {
            this.setData({ 
              deviceIndex: idx,
              selectedDeviceId: this.data.record.deviceId,
              selectedDeviceName: this.data.record.deviceName || res.data[idx].deviceName
            })
          }
        }
      })
      .catch(err => {
        console.error('加载设备失败:', err)
      })
  },
  onDeviceChange(e) {
    const index = e.detail.value
    const device = this.data.devices[index]
    if (device) {
      this.setData({
        deviceIndex: index,
        selectedDeviceId: device._id,
        selectedDeviceName: device.deviceName,
        showNewDevice: false
      })
    }
  },
  showNewDeviceForm() {
    this.setData({
      showNewDevice: true,
      newDevice: {
        deviceNo: '',
        deviceName: '',
        deviceType: '压力表'
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
  saveNewDevice() {
    const { newDevice, formData } = this.data
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    const adminUser = wx.getStorageSync('adminUser')
    
    if (!newDevice.deviceName.trim()) {
      wx.showToast({ title: '请输入设备名称', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '创建中...' })
    
    const deviceData = {
      deviceNo: newDevice.deviceNo || `DEV-${Date.now()}`,
      deviceName: newDevice.deviceName,
      deviceType: newDevice.deviceType || '压力表',
      enterpriseId: enterpriseUser?._id || enterpriseUser?.companyName || '管理端',
      enterpriseName: enterpriseUser?.companyName || '管理端录入',
      district: formData.district || '',
      factoryNo: '',
      createTime: this.formatDateTime(new Date()),
      updateTime: this.formatDateTime(new Date()),
      recordCount: 0
    }
    
    db.collection('devices').add({
      data: deviceData
    }).then(res => {
      wx.hideLoading()
      wx.showToast({ title: '创建成功', icon: 'success' })
      this.loadDevices()
      this.setData({
        showNewDevice: false,
        selectedDeviceId: res._id,
        selectedDeviceName: newDevice.deviceName
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('创建设备失败:', err)
      wx.showToast({ title: '创建失败', icon: 'none' })
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`formData.${field}`]: value })
    if (field === 'verificationDate' && value) {
      const expiryDate = this.calculateExpiryDate(value)
      const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
      this.setData({ expiryDateText: expiryText })
    }
  },

  onDistrictChange(e) {
    const index = e.detail.value
    this.setData({
      districtIndex: index,
      'formData.district': this.data.districtOptions[index]
    })
  },
  onDeviceStatusChange(e) {
    const index = e.detail.value
    this.setData({
      deviceStatusIndex: index,
      'formData.deviceStatus': this.data.deviceStatusOptions[index]
    })
  },

  onConclusionChange(e) {
    const conclusions = ['合格', '不合格']
    const index = e.detail.value
    this.setData({ conclusionIndex: index, 'formData.conclusion': conclusions[index] })
  },

  onDateChange(e) {
    const dateStr = e.detail.value
    this.setData({ 'formData.verificationDate': dateStr })
    const expiryDate = this.calculateExpiryDate(dateStr)
    const expiryText = `${expiryDate.getFullYear()}年${expiryDate.getMonth()+1}月${expiryDate.getDate()}日`
    this.setData({ expiryDateText: expiryText })
  },

  calculateExpiryDate(verifyDateStr) {
    const date = new Date(verifyDateStr)
    date.setMonth(date.getMonth() + 6)
    date.setDate(date.getDate() - 1)
    return date
  },

  saveRecord() {
    const { formData, recordId } = this.data
    
    if (!formData.factoryNo.trim()) {
      wx.showToast({ title: '请填写出厂编号', icon: 'none' })
      return
    }
    if (!formData.verificationDate) {
      wx.showToast({ title: '请选择检定日期', icon: 'none' })
      return
    }

    if (!this.data.selectedDeviceId) {
      wx.showToast({ title: '必须选择压力表（且必须关联设备）', icon: 'none' })
      return
    }
    const selectedDevice = this.data.devices[this.data.deviceIndex]
    if (!selectedDevice || !selectedDevice.equipmentId) {
      wx.showToast({ title: '所选压力表未关联设备，请先在设备库绑定', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })

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
      deviceId: this.data.selectedDeviceId,
      deviceName: selectedDevice.deviceName || this.data.selectedDeviceName || '',
      deviceNo: selectedDevice.deviceNo || '',
      deviceStatus: selectedDevice.status || '在用'
    }

    db.collection('pressure_records').doc(recordId).update({
      data: updateData
    })
    .then(res => {
      console.log('✓ 更新成功:', recordId)
      if (this.data.selectedDeviceId) {
        this.updateDeviceRecordCount(this.data.selectedDeviceId)
      }
      
      wx.hideLoading()
      wx.showToast({ title: '✓ 保存成功', icon: 'success', duration: 1500 })
      const pages = getCurrentPages()
      if (pages.length > 1) {
        const prevPage = pages[pages.length - 2]
        if (prevPage && prevPage.loadRecords) {
          prevPage.loadRecords()
        }
      }
      setTimeout(() => wx.navigateBack(), 1500)
    })
    .catch(err => {
      wx.hideLoading()
      console.error('✗ 保存失败:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
      this.setData({ saving: false })
    })
  },

  deleteRecord() {
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除吗？',
      success: (res) => {
        if (res.confirm) {
          this.performDelete()
        }
      }
    })
  },

  performDelete() {
    wx.showLoading({ title: '删除中...' })
    db.collection('pressure_records').doc(this.data.recordId).remove()
      .then(res => {
        wx.hideLoading()
        wx.showToast({ title: '删除成功', icon: 'success' })
        const pages = getCurrentPages()
        if (pages.length > 1) {
          const prevPage = pages[pages.length - 2]
          if (prevPage && prevPage.loadRecords) {
            prevPage.loadRecords()
          }
        }
        setTimeout(() => wx.navigateBack(), 1500)
      })
      .catch(err => {
        wx.hideLoading()
        console.error('删除失败:', err)
        wx.showToast({ title: '删除失败', icon: 'none' })
      })
  },

  previewImage() {
    if (this.data.record.fileID) {
      wx.previewImage({
        urls: [this.data.record.fileID]
      })
    }
  },
  previewInstallPhoto() {
    if (this.data.record.installPhotoFileID) {
      wx.previewImage({
        urls: [this.data.record.installPhotoFileID]
      })
    }
  },

  formatDate(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`
  },

  formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${this.formatDate(date)} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`
  },
  updateDeviceRecordCount(deviceId) {
    db.collection('pressure_records').where({
      deviceId: deviceId
    }).count().then(res => {
      db.collection('devices').doc(deviceId).update({
        data: {
          recordCount: res.total,
          updateTime: this.formatDateTime(new Date())
        }
      })
    })
  }
})
