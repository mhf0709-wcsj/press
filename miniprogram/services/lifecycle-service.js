const dataAccess = require('./data-access-service')

class LifecycleService {
  async logEvent(params) {
    const result = await dataAccess.request('logLifecycle', { data: params })
    return result.id
  }

  async getDeviceLogs(deviceId) {
    return dataAccess.list('lifecycle_logs', {
      filters: { deviceId },
      orderBy: { field: 'timestamp', direction: 'desc' },
      limit: 100
    })
  }
}

module.exports = new LifecycleService()
