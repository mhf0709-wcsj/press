const db = wx.cloud.database()

Page({
  data: {
    records: [],
    searchKeyword: '',
    enterprises: [],
    selectedEnterprise: '全部',
    showAddModal: false,
    showEditModal: false,
    editingRecord: null,
    newRecord: {
      certNo: '',
      sendUnit: '',
      factoryNo: '',
      conclusion: '合格',
      verificationDate: '',
      district: ''
    },
    conclusionOptions: ['合格', '不合格'],
    // 辖区筛选
    districtOptions: ['全部', '大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所'],
    selectedDistrict: '全部',
    // 检定结论筛选
    selectedConclusion: '',
    // 管理员类型
    isAdmin: true,      // 是否是总管理员
    adminDistrict: null, // 辖区管理员的辖区
    // 从dashboard跳转相关
    fromDashboard: false,
    filterType: '',
    today: '',
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
    // 先处理从dashboard传来的参数，再加载数据
    if (options.filter) {
      this.setData({ filterType: options.filter })
    }
    if (options.enterprise) {
      this.setData({ selectedEnterprise: decodeURIComponent(options.enterprise) })
    }
    if (options.district) {
      this.setData({ selectedDistrict: decodeURIComponent(options.district) })
    }
    if (options.conclusion) {
      this.setData({ selectedConclusion: decodeURIComponent(options.conclusion) })
    }
    if (options.from === 'dashboard') {
      this.setData({ fromDashboard: true })
    }
    
    // 然后检查登录并加载数据
    this.checkAdminLogin()
  },

  checkAdminLogin() {
    const adminInfo = wx.getStorageSync('adminUser')
    if (!adminInfo) {
      wx.redirectTo({
        url: '/pages/admin-login/admin-login'
      })
      return
    }
    
    // 如果是辖区管理员，设置默认辖区筛选
    if (adminInfo.role === 'district' && adminInfo.district) {
      this.setData({ 
        selectedDistrict: adminInfo.district,
        isAdmin: false,
        adminDistrict: adminInfo.district
      })
    } else {
      this.setData({
        isAdmin: true,
        adminDistrict: null
      })
    }
    
    this.loadEnterprises()
    this.loadRecords()
    this.loadDevices()
  },

  // 清除结论筛选
  clearConclusionFilter() {
    this.setData({ selectedConclusion: '' })
    this.loadRecords()
  },

  // 切换概览详情展开/收起（已废弃）
  toggleOverview() {
    // 功能已移至dashboard页面
  },

  // 加载总体数据概览（已废弃）
  loadOverviewData() {
    // 功能已移至dashboard页面
  },

  // 加载到期提醒汇总（已废弃）
  loadExpirySummary() {
    // 功能已移至dashboard页面
  },

  // 查看企业到期记录（已废弃）
  viewEnterpriseExpiry(e) {
    // 功能已移至dashboard页面
  },

  onShow() {
    // 页面显示时不重新加载，避免重复请求
  },

  loadEnterprises() {
    db.collection('enterprises').field({ companyName: true }).get()
      .then(res => {
        this.setData({
          enterprises: [{ companyName: '全部' }, ...res.data]
        })
      })
      .catch(err => {
        console.error('加载企业失败:', err)
      })
  },

  // 加载设备列表
  loadDevices() {
    const { isAdmin, adminDistrict, selectedDistrict } = this.data
    
    let whereCondition = {}
    
    if (!isAdmin && adminDistrict) {
      // 辖区管理员：只看自己辖区
      whereCondition.district = adminDistrict
    } else if (selectedDistrict && selectedDistrict !== '全部') {
      // 总管理员：按选中辖区筛选
      whereCondition.district = selectedDistrict
    }
    
    db.collection('devices').where(whereCondition)
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()
      .then(res => {
        this.setData({ devices: res.data })
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
    const { newDevice, isAdmin, adminDistrict, selectedDistrict, newRecord } = this.data
    
    if (!newDevice.deviceName.trim()) {
      wx.showToast({ title: '请输入设备名称', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '创建中...' })
    
    const deviceData = {
      deviceNo: newDevice.deviceNo || `DEV-${Date.now()}`,
      deviceName: newDevice.deviceName,
      deviceType: newDevice.deviceType || '压力表',
      enterpriseId: 'admin',
      enterpriseName: '管理端录入',
      district: newRecord.district || (isAdmin ? selectedDistrict : adminDistrict) || '',
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

  loadRecords() {
    wx.showLoading({ title: '加载中...' })
    
    // 设置今日日期用于判断过期和筛选
    const today = this.formatDate(new Date())
    const thirtyDaysLater = this.formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
    this.setData({ today })
    
    // 构建查询条件
    let whereCondition = {}
    
    // 按企业筛选
    if (this.data.selectedEnterprise && this.data.selectedEnterprise !== '全部') {
      whereCondition.enterpriseName = this.data.selectedEnterprise
    }
    
    // 按辖区筛选（辖区管理员只能看自己辖区）
    if (this.data.adminDistrict) {
      // 辖区管理员，强制筛选自己的辖区
      whereCondition.district = this.data.adminDistrict
    } else if (this.data.selectedDistrict && this.data.selectedDistrict !== '全部') {
      // 总管理员，按选择的辖区筛选
      whereCondition.district = this.data.selectedDistrict
    }
    
    // 按到期状态筛选（从dashboard跳转）
    if (this.data.filterType === 'expired') {
      whereCondition.expiryDate = db.command.lt(today)
    } else if (this.data.filterType === 'expiring') {
      whereCondition.expiryDate = db.command.and([
        db.command.gte(today),
        db.command.lte(thirtyDaysLater)
      ])
    } else if (this.data.filterType === 'expiry') {
      // 过期或即将到期
      whereCondition.expiryDate = db.command.lte(thirtyDaysLater)
    }
    
    // 按检定结论筛选（从dashboard跳转）
    if (this.data.selectedConclusion) {
      whereCondition.conclusion = this.data.selectedConclusion
    }
    
    // 搜索筛选
    if (this.data.searchKeyword.trim()) {
      const keyword = this.data.searchKeyword.trim()
      whereCondition.$or = [
        { factoryNo: db.RegExp({ regexp: keyword, options: 'i' }) },
        { certNo: db.RegExp({ regexp: keyword, options: 'i' }) },
        { sendUnit: db.RegExp({ regexp: keyword, options: 'i' }) }
      ]
    }
    
    let query = db.collection('pressure_records')
    if (Object.keys(whereCondition).length > 0) {
      query = query.where(whereCondition)
    }
    
    query.orderBy('createTime', 'desc').limit(100).get()
      .then(res => {
        wx.hideLoading()
        this.setData({ records: res.data })
      })
      .catch(err => {
        wx.hideLoading()
        console.error('加载失败:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  // 辖区筛选
  onDistrictChange(e) {
    const index = e.detail.value
    const district = this.data.districtOptions[index]
    this.setData({ selectedDistrict: district })
    this.loadRecords()
  },

  onSearch(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.loadRecords()
    }, 300)
  },

  onEnterpriseChange(e) {
    const enterprise = this.data.enterprises[e.detail.value]
    this.setData({ selectedEnterprise: enterprise.companyName })
    this.loadRecords()
  },

  // 显示新增弹窗
  showAdd() {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2,'0')}-${today.getDate().toString().padStart(2,'0')}`
    this.setData({
      showAddModal: true,
      newRecord: {
        certNo: '',
        sendUnit: '',
        factoryNo: '',
        conclusion: '合格',
        verificationDate: dateStr
      }
    })
  },

  // 关闭新增弹窗
  closeAddModal() {
    this.setData({ showAddModal: false })
  },

  // 新增记录
  onNewInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`newRecord.${field}`]: value })
  },

  onNewConclusionChange(e) {
    const conclusions = ['合格', '不合格']
    this.setData({ 
      'newRecord.conclusion': conclusions[e.detail.value]
    })
  },

  onNewDateChange(e) {
    this.setData({ 'newRecord.verificationDate': e.detail.value })
  },

  saveNewRecord() {
    const { newRecord } = this.data

    if (!newRecord.factoryNo.trim()) {
      wx.showToast({ title: '请填写出厂编号', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })

    const verifyDate = new Date(newRecord.verificationDate)
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1) // 检定日期+6个月-1天

    const saveData = {
      ...newRecord,
      instrumentName: newRecord.instrumentName || '压力表',
      verificationStd: newRecord.verificationStd || 'JJG52-2013',
      expiryDate: `${expiryDate.getFullYear()}-${(expiryDate.getMonth()+1).toString().padStart(2,'0')}-${expiryDate.getDate().toString().padStart(2,'0')}`,
      status: 'valid',
      createTime: this.formatDateTime(new Date()),
      updateTime: this.formatDateTime(new Date()),
      ocrSource: 'manual',
      hasImage: false,
      enterpriseName: newRecord.enterpriseName || '未知企业',
      // 设备关联
      deviceId: this.data.selectedDeviceId || '',
      deviceName: this.data.selectedDeviceName || '',
      deviceNo: this.data.selectedDeviceId ? (this.data.devices[this.data.deviceIndex]?.deviceNo || '') : ''
    }

    db.collection('pressure_records').add({
      data: saveData
    })
    .then(res => {
      // 更新设备记录数
      if (this.data.selectedDeviceId) {
        this.updateDeviceRecordCount(this.data.selectedDeviceId)
      }
      wx.hideLoading()
      wx.showToast({ title: '添加成功', icon: 'success' })
      this.setData({ showAddModal: false, selectedDeviceId: '', selectedDeviceName: '', deviceIndex: -1 })
      this.loadRecords()
    })
    .catch(err => {
      wx.hideLoading()
      console.error('添加失败:', err)
      wx.showToast({ title: '添加失败', icon: 'none' })
    })
  },

  // 编辑记录
  editRecord(e) {
    const record = e.currentTarget.dataset.record
    this.setData({
      showEditModal: true,
      editingRecord: { ...record }
    })
  },

  closeEditModal() {
    this.setData({ showEditModal: false, editingRecord: null })
  },

  onEditInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`editingRecord.${field}`]: value })
  },

  onEditConclusionChange(e) {
    const conclusions = ['合格', '不合格']
    this.setData({ 
      'editingRecord.conclusion': conclusions[e.detail.value]
    })
  },

  onEditDateChange(e) {
    this.setData({ 'editingRecord.verificationDate': e.detail.value })
  },

  saveEditRecord() {
    const { editingRecord } = this.data

    if (!editingRecord.factoryNo.trim()) {
      wx.showToast({ title: '请填写出厂编号', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })

    const verifyDate = new Date(editingRecord.verificationDate)
    const expiryDate = new Date(verifyDate)
    expiryDate.setMonth(expiryDate.getMonth() + 6)
    expiryDate.setDate(expiryDate.getDate() - 1) // 检定日期+6个月-1天

    const updateData = {
      ...editingRecord,
      expiryDate: `${expiryDate.getFullYear()}-${(expiryDate.getMonth()+1).toString().padStart(2,'0')}-${expiryDate.getDate().toString().padStart(2,'0')}`,
      updateTime: this.formatDateTime(new Date()),
      // 设备关联
      deviceId: this.data.selectedDeviceId || editingRecord.deviceId || '',
      deviceName: this.data.selectedDeviceName || editingRecord.deviceName || '',
      deviceNo: this.data.selectedDeviceId ? (this.data.devices[this.data.deviceIndex]?.deviceNo || '') : (editingRecord.deviceNo || '')
    }

    db.collection('pressure_records').doc(editingRecord._id).update({
      data: updateData
    })
    .then(res => {
      // 更新设备记录数
      if (this.data.selectedDeviceId) {
        this.updateDeviceRecordCount(this.data.selectedDeviceId)
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success' })
      this.setData({ showEditModal: false, editingRecord: null, selectedDeviceId: '', selectedDeviceName: '', deviceIndex: -1 })
      this.loadRecords()
    })
    .catch(err => {
      wx.hideLoading()
      console.error('保存失败:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  // 删除记录
  deleteRecord(e) {
    const record = e.currentTarget.dataset.record
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 "${record.factoryNo}" 吗？`,
      success: (res) => {
        if (res.confirm) {
          this.performDelete(record._id)
        }
      }
    })
  },

  performDelete(id) {
    wx.showLoading({ title: '删除中...' })
    db.collection('pressure_records').doc(id).remove()
      .then(res => {
        wx.hideLoading()
        wx.showToast({ title: '删除成功', icon: 'success' })
        this.loadRecords()
      })
      .catch(err => {
        wx.hideLoading()
        console.error('删除失败:', err)
        wx.showToast({ title: '删除失败', icon: 'none' })
      })
  },

  // 返回数据概览大屏
  goToDashboard() {
    wx.navigateBack()
  },

  formatDate(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`
  },

  formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`
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
