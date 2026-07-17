const expiryReminderService = require('../../services/expiry-reminder-service')

const STATUS_TEXT = {
  pending: '待处理',
  rectifying: '整改中',
  pending_review: '待监管复核',
  returned: '已退回修改',
  closed: '已关闭',
  acknowledged: '已确认'
}

Page({
  data: {
    loading: true,
    noticeId: '',
    adminMode: false,
    task: null,
    response: '',
    evidenceFileIds: [],
    reviewComment: '',
    submitting: false,
    statusText: ''
  },

  onLoad(options) {
    this.setData({
      noticeId: options.id || '',
      adminMode: options.role === 'admin'
    })
    this.loadTask()
  },

  onPullDownRefresh() {
    this.loadTask().finally(() => wx.stopPullDownRefresh())
  },

  async loadTask() {
    if (!this.data.noticeId) return
    this.setData({ loading: true })
    try {
      const result = await expiryReminderService.getRectificationTask(this.data.noticeId)
      if (!result?.success) throw new Error(result?.error || '获取整改任务失败')
      const task = result.data?.task
      this.setData({
        task,
        response: task?.rectificationResponse || '',
        evidenceFileIds: task?.evidenceFileIds || [],
        reviewComment: task?.reviewComment || '',
        statusText: STATUS_TEXT[task?.taskStatus] || '待处理'
      })
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onResponseInput(e) {
    this.setData({ response: e.detail.value })
  },

  onReviewCommentInput(e) {
    this.setData({ reviewComment: e.detail.value })
  },

  async chooseEvidence() {
    const remaining = 6 - this.data.evidenceFileIds.length
    if (remaining <= 0) return wx.showToast({ title: '最多上传 6 张图片', icon: 'none' })
    try {
      const result = await wx.chooseMedia({ count: remaining, mediaType: ['image'], sourceType: ['album', 'camera'] })
      wx.showLoading({ title: '上传中...', mask: true })
      const uploaded = []
      for (const file of result.tempFiles || []) {
        const suffix = String(file.tempFilePath || '').split('.').pop() || 'jpg'
        const cloudPath = `rectification/${this.data.noticeId}/${Date.now()}-${uploaded.length}.${suffix}`
        const upload = await wx.cloud.uploadFile({ cloudPath, filePath: file.tempFilePath })
        if (upload.fileID) uploaded.push(upload.fileID)
      }
      this.setData({ evidenceFileIds: [...this.data.evidenceFileIds, ...uploaded].slice(0, 6) })
    } catch (error) {
      if (!String(error.errMsg || '').includes('cancel')) wx.showToast({ title: '图片上传失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  removeEvidence(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ evidenceFileIds: this.data.evidenceFileIds.filter((_, itemIndex) => itemIndex !== index) })
  },

  previewEvidence(e) {
    const current = e.currentTarget.dataset.file
    wx.previewImage({ current, urls: this.data.evidenceFileIds })
  },

  async submitRectification() {
    const response = String(this.data.response || '').trim()
    if (!response) return wx.showToast({ title: '请填写整改说明', icon: 'none' })
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const result = await expiryReminderService.submitRectification(
        this.data.noticeId,
        response,
        this.data.evidenceFileIds
      )
      if (!result?.success) throw new Error(result?.error || '提交失败')
      wx.showToast({ title: '已提交复核', icon: 'success' })
      await this.loadTask()
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  approveTask() {
    this.reviewTask('approved')
  },

  returnTask() {
    this.reviewTask('returned')
  },

  async reviewTask(decision) {
    const comment = String(this.data.reviewComment || '').trim()
    if (decision === 'returned' && !comment) return wx.showToast({ title: '请填写退回原因', icon: 'none' })
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const result = await expiryReminderService.reviewRectification(this.data.noticeId, decision, comment)
      if (!result?.success) throw new Error(result?.error || '复核失败')
      wx.showToast({ title: decision === 'approved' ? '已关闭任务' : '已退回企业', icon: 'success' })
      await this.loadTask()
    } catch (error) {
      wx.showToast({ title: error.message || '复核失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
