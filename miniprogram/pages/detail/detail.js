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
      district: ''
    },
    conclusionIndex: 0,
    districtIndex: 0,
    districtOptions: ['大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所'],
    expiryDateText: '',
    saving: false,
    // 设备相关
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
          
          // 设置辖区索引
          let districtIndex = 0
          if (record.district) {
            const idx = this.data.districtOptions.indexOf(record.district)
            if (idx > -1) districtIndex = idx
          }
          
          // 设置设备索引
          let deviceIndex = -1
          if (record.deviceId && this.data.devices.length > 0) {
            const idx = this.data.devices.findIndex(d => d._id === record.deviceId)
            if (idx > -1) deviceIndex = idx
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
              district: record.district || ''
            },
            districtIndex: districtIndex,
            deviceIndex: deviceIndex,
            selectedDeviceId: record.deviceId || '',
            selectedDeviceName: record.deviceName || '',
            expiryDateText: record.expiryDate ? 
              `${new Date(record.expiryDate).getFullYear()}年${new Date(record.expiryDate).getMonth()+1}月${new Date(record.expiryDate).getDate()}日` : 
              ''
          })
          
          // 设置结论索引
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

  // 加载设备列表
  loadDevices() {
    const enterpriseUser = wx.getStorageSync('enterpriseUser')
    const adminUser = wx.getStorageSync('adminUser')
    
    let whereCondition = {}
    
    if (adminUser) {
      // 管理员模式：按辖区筛选
      if (adminUser.district) {
        whereCondition.district = adminUser.district
      }
    } else if (enterpriseUser) {
      // 企业用户：只看本企业设备
      whereCondition.enterpriseName = enterpriseUser.companyName
    }
    
    db.collection('devices').where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
      .then(res => {
        this.setData({ devices: res.data })
        
        // 如果已有记录，重新设置设备索引
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

  // 设备选择
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

  // 显示新建设备表单
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

  // 隐藏新建设备表单
  hideNewDeviceForm() {
    this.setData({ showNewDevice: false })
  },

  // 新建设备输入
  onNewDeviceInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`newDevice.${field}`]: value })
  },

  // 保存新设备
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
      
      // 刷新设备列表并选中新设备
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
    date.setDate(date.getDate() - 1) // 检定日期+6个月-1天
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

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...', mask: true })

    const verifyDate = new Date(formData.verificationDate)
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1) // 检定日期+6个月-1天

    const updateData = {
      ...formData,
      expiryDate: this.formatDate(expiryDate),
      status: 'valid',
      updateTime: this.formatDateTime(new Date()),
      ocrSource: 'manual', // 编辑后标记为手动录入
      // 设备关联
      deviceId: this.data.selectedDeviceId || '',
      deviceName: this.data.selectedDeviceName || '',
      deviceNo: this.data.selectedDeviceId ? (this.data.devices[this.data.deviceIndex]?.deviceNo || '') : ''
    }

    db.collection('pressure_records').doc(recordId).update({
      data: updateData
    })
    .then(res => {
      console.log('✓ 更新成功:', recordId)
      
      // 更新设备记录数
      if (this.data.selectedDeviceId) {
        this.updateDeviceRecordCount(this.data.selectedDeviceId)
      }
      
      wx.hideLoading()
      wx.showToast({ title: '✓ 保存成功', icon: 'success', duration: 1500 })
      // 返回并刷新列表
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
        // 返回并刷新列表
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

  // 预览安装照片
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

  // 更新设备记录数
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