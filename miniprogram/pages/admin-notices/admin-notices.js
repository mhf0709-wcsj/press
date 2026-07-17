const expiryReminderService = require('../../services/expiry-reminder-service')

const STATUS_META = {
  pending: { text: '待处理', className: 'unread' },
  rectifying: { text: '整改中', className: 'deferred' },
  pending_review: { text: '待复核', className: 'unread' },
  returned: { text: '已退回', className: 'deferred' },
  closed: { text: '已关闭', className: 'read' },
  acknowledged: { text: '已确认', className: 'read' }
}

Page({
  data: {
    loading: true,
    statusFilter: '',
    notices: [],
    summary: { total: 0, pending: 0, pending_review: 0, returned: 0, closed: 0, overdue: 0 },
    filters: [
      { key: '', label: '全部' },
      { key: 'pending', label: '待处理' },
      { key: 'pending_review', label: '待复核' },
      { key: 'overdue', label: '逾期整改' },
      { key: 'returned', label: '已退回' },
      { key: 'closed', label: '已关闭' }
    ]
  },

  onLoad(options = {}) {
    const allowed = this.data.filters.map((item) => item.key)
    const statusFilter = allowed.includes(options.status) ? options.status : ''
    this.setData({ statusFilter }, () => this.loadNotices())
  },

  onPullDownRefresh() {
    this.loadNotices().finally(() => wx.stopPullDownRefresh())
  },

  changeFilter(e) {
    const statusFilter = e.currentTarget.dataset.status
    if (statusFilter === this.data.statusFilter) return
    this.setData({ statusFilter }, () => this.loadNotices())
  },

  selectSummaryFilter(e) {
    const statusFilter = e.currentTarget.dataset.status
    if (statusFilter === this.data.statusFilter) return
    this.setData({ statusFilter }, () => this.loadNotices())
  },

  async loadNotices() {
    this.setData({ loading: true })
    try {
      const result = await expiryReminderService.listAdminNotices(this.data.statusFilter, 100)
      if (!result?.success) throw new Error(result?.error || '获取提醒记录失败')
      const notices = (result.data?.notices || []).map((item) => {
        const status = STATUS_META[item.taskStatus] || STATUS_META.pending
        return {
          ...item,
          statusText: status.text,
          statusClass: status.className,
          createdAtText: this.formatDateTime(item.createdAt),
          readAtText: this.formatDateTime(item.readAt),
          dueDateText: item.dueDate || '未设置',
          priorityText: item.priority === 'urgent' ? '紧急' : item.priority === 'important' ? '重要' : '普通'
        }
      })
      this.setData({
        notices,
        summary: result.data?.summary || { total: 0, pending: 0, pending_review: 0, returned: 0, closed: 0, overdue: 0 }
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  openTask(e) {
    const noticeId = e.currentTarget.dataset.id
    if (!noticeId) return
    wx.navigateTo({
      url: `/pages/rectification-detail/rectification-detail?id=${noticeId}&role=admin`
    })
  },

  goSendNotice() {
    wx.navigateTo({
      url: '/pages/enterprise-list/enterprise-list?status=all'
    })
  },

  formatDateTime(input) {
    if (!input) return ''
    const date = new Date(input?.$date || input)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
})
