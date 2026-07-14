const dataAccess = require('./data-access-service')

class DeletionLogService {
  async loadLogs(options = {}) {
    const filters = {}
    if (options.enterpriseName && options.enterpriseName !== '全部企业') filters.enterpriseName = options.enterpriseName
    if (options.district && options.district !== '全部辖区') filters.district = options.district
    const list = await dataAccess.list('deletion_logs', {
      filters,
      keyword: options.keyword || '',
      keywordFields: ['entityName', 'factoryNo', 'deviceNo', 'equipmentName', 'equipmentNo', 'enterpriseName', 'deletedBy'],
      skip: Math.max(0, Number(options.skip || 0)),
      limit: Math.min(100, Math.max(1, Number(options.limit || 30))),
      orderBy: { field: 'deletedAt', direction: 'desc' }
    })
    list.sourceCount = list.length
    return list
  }
}

module.exports = new DeletionLogService()
