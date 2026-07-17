const dataAccess = require('../../services/data-access-service')
const expiryReminderService = require('../../services/expiry-reminder-service')
const authService = require('../../services/auth-service')

const TEXT = {
  heroTopline: '企业',
  heroTitle: '\u4f01\u4e1a\u7ba1\u7406',
  heroDesc: '',
  riskTitle: '\u98ce\u9669\u4f01\u4e1a',
  riskDesc: '',
  loading: '\u52a0\u8f7d\u4e2d...',
  empty: '\u6682\u65e0\u4f01\u4e1a',
  emptyRisk: '\u6682\u65e0\u98ce\u9669\u4f01\u4e1a',
  noDistrict: '\u672a\u8bbe\u7f6e\u8f96\u533a',
  filterPending: '待审核',
  filterAll: '全部企业',
  approve: '通过',
  reject: '驳回',
  approved: '已通过',
  pending: '待审核',
  rejected: '已驳回',
  approveTitle: '通过企业申请',
  approveContent: '确认该企业资料无误并允许登录使用吗？',
  rejectTitle: '驳回企业申请',
  rejectPlaceholder: '请填写需要企业修改的内容',
  reviewSuccess: '审核已完成',
  bindingClaim: '历史企业微信绑定申请',
  bindingResubmit: '企业资料重新提交',
  newRegistration: '新企业开通申请',
  sendNotice: '发送提醒',
  noticeTitle: '企业提醒',
  noticeTarget: '提醒企业',
  noticeType: '提醒类型',
  noticePriority: '紧急程度',
  noticeContent: '提醒内容',
  cancel: '取消',
  send: '确认发送',
  fields: {
    legalPerson: '\u6cd5\u4eba\u4ee3\u8868',
    phone: '\u8054\u7cfb\u7535\u8bdd',
    creditCode: '信用代码',
    createTime: '\u6ce8\u518c\u65f6\u95f4'
  }
}

Page({
  data: {
    text: TEXT,
    enterpriseList: [],
    allEnterpriseList: [],
    loading: true,
    mode: 'all',
    statusFilter: 'pending',
    reviewingId: '',
    noticeEditorVisible: false,
    noticeTarget: null,
    noticeType: 'expiry',
    noticePriority: 'important',
    noticeTitle: '',
    noticeContent: '',
    noticeDeadline: '',
    today: '',
    sendingNotice: false,
    noticeTypes: [
      { key: 'expiry', label: '到期整改' },
      { key: 'material', label: '资料补充' },
      { key: 'inspection', label: '现场检查' },
      { key: 'general', label: '一般通知' }
    ],
    noticePriorities: [
      { key: 'normal', label: '普通' },
      { key: 'important', label: '重要' },
      { key: 'urgent', label: '紧急' }
    ]
  },

  onLoad(options) {
    const mode = options.mode === 'risk' ? 'risk' : 'all'
    const statusFilter = options.status === 'all' ? 'all' : 'pending'
    this.setData({ mode, statusFilter, today: this.formatDate(new Date()) }, () => {
      this.loadEnterpriseList().finally(() => {
        this.hasLoadedOnce = true
      })
    })
  },

  onShow() {
    if (!this.hasLoadedOnce) return
    this.loadEnterpriseList()
  },

  onPullDownRefresh() {
    this.loadEnterpriseList()
      .finally(() => wx.stopPullDownRefresh())
  },

  async loadEnterpriseList() {
    this.setData({ loading: true })

    try {
      if (this.data.mode === 'risk') {
        const riskEnterprises = await this.loadRiskEnterprises()
        const enterpriseList = riskEnterprises.map((item) => ({
          _id: item.enterpriseName || item.phone || String(Math.random()),
          companyName: item.enterpriseName || '-',
          district: item.district || '',
          legalPerson: '',
          phone: item.phone || '',
          createTimeStr: '',
          expiredCount: item.expiredCount || 0,
          expiringCount: item.expiringCount || 0
        }))

        this.setData({
          enterpriseList,
          loading: false
        })
        return
      }

      const enterprises = await dataAccess.list('enterprises', {
        orderBy: { field: 'createTime', direction: 'desc' },
        limit: 100
      })

      const enterpriseList = enterprises.map((item) => ({
        ...item,
        ...this.getApprovalMeta(item),
        bindingRequestText: this.getBindingRequestText(item.bindingRequestType),
        createTimeStr: this.formatDateTime(item.createTime)
      }))

      this.setData({
        allEnterpriseList: enterpriseList,
        enterpriseList: this.filterEnterprises(enterpriseList),
        loading: false
      })
    } catch (error) {
      console.error('Enterprise list load failed:', error)
      this.setData({ loading: false })
      wx.showToast({
        title: '\u52a0\u8f7d\u5931\u8d25',
        icon: 'none'
      })
    }
  },

  getApprovalMeta(item) {
    const status = ['pending', 'approved', 'rejected'].includes(item.approvalStatus)
      ? item.approvalStatus
      : 'approved'
    const map = {
      pending: { approvalStatus: status, approvalText: TEXT.pending, approvalClass: 'pending' },
      approved: { approvalStatus: status, approvalText: TEXT.approved, approvalClass: 'approved' },
      rejected: { approvalStatus: status, approvalText: TEXT.rejected, approvalClass: 'rejected' }
    }
    return map[status]
  },

  getBindingRequestText(requestType) {
    const map = {
      claim_existing_enterprise: TEXT.bindingClaim,
      resubmit_existing_enterprise: TEXT.bindingResubmit,
      resubmit_enterprise_registration: TEXT.bindingResubmit,
      new_enterprise_registration: TEXT.newRegistration
    }
    return map[requestType] || TEXT.newRegistration
  },

  filterEnterprises(list = this.data.allEnterpriseList) {
    if (this.data.statusFilter === 'pending') {
      return list.filter((item) => item.approvalStatus === 'pending')
    }
    return list
  },

  changeStatusFilter(e) {
    const statusFilter = e.currentTarget.dataset.filter
    if (!['pending', 'all'].includes(statusFilter) || statusFilter === this.data.statusFilter) return
    this.setData({ statusFilter }, () => {
      this.setData({ enterpriseList: this.filterEnterprises() })
    })
  },

  approveEnterprise(e) {
    const enterpriseId = e.currentTarget.dataset.id
    if (!enterpriseId || this.data.reviewingId) return
    const enterprise = this.data.allEnterpriseList.find((item) => item._id === enterpriseId)
    const isExistingClaim = enterprise?.bindingRequestType === 'claim_existing_enterprise'
    wx.showModal({
      title: TEXT.approveTitle,
      content: isExistingClaim
        ? '该微信账号正在申请绑定历史已审核企业。请核对企业身份和申请人信息后再通过。'
        : TEXT.approveContent,
      success: (res) => {
        if (res.confirm) this.performReview(enterpriseId, 'approved')
      }
    })
  },

  rejectEnterprise(e) {
    const enterpriseId = e.currentTarget.dataset.id
    if (!enterpriseId || this.data.reviewingId) return
    wx.showModal({
      title: TEXT.rejectTitle,
      editable: true,
      placeholderText: TEXT.rejectPlaceholder,
      success: (res) => {
        if (!res.confirm) return
        const reason = String(res.content || '').trim()
        if (!reason) return wx.showToast({ title: TEXT.rejectPlaceholder, icon: 'none' })
        this.performReview(enterpriseId, 'rejected', reason)
      }
    })
  },

  async performReview(enterpriseId, decision, reason = '') {
    this.setData({ reviewingId: enterpriseId })
    wx.showLoading({ title: '提交中...', mask: true })
    try {
      await authService.reviewEnterprise(enterpriseId, decision, reason)
      wx.showToast({ title: TEXT.reviewSuccess, icon: 'success' })
      await this.loadEnterpriseList()
    } catch (error) {
      wx.showToast({ title: error.message || '审核失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ reviewingId: '' })
    }
  },

  openNoticeEditor(e) {
    const enterpriseId = e.currentTarget.dataset.id
    const enterprise = this.data.allEnterpriseList.find((item) => item._id === enterpriseId)
    if (!enterprise || enterprise.approvalStatus !== 'approved') return
    const template = this.getNoticeTemplate('expiry', enterprise.companyName)
    this.setData({
      noticeEditorVisible: true,
      noticeTarget: enterprise,
      noticeType: 'expiry',
      noticePriority: 'important',
      noticeTitle: template.title,
      noticeContent: template.content,
      noticeDeadline: this.getDefaultDeadline('important')
    })
  },

  closeNoticeEditor() {
    if (this.data.sendingNotice) return
    this.setData({ noticeEditorVisible: false, noticeTarget: null })
  },

  stopNoticePropagation() {},

  changeNoticeType(e) {
    const noticeType = e.currentTarget.dataset.type
    const template = this.getNoticeTemplate(noticeType, this.data.noticeTarget?.companyName)
    this.setData({
      noticeType,
      noticeTitle: template.title,
      noticeContent: template.content
    })
  },

  changeNoticePriority(e) {
    const noticePriority = e.currentTarget.dataset.priority
    this.setData({
      noticePriority,
      noticeDeadline: this.getDefaultDeadline(noticePriority)
    })
  },

  changeNoticeDeadline(e) {
    this.setData({ noticeDeadline: e.detail.value })
  },

  onNoticeTitleInput(e) {
    this.setData({ noticeTitle: e.detail.value })
  },

  onNoticeContentInput(e) {
    this.setData({ noticeContent: e.detail.value })
  },

  getNoticeTemplate(type, companyName = '贵企业') {
    const templates = {
      expiry: {
        title: '压力表到期整改提醒',
        content: `${companyName}：请及时核查逾期和即将到期的压力表，按要求安排停用、送检或更新台账。`
      },
      material: {
        title: '企业资料补充提醒',
        content: `${companyName}：请核对企业、设备及压力表档案，并尽快补充缺失或不完整的资料。`
      },
      inspection: {
        title: '现场检查事项提醒',
        content: `${companyName}：请提前核对压力表使用状态和检定资料，做好现场检查准备。`
      },
      general: {
        title: '监管事项提醒',
        content: `${companyName}：请及时查看并处理本次监管提醒事项。`
      }
    }
    return templates[type] || templates.general
  },

  async submitEnterpriseNotice() {
    const target = this.data.noticeTarget
    const title = String(this.data.noticeTitle || '').trim()
    const content = String(this.data.noticeContent || '').trim()
    if (!target?._id || this.data.sendingNotice) return
    if (!title) return wx.showToast({ title: '请输入提醒标题', icon: 'none' })
    if (!content) return wx.showToast({ title: '请输入提醒内容', icon: 'none' })

    this.setData({ sendingNotice: true })
    try {
      const result = await expiryReminderService.sendEnterpriseNotice({
        enterpriseId: target._id,
        type: this.data.noticeType,
        priority: this.data.noticePriority,
        title,
        content,
        dueDate: this.data.noticeDeadline
      })
      if (!result?.success) throw new Error(result?.error || '发送提醒失败')
      this.setData({ noticeEditorVisible: false, noticeTarget: null })
      wx.showToast({ title: '提醒已发送', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '发送提醒失败', icon: 'none' })
    } finally {
      this.setData({ sendingNotice: false })
    }
  },

  async loadRiskEnterprises() {
    const adminUser = wx.getStorageSync('adminUser') || {}
    const district = adminUser.role === 'district' ? adminUser.district || '' : ''

    try {
      const result = await expiryReminderService.getExpiringSummary(30, district)
      if (!result?.success) throw new Error('风险企业加载失败')

      const list = result.data?.enterpriseStats || []
      wx.setStorageSync('dashboardRiskEnterprises', list)
      return list
    } catch (error) {
      return wx.getStorageSync('dashboardRiskEnterprises') || []
    }
  },

  formatDateTime(dateInput) {
    if (!dateInput) return '-'

    let date
    if (typeof dateInput === 'string') {
      date = new Date(dateInput)
    } else if (dateInput instanceof Date) {
      date = dateInput
    } else if (dateInput.$date) {
      date = new Date(dateInput.$date)
    } else {
      return '-'
    }

    if (Number.isNaN(date.getTime())) return '-'

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  },

  getDefaultDeadline(priority) {
    const date = new Date()
    date.setDate(date.getDate() + (priority === 'urgent' ? 3 : priority === 'important' ? 7 : 14))
    return this.formatDate(date)
  },

  previewEnterprise(e) {
    const name = e.currentTarget.dataset.name
    const status = e.currentTarget.dataset.status
    if (!name) return
    if (status && status !== 'approved') {
      wx.showToast({ title: status === 'pending' ? TEXT.pending : TEXT.rejected, icon: 'none' })
      return
    }

    wx.navigateTo({
      url: `/pages/admin/admin?view=equipments&enterprise=${encodeURIComponent(name)}&from=dashboard&filter=${this.data.mode === 'risk' ? 'risk' : 'expiry'}`
    })
  }
})
