const { CLOUD_CONFIG } = require('../../constants/index')
const deletionLogService = require('../../services/deletion-log-service')

let db = null

const TEXT = {
  heroTopline: '台账',
  heroTitle: '\u53f0\u8d26\u4e2d\u5fc3',
  heroDesc: '',
  searchRecords: '\u641c\u7d22\u8bb0\u5f55',
  searchEquipments: '\u641c\u7d22\u8bbe\u5907',
  searchDeletions: '\u641c\u7d22\u5220\u9664\u8bb0\u5f55',
  allDistricts: '\u5168\u90e8\u8f96\u533a',
  allEnterprises: '\u5168\u90e8\u4f01\u4e1a',
  modeRecords: '\u68c0\u5b9a\u8bb0\u5f55',
  modeEquipments: '\u8bbe\u5907\u6863\u6848',
  modeDeletions: '\u5220\u9664\u7559\u75d5',
  refresh: '\u5237\u65b0',
  fromDashboard: '\u8fd4\u56de\u9996\u9875',
  scopeAll: '\u5168\u90e8\u8bb0\u5f55',
  scopeExpired: '\u5df2\u8fc7\u671f',
  scopeExpiring: '30\u5929\u5185\u5230\u671f',
  scopeRisk: '\u98ce\u9669\u8bb0\u5f55',
  emptyRecords: '\u6682\u65e0\u8bb0\u5f55',
  emptyEquipments: '\u6682\u65e0\u8bbe\u5907',
  emptyDeletions: '\u6682\u65e0\u7559\u75d5',
  passValue: '\u5408\u683c',
  countUnit: '\u53f0',
  deletedTag: '\u5df2\u5220\u9664',
  fields: {
    certNo: '\u8bc1\u4e66\u7f16\u53f7',
    enterprise: '\u4f01\u4e1a',
    equipment: '\u8bbe\u5907',
    district: '\u8f96\u533a',
    verificationDate: '\u68c0\u5b9a\u65e5\u671f',
    expiryDate: '\u5230\u671f\u65e5\u671f',
    equipmentNo: '\u8bbe\u5907\u7f16\u53f7',
    location: '\u4f4d\u7f6e',
    deletedAt: '\u5220\u9664\u65f6\u95f4',
    deletedBy: '\u5220\u9664\u4e3b\u4f53',
    relatedRecordCount: '\u5173\u8054\u8bb0\u5f55'
  }
}

const DISTRICTS = [
  '\u5168\u90e8\u8f96\u533a',
  '\u5927\u5cef\u6240',
  '\u73ca\u6eaa\u6240',
  '\u5de8\u5c7f\u6240',
  '\u5cef\u53e3\u6240',
  '\u9ec4\u5766\u6240',
  '\u897f\u5751\u6240',
  '\u7389\u58f6\u6240',
  '\u5357\u7530\u6240',
  '\u767e\u4e08\u6f88\u6240'
]

Page({
  data: {
    text: TEXT,
    viewMode: 'records',
    records: [],
    equipments: [],
    deletionLogs: [],
    enterprises: [{ companyName: TEXT.allEnterprises }],
    districtOptions: DISTRICTS,
    selectedDistrict: TEXT.allDistricts,
    selectedEnterprise: TEXT.allEnterprises,
    searchKeyword: '',
    loading: false,
    isAdmin: true,
    adminDistrict: '',
    fromDashboard: false,
    filterType: '',
    selectedConclusion: ''
  },

  onLoad(options = {}) {
    if (options.view) this.setData({ viewMode: options.view })
    if (options.filter) this.setData({ filterType: options.filter })
    if (options.enterprise) this.setData({ selectedEnterprise: decodeURIComponent(options.enterprise) })
    if (options.district) this.setData({ selectedDistrict: decodeURIComponent(options.district) })
    if (options.conclusion) this.setData({ selectedConclusion: decodeURIComponent(options.conclusion) })
    if (options.from === 'dashboard') this.setData({ fromDashboard: true })
    if (options.deviceId) {
      this.deviceIdFilter = options.deviceId
      this.setData({ viewMode: 'records' })
    }

    this.initCloudContext()
      .then(() => this.checkAdminLogin())
      .catch((error) => {
        console.error('Admin init failed:', error)
        wx.showToast({
          title: '\u4e91\u73af\u5883\u8fde\u63a5\u5931\u8d25',
          icon: 'none'
        })
      })
  },

  onShow() {
    if (this.hasLoadedOnce) {
      this.loadAllData()
    }
  },

  initCloudContext() {
    if (db) return Promise.resolve()
    wx.cloud.init({
      env: CLOUD_CONFIG.ENV,
      traceUser: true
    })
    db = wx.cloud.database()
    return Promise.resolve()
  },

  checkAdminLogin() {
    const adminInfo = wx.getStorageSync('adminUser')
    if (!adminInfo) {
      wx.redirectTo({
        url: '/pages/admin-login/admin-login'
      })
      return
    }

    const isDistrictAdmin = adminInfo.role === 'district' && adminInfo.district
    this.setData({
      isAdmin: !isDistrictAdmin,
      adminDistrict: isDistrictAdmin ? adminInfo.district : '',
      selectedDistrict: isDistrictAdmin ? adminInfo.district : this.data.selectedDistrict
    }, () => {
      this.loadAllData()
    })
  },

  onPullDownRefresh() {
    this.loadAllData().finally(() => wx.stopPullDownRefresh())
  },

  async loadAllData() {
    this.setData({ loading: true })
    wx.showLoading({ title: '\u52a0\u8f7d\u4e2d...' })

    try {
      await this.syncDeletedDeviceRecords()
      await Promise.all([
        this.loadEnterprises(),
        this.loadCurrentView()
      ])
    } catch (error) {
      console.error('Admin page load failed:', error)
      wx.showToast({
        title: '\u6570\u636e\u52a0\u8f7d\u5931\u8d25',
        icon: 'none'
      })
    } finally {
      this.hasLoadedOnce = true
      wx.hideLoading()
      this.setData({ loading: false })
    }
  },

  async syncDeletedDeviceRecords() {
    try {
      await wx.cloud.callFunction({
        name: 'expiryReminder',
        data: {
          action: 'syncDeletedDeviceRecords',
          district: this.data.adminDistrict || ''
        }
      })
    } catch (error) {}
  },

  loadCurrentView() {
    if (this.data.viewMode === 'records') return this.loadRecords()
    if (this.data.viewMode === 'equipments') return this.loadEquipments()
    return this.loadDeletionLogs()
  },

  async loadEnterprises() {
    const res = await db.collection('enterprises')
      .field({ companyName: true })
      .limit(200)
      .get()

    const enterprises = (res.data || [])
      .filter((item) => item.companyName)
      .map((item) => ({ companyName: item.companyName }))

    this.setData({
      enterprises: [{ companyName: TEXT.allEnterprises }, ...enterprises]
    })
  },

  async loadRecords() {
    const whereCondition = this.buildRecordWhereCondition()
    let query = db.collection('pressure_records')

    if (Object.keys(whereCondition).length > 0) {
      query = query.where(whereCondition)
    }

    const res = await query
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()

    this.setData({
      records: this.filterRecordsByKeyword(res.data || [])
    })
  },

  buildRecordWhereCondition() {
    const condition = {
      isDeleted: db.command.neq(true)
    }

    if (this.deviceIdFilter) condition.deviceId = this.deviceIdFilter

    if (this.data.adminDistrict) {
      condition.district = this.data.adminDistrict
    } else if (this.data.selectedDistrict && this.data.selectedDistrict !== TEXT.allDistricts) {
      condition.district = this.data.selectedDistrict
    }

    if (this.data.selectedEnterprise && this.data.selectedEnterprise !== TEXT.allEnterprises) {
      condition.enterpriseName = this.data.selectedEnterprise
    }

    if (this.data.selectedConclusion) {
      condition.conclusion = this.data.selectedConclusion
    }

    if (this.data.filterType) {
      const command = db.command
      const today = this.formatDate(new Date())
      const future = this.formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

      if (this.data.filterType === 'expired') {
        condition.expiryDate = command.lt(today)
      } else if (this.data.filterType === 'expiring') {
        condition.expiryDate = command.and([command.gte(today), command.lte(future)])
      } else if (this.data.filterType === 'expiry' || this.data.filterType === 'risk') {
        condition.expiryDate = command.lte(future)
      }
    }

    return condition
  },

  filterRecordsByKeyword(records) {
    const keyword = this.data.searchKeyword.trim().toLowerCase()
    if (!keyword) return records

    return records.filter((item) => {
      const fields = [
        item.certNo,
        item.factoryNo,
        item.sendUnit,
        item.enterpriseName,
        item.deviceName,
        item.equipmentName
      ]
      return fields.some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  },

  async loadEquipments() {
    const whereCondition = this.buildEquipmentWhereCondition()
    let query = db.collection('equipments')

    if (Object.keys(whereCondition).length > 0) {
      query = query.where(whereCondition)
    }

    const res = await query
      .orderBy('createTime', 'desc')
      .limit(100)
      .get()

    this.setData({
      equipments: this.filterEquipmentsByKeyword(res.data || [])
    })
  },

  buildEquipmentWhereCondition() {
    const condition = {
      isDeleted: db.command.neq(true)
    }

    if (this.data.adminDistrict) {
      condition.district = this.data.adminDistrict
    } else if (this.data.selectedDistrict && this.data.selectedDistrict !== TEXT.allDistricts) {
      condition.district = this.data.selectedDistrict
    }

    if (this.data.selectedEnterprise && this.data.selectedEnterprise !== TEXT.allEnterprises) {
      condition.enterpriseName = this.data.selectedEnterprise
    }

    return condition
  },

  filterEquipmentsByKeyword(equipments) {
    const keyword = this.data.searchKeyword.trim().toLowerCase()
    if (!keyword) return equipments

    return equipments.filter((item) => {
      const fields = [
        item.equipmentName,
        item.equipmentNo,
        item.enterpriseName,
        item.location
      ]
      return fields.some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  },

  async loadDeletionLogs() {
    const logs = await deletionLogService.loadLogs({
      enterpriseName: this.data.selectedEnterprise,
      district: this.data.adminDistrict || this.data.selectedDistrict,
      keyword: this.data.searchKeyword
    })
    this.setData({ deletionLogs: logs })
  },

  onSearch(e) {
    this.setData({
      searchKeyword: e.detail.value || ''
    })

    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.loadAllData()
    }, 250)
  },

  onDistrictChange(e) {
    const district = this.data.districtOptions[e.detail.value]
    this.setData({ selectedDistrict: district }, () => this.loadAllData())
  },

  onEnterpriseChange(e) {
    const enterprise = this.data.enterprises[e.detail.value]
    this.setData({ selectedEnterprise: enterprise.companyName }, () => this.loadAllData())
  },

  switchViewMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.viewMode) return
    this.setData({ viewMode: mode }, () => this.loadAllData())
  },

  setQuickFilter(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.filterType) return
    this.setData({ filterType: filter || '' }, () => this.loadAllData())
  },

  refreshData() {
    this.loadAllData()
  },

  goToDashboard() {
    wx.navigateBack()
  },

  viewRecordDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  viewEquipmentDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/equipment-detail/equipment-detail?id=${id}&adminView=1` })
  },

  formatDate(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
})
