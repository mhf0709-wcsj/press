const { storage } = require('../utils/index')

async function request(action, payload = {}) {
  const admin = storage.getAdminUser()
  const response = await wx.cloud.callFunction({
    name: 'dataAccess',
    data: {
      action,
      adminToken: admin?.token || '',
      ...payload
    }
  })
  const result = response.result || {}
  if (!result.success) {
    if (/登录已失效/.test(result.error || '')) storage.remove('adminUser')
    throw new Error(result.error || '数据请求失败')
  }
  return result
}

module.exports = {
  request,
  async list(resource, options = {}) {
    const result = await request('list', { resource, ...options })
    return result.list || []
  },
  async count(resource, filters = {}) {
    const result = await request('count', { resource, filters })
    return Number(result.total || 0)
  },
  async get(resource, id) {
    const result = await request('get', { resource, id })
    return result.data || null
  },
  async create(resource, data) {
    const result = await request('create', { resource, data })
    return result.data
  },
  async update(resource, id, data) {
    return request('update', { resource, id, data })
  },
  async softDelete(resource, id) {
    return request('softDelete', { resource, id })
  }
}
