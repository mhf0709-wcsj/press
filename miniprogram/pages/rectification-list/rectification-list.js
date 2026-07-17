const expiryReminderService = require('../../services/expiry-reminder-service')

const STATUS_META = {
  pending: { text: '待处理', className: 'pending' },
  rectifying: { text: '整改中', className: 'rectifying' },
  pending_review: { text: '待复核', className: 'review' },
  returned: { text: '已退回', className: 'returned' },
  closed: { text: '已关闭', className: 'closed' },
  acknowledged: { text: '已确认', className: 'closed' }
}

Page({
  data: {
    loading: true,
    statusFilter: '',
    tasks: [],
    filters: [
      { key: '', label: '全部' },
      { key: 'pending', label: '待处理' },
      { key: 'pending_review', label: '待复核' },
      { key: 'returned', label: '已退回' },
      { key: 'closed', label: '已关闭' }
    ]
  },

  onLoad() {
    this.loadTasks()
  },

  onShow() {
    if (this.loadedOnce) this.loadTasks()
    this.loadedOnce = true
  },

  onPullDownRefresh() {
    this.loadTasks().finally(() => wx.stopPullDownRefresh())
  },

  changeFilter(e) {
    const statusFilter = e.currentTarget.dataset.status || ''
    if (statusFilter === this.data.statusFilter) return
    this.setData({ statusFilter }, () => this.loadTasks())
  },

  async loadTasks() {
    this.setData({ loading: true })
    try {
      const result = await expiryReminderService.listEnterpriseRectificationTasks(this.data.statusFilter)
      if (!result?.success) throw new Error(result?.error || '获取整改任务失败')
      const tasks = (result.data?.notices || []).map((item) => ({
        ...item,
        statusText: (STATUS_META[item.taskStatus] || STATUS_META.pending).text,
        statusClass: (STATUS_META[item.taskStatus] || STATUS_META.pending).className
      }))
      this.setData({ tasks })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  openTask(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/rectification-detail/rectification-detail?id=${id}` })
  }
})
