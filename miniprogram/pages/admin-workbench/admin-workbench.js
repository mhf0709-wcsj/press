const authService = require('../../services/auth-service')
const expiryReminderService = require('../../services/expiry-reminder-service')

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
    workspaceSummary: {
      pendingEnterpriseCount: 0,
      pendingReviewCount: 0,
      overdueCount: 0
    }
  },

  onShow() {
    this._pageVisible = true
    if (!this.loadAdminInfo()) return

    const refreshSummary = () => {
      if (this._pageVisible) this.loadWorkspaceSummary()
    }
    if (typeof wx.nextTick === 'function') wx.nextTick(refreshSummary)
    else setTimeout(refreshSummary, 0)
  },

  onHide() {
    this._pageVisible = false
  },

  onUnload() {
    this._pageVisible = false
  },

  loadAdminInfo() {
    const adminInfo = wx.getStorageSync('adminUser')
    if (!adminInfo) {
      wx.redirectTo({
        url: '/pages/admin-login/admin-login'
      })
      return false
    }

    const isDistrictAdmin = adminInfo.role === 'district' && adminInfo.district
    const isAdmin = ['admin', 'super_admin'].includes(adminInfo.role)
    this.setData({
      isAdmin,
      adminDistrict: isDistrictAdmin ? adminInfo.district : '',
      adminInfo,
      displayRole: isDistrictAdmin ? TEXT.districtRole : TEXT.adminRole,
      loginTime: this.formatDateTime(new Date()),
      adminName: isDistrictAdmin ? `${adminInfo.district}辖区` : '总管理端',
      entries: this.buildEntries(this.data.workspaceSummary, isAdmin)
    })
    return true
  },

  buildEntries(summary = this.data.workspaceSummary, isAdmin = this.data.isAdmin) {
    const pendingEnterpriseCount = Number(summary.pendingEnterpriseCount || 0)
    const pendingReviewCount = Number(summary.pendingReviewCount || 0)
    const overdueCount = Number(summary.overdueCount || 0)
    const noticeSummary = [
      pendingReviewCount ? `${pendingReviewCount} 项待复核` : '',
      overdueCount ? `${overdueCount} 项逾期` : ''
    ].filter(Boolean).join(' · ')
    const entries = [
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
      ...(isAdmin ? [{
        key: 'accounts',
        title: '辖区账号管理',
        subtitle: '管理辖区管理员账号',
        action: 'goToAdminAccounts'
      }] : []),
      {
        key: 'notices',
        title: '企业提醒',
        subtitle: noticeSummary || '发送提醒并查看企业反馈',
        action: 'goToEnterpriseNotices'
      }
    ]
    return entries
  },

  async loadWorkspaceSummary() {
    if (this._summaryLoading) return
    this._summaryLoading = true
    try {
      const result = await expiryReminderService.getAdminWorkspaceSummary(30, this.data.adminDistrict || '')
      if (!result?.success) throw new Error(result?.error || '监管待办加载失败')
      if (!this._pageVisible) return
      const data = result.data || {}
      const taskSummary = data.taskSummary || {}
      const workspaceSummary = {
        pendingEnterpriseCount: Number(data.pendingEnterpriseCount || 0),
        pendingReviewCount: Number(taskSummary.pendingReviewCount || 0),
        overdueCount: Number(taskSummary.overdueCount || 0)
      }
      this.setData({
        workspaceSummary,
        entries: this.buildEntries(workspaceSummary, this.data.isAdmin)
      })
    } catch (error) {
    } finally {
      this._summaryLoading = false
    }
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

  goToAdminAccounts() {
    if (!this.data.isAdmin) return
    wx.navigateTo({
      url: '/pages/admin-accounts/admin-accounts'
    })
  },

  formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
})
