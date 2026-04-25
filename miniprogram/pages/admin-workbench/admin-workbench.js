const TEXT = {
  heroTopline: '管理端',
  heroTitle: '管理工作台',
  heroDesc: '',
  switchPreview: '预览平台',
  switchWorkbench: '管理工作台',
  sectionTitle: '功能'
}

Page({
  data: {
    text: TEXT,
    adminName: '',
    isAdmin: true,
    entries: []
  },

  onLoad() {
    this.loadAdminInfo()
  },

  onShow() {
    if (!this.data.entries.length) {
      this.loadAdminInfo()
    }
  },

  loadAdminInfo() {
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
      adminName: isDistrictAdmin ? `${adminInfo.district}辖区` : '总管理端',
      entries: this.buildEntries()
    })
  },

  buildEntries() {
    return [
      {
        key: 'settings',
        title: '账号信息设置',
        action: 'goToAccountSettings'
      },
      {
        key: 'ledger',
        title: '台账中心',
        action: 'goToLedger'
      },
      {
        key: 'enterprise',
        title: '企业管理',
        action: 'goToEnterpriseList'
      }
    ]
  },

  onTapEntry(e) {
    const action = e.currentTarget.dataset.action
    if (!action || typeof this[action] !== 'function') return
    this[action]()
  },

  goToAccountSettings() {
    wx.navigateTo({
      url: '/pages/account-settings/account-settings'
    })
  },

  goToPreviewPlatform() {
    wx.redirectTo({
      url: '/pages/dashboard/dashboard'
    })
  },

  goToLedger() {
    wx.navigateTo({
      url: '/pages/admin/admin?from=dashboard'
    })
  },

  goToEnterpriseList() {
    wx.navigateTo({
      url: '/pages/enterprise-list/enterprise-list'
    })
  }
})
