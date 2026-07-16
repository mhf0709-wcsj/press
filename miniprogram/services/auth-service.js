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

  async adminLogout() {
    const admin = storage.getAdminUser()
    try {
      if (admin?.token) await callAuth('adminLogout', { token: admin.token })
    } finally {
      storage.remove('adminUser')
    }
  }
}
