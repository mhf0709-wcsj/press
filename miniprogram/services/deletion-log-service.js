const db = wx.cloud.database()

const ALL_ENTERPRISES = '全部企业'
const ALL_DISTRICTS = '全部辖区'

class DeletionLogService {
  async loadLogs(options = {}) {
    const {
      enterpriseName = '',
      district = '',
      keyword = ''
    } = options

    const whereCondition = {}
    if (enterpriseName && enterpriseName !== ALL_ENTERPRISES) {
      whereCondition.enterpriseName = enterpriseName
    }
    if (district && district !== ALL_DISTRICTS) {
      whereCondition.district = district
    }

    let logs = []
    try {
      let query = db.collection('deletion_logs')
      if (Object.keys(whereCondition).length) {
        query = query.where(whereCondition)
      }

      const res = await query
        .orderBy('deletedAt', 'desc')
        .limit(100)
        .get()

      logs = res.data || []
    } catch (error) {
      logs = await this.loadFromLifecycleLogs(whereCondition)
    }

    if (!keyword || !keyword.trim()) return logs

    const normalized = keyword.trim().toLowerCase()
    return logs.filter((item) => {
      const fields = [
        item.entityName,
        item.factoryNo,
        item.deviceNo,
        item.equipmentName,
        item.equipmentNo,
        item.enterpriseName,
        item.deletedBy
      ]
      return fields.some((value) => String(value || '').toLowerCase().includes(normalized))
    })
  }

  async loadFromLifecycleLogs(whereCondition = {}) {
    const logRes = await db.collection('lifecycle_logs')
      .where({ action: '删除' })
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get()

    const logs = (logRes.data || []).map((item) => ({
      _id: item._id,
      entityType: 'device',
      entityId: item.deviceId,
      entityName: item.remark || '压力表删除记录',
      enterpriseName: item.operator || '',
      district: '',
      equipmentName: '',
      factoryNo: '',
      deviceNo: '',
      relatedRecordCount: '',
      deletedAt: item.createTime || item.timestamp || '',
      deletedBy: item.operator || '',
      deletedById: item.operatorId || ''
    }))

    return logs.filter((item) => {
      if (whereCondition.enterpriseName && item.enterpriseName !== whereCondition.enterpriseName) return false
      if (whereCondition.district && item.district !== whereCondition.district) return false
      return true
    })
  }
}

module.exports = new DeletionLogService()
