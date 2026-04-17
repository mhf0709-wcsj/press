const { CLOUD_CONFIG } = require('../../constants/index')

let db = null

const TEXT = {
  heroTopline: 'Ledger Center',
  heroTitle: '\u53f0\u8d26\u4e2d\u5fc3',
  heroDesc: '\u4fdd\u7559\u67e5\u770b\u3001\u7b5b\u9009\u3001\u8fdb\u8be6\u60c5\u8fd9\u4e09\u4ef6\u4e8b\uff0c\u8ba9\u53f0\u8d26\u7ba1\u7406\u66f4\u6e05\u695a\u3002',
  searchRecords: '\u641c\u7d22\u8bc1\u4e66\u7f16\u53f7 / \u51fa\u5382\u7f16\u53f7 / \u9001\u68c0\u5355\u4f4d',
  searchEquipments: '\u641c\u7d22\u8bbe\u5907\u540d\u79f0 / \u7f16\u53f7 / \u4f01\u4e1a',
  allDistricts: '\u5168\u90e8\u8f96\u533a',
  allEnterprises: '\u5168\u90e8\u4f01\u4e1a',
  modeRecords: '\u68c0\u5b9a\u8bb0\u5f55',
  modeEquipments: '\u8bbe\u5907\u6863\u6848',
  refresh: '\u5237\u65b0',
  aiEntry: 'AI\u5f55\u5165',
  fromDashboard: '\u8fd4\u56de\u9996\u9875',
  emptyRecords: '\u6682\u65f6\u6ca1\u6709\u7b26\u5408\u6761\u4ef6\u7684\u8bb0\u5f55',
  emptyEquipments: '\u6682\u65f6\u6ca1\u6709\u7b26\u5408\u6761\u4ef6\u7684\u8bbe\u5907',
  passValue: '\u5408\u683c',
  countUnit: '\u53f0',
  fields: {
    certNo: '\u8bc1\u4e66\u7f16\u53f7',
    enterprise: '\u4f01\u4e1a',
    equipment: '\u8bbe\u5907',
    district: '\u8f96\u533a',
    verificationDate: '\u68c0\u5b9a\u65e5\u671f',
    expiryDate: '\u5230\u671f\u65e5\u671f',
    equipmentNo: '\u8bbe\u5907\u7f16\u53f7',
    location: '\u4f4d\u7f6e'
  }
}

const DISTRICTS = [
  '\u5168\u90e8\u8f96\u533a',
  '\u5927\u7898\u6240',
  '\u73ad\u6eaa\u6240',
  '\u5de8\u5c7f\u6240',
  '\u5ce1\u53e3\u6240',
  '\u9ec4\u575b\u6240',
  '\u897f\u5761\u6240',
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

  onLoad(options) {
    if (options.view) {
      this.setData({ viewMode: options.view })
    }
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
    this.loadAllData()
      .finally(() => wx.stopPullDownRefresh())
  },

  async loadAllData() {
    this.setData({ loading: true })
    wx.showLoading({ title: '\u52a0\u8f7d\u4e2d...' })

    try {
      await Promise.all([
        this.loadEnterprises(),
        this.data.viewMode === 'records' ? this.loadRecords() : this.loadEquipments()
      ])
    } catch (error) {
      console.error('Admin page load failed:', error)
      wx.showToast({
        title: '\u6570\u636e\u52a0\u8f7d\u5931\u8d25',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
    }
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

    const records = this.filterRecordsByKeyword(res.data || [])
    this.setData({ records })
  },

  buildRecordWhereCondition() {
    const condition = {}

    if (this.deviceIdFilter) {
      condition.deviceId = this.deviceIdFilter
    }

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
      const _ = db.command
      const today = this.formatDate(new Date())
      const future = this.formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

      if (this.data.filterType === 'expired') {
        condition.expiryDate = _.lt(today)
      } else if (this.data.filterType === 'expiring') {
        condition.expiryDate = _.and([_.gte(today), _.lte(future)])
      } else if (this.data.filterType === 'expiry') {
        condition.expiryDate = _.lte(future)
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

    const equipments = this.filterEquipmentsByKeyword(res.data || [])
    this.setData({ equipments })
  },

  buildEquipmentWhereCondition() {
    const condition = {}

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
    this.setData({
      selectedDistrict: district
    }, () => this.loadAllData())
  },

  onEnterpriseChange(e) {
    const enterprise = this.data.enterprises[e.detail.value]
    this.setData({
      selectedEnterprise: enterprise.companyName
    }, () => this.loadAllData())
  },

  switchViewMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.viewMode) return

    this.setData({
      viewMode: mode
    }, () => this.loadAllData())
  },

  refreshData() {
    this.loadAllData()
  },

  goToDashboard() {
    wx.navigateBack()
  },

  goToAiEntry() {
    wx.navigateTo({
      url: '/pages/ai-assistant/ai-assistant'
    })
  },

  viewRecordDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    })
  },

  viewEquipmentDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: `/pages/equipment-detail/equipment-detail?id=${id}&adminView=1`
    })
  },

  formatDate(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
})
