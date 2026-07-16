const { storage } = require('../utils/index')

async function callAuth(action, data = {}) {
  const response = await wx.cloud.callFunction({
    name: 'enterpriseAuth',
    data: { action, ...data }
  })
  const result = response.result || {}
  if (!result.success) throw new Error(result.error || '身份验证失败')
  return result
}

module.exports = {
  async wechatLogin() {
    return callAuth('wechatLogin')
  },

  async bindEnterprise(payload) {
    return callAuth('bindEnterprise', payload)
  },

  async updateEnterpriseProfile(payload) {
    return callAuth('updateEnterpriseProfile', payload)
  },

  async adminLogin(username, password) {
    const result = await callAuth('adminLogin', { username, password })
    const admin = { ...result.admin, token: result.token }
    storage.setAdminUser(admin)
    return admin
  },

  async validateAdminSession() {
    const admin = storage.getAdminUser()
    if (!admin?.token) return false
    try {
      const result = await callAuth('validateAdminSession', { token: admin.token })
      storage.setAdminUser({ ...result.admin, token: admin.token })
      return true
    } catch (error) {
      storage.remove('adminUser')
      return false
    }
  },

  async changeAdminPassword(oldPassword, newPassword, username = '') {
    const admin = storage.getAdminUser()
    return callAuth('changeAdminPassword', {
      token: admin?.token || '',
      username,
      oldPassword,
      newPassword
    })
  },

  async reviewEnterprise(enterpriseId, decision, reason = '') {
    const admin = storage.getAdminUser()
    return callAuth('reviewEnterprise', {
      adminToken: admin?.token || '',
      enterpriseId,
      decision,
      reason
    })
  },

  async listDistrictAdmins() {
    const admin = storage.getAdminUser()
    return callAuth('listDistrictAdmins', { adminToken: admin?.token || '' })
  },

  async createDistrictAdmin(payload) {
    const admin = storage.getAdminUser()
    return callAuth('createDistrictAdmin', { adminToken: admin?.token || '', ...payload })
  },

  async updateDistrictAdmin(accountId, payload) {
    const admin = storage.getAdminUser()
    return callAuth('updateDistrictAdmin', { adminToken: admin?.token || '', accountId, ...payload })
  },

  async deleteDistrictAdmin(accountId) {
    const admin = storage.getAdminUser()
    return callAuth('deleteDistrictAdmin', { adminToken: admin?.token || '', accountId })
  },

  async adminLogout() {
    const admin = storage.getAdminUser()
    try {
      if (admin?.token) await callAuth('adminLogout', { token: admin.token })
    } finally {
      storage.remove('adminUser')
    }
  }
}
