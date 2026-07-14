const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DISTRICT_NAME_MAP = {
  '\u5927\u5cf3\u6240': '\u5927\u5cc3\u6240',
  '\u5927\u5cef\u6240': '\u5927\u5cc3\u6240',
  '\u5927\u5ce8\u6240': '\u5927\u5cc3\u6240',
  '\u5cf3\u53e3\u6240': '\u5cc3\u53e3\u6240',
  '\u5cef\u53e3\u6240': '\u5cc3\u53e3\u6240',
  '\u5ce3\u53e3\u6240': '\u5cc3\u53e3\u6240',
  '\u767e\u4e08\u9645\u6240': '\u767e\u4e08\u6f08\u6240',
  '\u767e\u4e08\u6f88\u6240': '\u767e\u4e08\u6f08\u6240'
}

const TARGET_COLLECTIONS = [
  'admins',
  'enterprises',
  'equipments',
  'devices',
  'pressure_records',
  'deletion_logs'
]

exports.main = async (event = {}) => {
  if (!process.env.MAINTENANCE_SECRET || event.maintenanceSecret !== process.env.MAINTENANCE_SECRET) {
    return { success: false, message: 'Unauthorized.' }
  }
  const action = event.action || 'normalizeDistrictNames'

  if (action === 'normalizeDistrictNames') {
    return normalizeDistrictNames(Boolean(event.dryRun))
  }

  return {
    success: false,
    message: 'Unsupported action.'
  }
}

async function normalizeDistrictNames(dryRun = false) {
  const oldNames = Object.keys(DISTRICT_NAME_MAP)
  const result = {
    success: true,
    action: 'normalizeDistrictNames',
    dryRun,
    env: cloud.DYNAMIC_CURRENT_ENV,
    totalMatched: 0,
    totalUpdated: 0,
    collections: []
  }

  for (const collectionName of TARGET_COLLECTIONS) {
    const summary = await normalizeCollectionDistricts(collectionName, oldNames, dryRun)
    result.collections.push(summary)
    result.totalMatched += summary.matchedCount
    result.totalUpdated += summary.updatedCount
  }

  result.message = dryRun
    ? `Dry run completed. Matched ${result.totalMatched} records.`
    : `District cleanup completed. Updated ${result.totalUpdated} records.`

  return result
}

async function normalizeCollectionDistricts(collectionName, oldNames, dryRun) {
  const summary = {
    collection: collectionName,
    matchedCount: 0,
    updatedCount: 0,
    samples: [],
    skipped: false
  }

  try {
    let hasMore = true
    let lastId = ''

    while (hasMore) {
      const whereCondition = lastId
        ? {
            district: _.in(oldNames),
            _id: _.gt(lastId)
          }
        : {
            district: _.in(oldNames)
          }

      const res = await db.collection(collectionName)
        .where(whereCondition)
        .orderBy('_id', 'asc')
        .limit(100)
        .get()

      const list = res.data || []
      if (!list.length) break

      summary.matchedCount += list.length
      lastId = list[list.length - 1]._id
      hasMore = list.length === 100

      for (const item of list) {
        const oldDistrict = item.district
        const newDistrict = DISTRICT_NAME_MAP[oldDistrict]

        if (!newDistrict || newDistrict === oldDistrict) continue

        if (summary.samples.length < 10) {
          summary.samples.push({
            id: item._id,
            from: oldDistrict,
            to: newDistrict
          })
        }

        if (dryRun) continue

        await db.collection(collectionName).doc(item._id).update({
          data: {
            district: newDistrict,
            updateTime: new Date()
          }
        })

        summary.updatedCount += 1
      }
    }
  } catch (error) {
    summary.skipped = true
    summary.error = error.message || String(error)
  }

  return summary
}
