const { DISTRICTS } = require('../../constants/index')
const authService = require('../../services/auth-service')
const { storage } = require('../../utils/index')

function emptyEditor() {
  return { _id: '', username: '', district: '', districtIndex: -1, password: '' }
}

Page({
  data: {
    accounts: [],
    filteredAccounts: [],
    keyword: '',
    loading: true,
    saving: false,
    showEditor: false,
    editorMode: 'create',
    editorForm: emptyEditor(),
    districtOptions: [...DISTRICTS]
  },

  onLoad() {
    const admin = storage.getAdminUser()
    if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
      wx.showToast({ title: '仅总管理员可以访问', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.loadAccounts()
  },

  async loadAccounts() {
    this.setData({ loading: true })
    try {
      const result = await authService.listDistrictAdmins()
      const accounts = (result.accounts || []).map((item) => ({
        ...item,
        initial: String(item.username || 'A').slice(0, 1).toUpperCase(),
        lastLoginLabel: this.formatDateTime(item.lastLoginTime)
      }))
      this.setData({ accounts }, () => this.applyFilter())
    } catch (error) {
      wx.showToast({ title: error.message || '账号加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onSearchInput(event) {
    this.setData({ keyword: event.detail.value || '' }, () => this.applyFilter())
  },

  applyFilter() {
    const keyword = String(this.data.keyword || '').trim().toLowerCase()
    const filteredAccounts = keyword
      ? this.data.accounts.filter((item) => `${item.username} ${item.district}`.toLowerCase().includes(keyword))
      : this.data.accounts
    this.setData({ filteredAccounts })
  },

  openCreate() {
    this.setData({ showEditor: true, editorMode: 'create', editorForm: emptyEditor() })
  },

  openEdit(event) {
    const account = this.data.accounts.find((item) => item._id === event.currentTarget.dataset.id)
    if (!account) return
    this.setData({
      showEditor: true,
      editorMode: 'edit',
      editorForm: {
        _id: account._id,
        username: account.username,
        district: account.district,
        districtIndex: this.data.districtOptions.indexOf(account.district),
        password: ''
      }
    })
  },

  closeEditor() {
    if (this.data.saving) return
    this.setData({ showEditor: false, editorForm: emptyEditor() })
  },

  onEditorInput(event) {
    const field = event.currentTarget.dataset.field
    if (!field) return
    this.setData({ [`editorForm.${field}`]: event.detail.value || '' })
  },

  onDistrictChange(event) {
    const districtIndex = Number(event.detail.value)
    this.setData({
      'editorForm.districtIndex': districtIndex,
      'editorForm.district': this.data.districtOptions[districtIndex] || ''
    })
  },

  async saveAccount() {
    if (this.data.saving) return
    const form = this.data.editorForm
    const username = String(form.username || '').trim()
    const district = String(form.district || '').trim()
    const password = String(form.password || '')

    if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
      return wx.showToast({ title: '请输入正确的用户名', icon: 'none' })
    }
    if (!district) return wx.showToast({ title: '请选择管理辖区', icon: 'none' })
    if (this.data.editorMode === 'create' && !password) {
      return wx.showToast({ title: '请设置初始密码', icon: 'none' })
    }
    if (password && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      return wx.showToast({ title: '密码至少 8 位并包含字母和数字', icon: 'none' })
    }

    this.setData({ saving: true })
    try {
      if (this.data.editorMode === 'create') {
        await authService.createDistrictAdmin({ username, district, password })
      } else {
        await authService.updateDistrictAdmin(form._id, { username, district, password })
      }
      this.setData({ showEditor: false, editorForm: emptyEditor() })
      wx.showToast({ title: this.data.editorMode === 'create' ? '账号已创建' : '账号已更新', icon: 'success' })
      await this.loadAccounts()
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  confirmDelete(event) {
    const account = this.data.accounts.find((item) => item._id === event.currentTarget.dataset.id)
    if (!account) return
    wx.showModal({
      title: '删除辖区账号',
      content: `确认删除“${account.username}”吗？删除后该账号将立即无法登录，且不能恢复。`,
      confirmText: '删除',
      confirmColor: '#d92d20',
      success: async (result) => {
        if (!result.confirm) return
        try {
          await authService.deleteDistrictAdmin(account._id)
          const accounts = this.data.accounts.filter((item) => item._id !== account._id)
          this.setData({ accounts }, () => this.applyFilter())
          wx.showToast({ title: '账号已删除', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' })
        }
      }
    })
  },

  formatDateTime(value) {
    if (!value) return '暂无登录记录'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '暂无登录记录'
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },

  noop() {}
})
