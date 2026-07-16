const authService = require('../../services/auth-service')
const dataAccess = require('../../services/data-access-service')

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
    entries: [],
    pendingEnterpriseCount: 0
  },

  onLoad() {
    this.loadAdminInfo()
  },

  onShow() {
    this.loadAdminInfo()
    this.loadPendingEnterpriseCount()
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

  buildEntries(pendingEnterpriseCount = this.data.pendingEnterpriseCount) {
    return [
      {
        key: 'ledger',
        title: '台账中心',
        action: 'goToLedger'
      },
      {
        key: 'enterprise',
        title: '企业管理',
        subtitle: pendingEnterpriseCount
          ? `${pendingEnterpriseCount} 家待审核`
          : '',
        action: 'goToEnterpriseList'
      },
      {
        key: 'notices',
        title: '企业提醒',
        subtitle: '发送提醒并查看企业反馈',
        action: 'goToEnterpriseNotices'
      }
    ]
  },

  async loadPendingEnterpriseCount() {
    try {
      const pendingEnterpriseCount = await dataAccess.count('enterprises', { approvalStatus: 'pending' })
      this.setData({
        pendingEnterpriseCount,
        entries: this.buildEntries(pendingEnterpriseCount)
      })
    } catch (error) {}
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

  goToEnterpriseNotices() {
    wx.navigateTo({
      url: '/pages/admin-notices/admin-notices'
    })
  },

  formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
})
