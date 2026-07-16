const expiryReminderService = require('../../services/expiry-reminder-service')

const STATUS_META = {
  unread: { text: '未读', className: 'unread' },
  deferred: { text: '稍后处理', className: 'deferred' },
  read: { text: '已读', className: 'read' }
}

Page({
  data: {
    loading: true,
    statusFilter: '',
    notices: [],
    summary: { total: 0, unread: 0, deferred: 0, read: 0 },
    filters: [
      { key: '', label: '全部' },
      { key: 'unread', label: '未读' },
      { key: 'deferred', label: '稍后处理' },
      { key: 'read', label: '已读' }
    ]
  },

  onLoad() {
    this.loadNotices()
  },

  onPullDownRefresh() {
    this.loadNotices().finally(() => wx.stopPullDownRefresh())
  },

  changeFilter(e) {
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
        const status = STATUS_META[item.status] || STATUS_META.unread
        return {
          ...item,
          statusText: status.text,
          statusClass: status.className,
          createdAtText: this.formatDateTime(item.createdAt),
          readAtText: this.formatDateTime(item.readAt),
          priorityText: item.priority === 'urgent' ? '紧急' : item.priority === 'important' ? '重要' : '普通'
        }
      })
      this.setData({
        notices,
        summary: result.data?.summary || { total: 0, unread: 0, deferred: 0, read: 0 }
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  openEnterprise(e) {
    const enterpriseName = e.currentTarget.dataset.enterprise
    if (!enterpriseName) return
    wx.navigateTo({
      url: `/pages/admin/admin?view=equipments&enterprise=${encodeURIComponent(enterpriseName)}&from=notices`
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
