const authService = require('../../services/auth-service')

const TEXT = {
  heroTopline: '管理端',
  heroTitle: '管理工作台',
  heroDesc: '',
  infoTitle: '账号信息',
  sectionTitle: '功能',
  switchPreview: '预览平台',
  switchWorkbench: '管理工作台',
  logout: '退出登录',
  adminRole: '总管理员',
  districtRole: '辖区管理员',
  labels: {
    username: '用户名',
    role: '账号类型',
    district: '管理辖区',
    loginTime: '当前登录时间'
  },
  messages: {
    logoutTitle: '退出登录',
    logoutContent: '确认退出管理端吗？'
  }
}

Page({
  data: {
    text: TEXT,
    adminName: '',
    isAdmin: true,
    adminDistrict: '',
    adminInfo: {},
    displayRole: '',
    loginTime: '',
    entries: []
  },

  onLoad() {
    this.loadAdminInfo()
  },

  onShow() {
    this.loadAdminInfo()
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
      adminDistrict: isDistrictAdmin ? adminInfo.district : '',
      adminInfo,
      displayRole: isDistrictAdmin ? TEXT.districtRole : TEXT.adminRole,
      loginTime: this.formatDateTime(new Date()),
      adminName: isDistrictAdmin ? `${adminInfo.district}辖区` : '总管理端',
      entries: this.buildEntries()
    })
  },

  buildEntries() {
    return [
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

  logout() {
    wx.showModal({
      title: TEXT.messages.logoutTitle,
      content: TEXT.messages.logoutContent,
      success: (res) => {
        if (!res.confirm) return
        authService.adminLogout()
        wx.redirectTo({
          url: '/pages/admin-login/admin-login'
        })
      }
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
  },

  formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
})
