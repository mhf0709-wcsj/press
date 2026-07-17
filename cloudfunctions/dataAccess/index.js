const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const RESOURCES = {
  enterprises: {
    collection: 'enterprises',
    enterpriseField: 'companyName',
    adminOnly: true,
    readFields: [
      'companyName', 'creditCode', 'legalPerson', 'phone', 'district', 'authType',
      'approvalStatus', 'submittedAt', 'reviewedAt', 'reviewedBy', 'reviewReason',
      'bindingReviewRequired', 'bindingRequestType', 'bindingRequestedAt',
      'bindingPreviousApprovalStatus', 'bindingReviewDecision', 'bindingReviewedAt', 'bindingReviewedBy',
      'createTime', 'updateTime', 'lastLoginTime'
    ]
  },
  equipments: {
    collection: 'equipments',
    enterpriseField: 'enterpriseName',
    fields: ['equipmentNo', 'equipmentName', 'district', 'location', 'gaugeCount', 'isDeleted', 'deletedAt', 'deletedBy', 'deletedById']
  },
  devices: {
    collection: 'devices',
    enterpriseField: 'enterpriseName',
    fields: ['deviceNo', 'deviceName', 'deviceType', 'district', 'factoryNo', 'equipmentId', 'equipmentName', 'status', 'manufacturer', 'modelSpec', 'installLocation', 'recordCount', 'latestRecordId', 'latestVerificationDate', 'latestExpiryDate', 'latestConclusion', 'isDeleted', 'deletedAt', 'deletedBy', 'deletedById']
  },
  pressure_records: {
    collection: 'pressure_records',
    enterpriseField: 'enterpriseName',
    fields: ['certNo', 'factoryNo', 'sendUnit', 'instrumentName', 'modelSpec', 'manufacturer', 'verificationStd', 'verificationBasis', 'conclusion', 'verificationDate', 'expiryDate', 'district', 'status', 'gaugeStatus', 'ocrSource', 'hasImage', 'hasInstallPhoto', 'fileID', 'installPhotoFileID', 'equipmentId', 'equipmentName', 'deviceId', 'deviceName', 'deviceNo', 'deviceStatus', 'enterprisePhone', 'enterpriseLegalPerson', 'createdBy', 'isDeleted', 'deletedAt', 'deletedBy', 'deletedById']
  },
  deletion_logs: {
    collection: 'deletion_logs',
    enterpriseField: 'enterpriseName',
    adminOnly: true
  },
  operation_logs: {
    collection: 'operation_logs',
    enterpriseField: 'enterpriseName',
    adminOnly: true
  },
  lifecycle_logs: {
    collection: 'lifecycle_logs',
    enterpriseField: 'enterpriseName'
  },
  enterprise_alert_settings: {
    collection: 'enterprise_alert_settings',
    enterpriseField: 'enterpriseName',
    fields: ['enabled', 'days', 'subscribeMessage', 'templateId']
  }
}

exports.main = async (event = {}) => {
  try {
    const actor = await resolveActor(event)
    const handlers = {
      list: handleList,
      count: handleCount,
      get: handleGet,
      getEquipmentBundle: handleGetEquipmentBundle,
      create: handleCreate,
      update: handleUpdate,
      softDelete: handleSoftDelete,
      logLifecycle: handleLogLifecycle,
      getDataVersion: handleGetDataVersion,
      getEnterpriseDashboard: handleEnterpriseDashboard,
      getAdminDashboardStats: handleAdminDashboardStats
    }
    const handler = handlers[event.action]
    if (!handler) throw new Error('不支持的数据操作')
    return { success: true, ...(await handler(event, actor)) }
  } catch (error) {
    return { success: false, error: error.message || '数据服务异常' }
  }
}

async function resolveActor(event) {
  if (event.adminToken) return resolveAdmin(event.adminToken)

  const openid = cloud.getWXContext().OPENID
  if (!openid) throw new Error('登录状态无效')
  const res = await db.collection('enterprises').where({ openid }).limit(1).get()
  const enterprise = res.data?.[0]
  if (!enterprise) throw new Error('企业账号尚未绑定')
  const approvalStatus = normalizeApprovalStatus(enterprise)
  if (approvalStatus === 'pending') throw new Error('企业账号正在审核中')
  if (approvalStatus === 'rejected') throw new Error('企业账号审核未通过')
  return {
    type: 'enterprise',
    id: enterprise._id,
    companyName: enterprise.companyName || '',
    district: enterprise.district || '',
    phone: enterprise.phone || '',
    legalPerson: enterprise.legalPerson || ''
  }
}

async function resolveAdmin(token) {
  const tokenHash = crypto.createHash('sha256').update(String(token || '')).digest('hex')
  const sessionRes = await db.collection('auth_sessions').where({ tokenHash }).limit(1).get()
  const session = sessionRes.data?.[0]
  const expiresAt = toDate(session?.expiresAt)
  if (!session || !expiresAt || expiresAt.getTime() <= Date.now()) throw new Error('管理端登录已失效')

  const currentOpenid = cloud.getWXContext().OPENID || ''
  if (session.openid && currentOpenid && session.openid !== currentOpenid) throw new Error('管理端会话与当前微信账号不匹配')
  return {
    type: 'admin',
    id: session.adminId,
    username: session.username,
    role: session.role || 'admin',
    district: session.district || ''
  }
}

function getResource(name, actor) {
  const resource = RESOURCES[name]
  if (!resource) throw new Error('不允许访问该数据集合')
  if (resource.adminOnly && actor.type !== 'admin') throw new Error('无权访问该数据')
  return resource
}

async function handleList(event, actor) {
  const resource = getResource(event.resource, actor)
  const filters = buildFilters(resource, actor, event.filters || {})
  let query = db.collection(resource.collection)
  if (Object.keys(filters).length) query = query.where(filters)

  const orderBy = normalizeOrderBy(event.orderBy)
  if (orderBy) query = query.orderBy(orderBy.field, orderBy.direction)
  const skip = Math.max(0, Number(event.skip || 0))
  const limit = Math.min(100, Math.max(1, Number(event.limit || 50)))
  const res = await query.skip(skip).limit(limit).get()
  let list = res.data || []

  const keyword = clean(event.keyword).toLowerCase()
  const keywordFields = Array.isArray(event.keywordFields) ? event.keywordFields.slice(0, 8) : []
  if (keyword && keywordFields.length) {
    list = list.filter((item) => keywordFields.some((field) => clean(item[field]).toLowerCase().includes(keyword)))
  }
  return { list: list.map((item) => sanitizeRead(item, resource, actor)) }
}

async function handleCount(event, actor) {
  const resource = getResource(event.resource, actor)
  const filters = buildFilters(resource, actor, event.filters || {})
  const res = await db.collection(resource.collection).where(filters).count()
  return { total: Number(res.total || 0) }
}

async function handleGet(event, actor) {
  const resource = getResource(event.resource, actor)
  const item = await getDocument(resource, event.id)
  assertDocumentAccess(item, resource, actor)
  return { data: sanitizeRead(item, resource, actor) }
}

async function handleGetEquipmentBundle(event, actor) {
  const equipmentResource = getResource('equipments', actor)
  const equipment = await getDocument(equipmentResource, event.id)
  assertDocumentAccess(equipment, equipmentResource, actor)
  if (equipment.isDeleted) throw new Error('设备已删除')

  const [devices, records] = await Promise.all([
    fetchAll('devices', buildFilters(RESOURCES.devices, actor, {
      equipmentId: event.id,
      isDeleted: false
    }), { maxRecords: 20000 }),
    fetchAll('pressure_records', buildFilters(RESOURCES.pressure_records, actor, {
      equipmentId: event.id,
      isDeleted: false
    }), { maxRecords: 20000 })
  ])

  return {
    equipment: sanitizeRead(equipment, equipmentResource, actor),
    devices: devices.map((item) => sanitizeRead(item, RESOURCES.devices, actor)),
    records: records.map((item) => sanitizeRead(item, RESOURCES.pressure_records, actor))
  }
}

async function handleCreate(event, actor) {
  const resource = getResource(event.resource, actor)
  if (!resource.fields) throw new Error('该数据不允许新建')
  const now = new Date()
  const data = pickFields(event.data || {}, resource.fields)
  applyOwnership(data, resource, actor, event.data || {})
  data.createTime = event.data?.createTime || now
  data.updateTime = now
  if ('isDeleted' in data || ['equipments', 'devices', 'pressure_records'].includes(event.resource)) data.isDeleted = false

  if (event.resource === 'devices') await validateEquipmentBinding(data, actor)
  if (event.resource === 'pressure_records') await validateRecordBinding(data, actor)

  await ensureCollection('operation_logs')
  const res = await db.collection(resource.collection).add({ data })
  if (event.resource === 'devices' && data.equipmentId) await syncGaugeCount(data.equipmentId)
  if (event.resource === 'pressure_records' && data.deviceId) await syncDeviceSnapshot(data.deviceId)
  const created = { _id: res._id, ...data }
  await writeOperationLog({ event, actor, operation: 'create', entityId: res._id, before: null, after: created })
  return { data: created }
}

async function handleUpdate(event, actor) {
  const resource = getResource(event.resource, actor)
  if (!resource.fields) throw new Error('该数据不允许修改')
  const current = await getDocument(resource, event.id)
  assertDocumentAccess(current, resource, actor)
  const data = pickFields(event.data || {}, resource.fields)
  delete data.isDeleted
  delete data.deletedAt
  delete data.deletedBy
  delete data.deletedById
  data.updateTime = new Date()

  if (event.resource === 'devices' && data.equipmentId && data.equipmentId !== current.equipmentId) {
    await validateEquipmentBinding({ ...current, ...data }, actor)
  }
  await ensureCollection('operation_logs')
  await db.collection(resource.collection).doc(event.id).update({ data })

  if (event.resource === 'devices' && data.equipmentId !== undefined && data.equipmentId !== current.equipmentId) {
    if (current.equipmentId) await syncGaugeCount(current.equipmentId)
    if (data.equipmentId) await syncGaugeCount(data.equipmentId)
  }
  if (event.resource === 'pressure_records' && current.deviceId) await syncDeviceSnapshot(current.deviceId)
  await writeOperationLog({
    event,
    actor,
    operation: 'update',
    entityId: event.id,
    before: current,
    after: { ...current, ...data }
  })
  return { updated: true }
}

async function handleSoftDelete(event, actor) {
  if (!['devices', 'equipments', 'pressure_records'].includes(event.resource)) throw new Error('该数据不允许删除')
  const resource = getResource(event.resource, actor)
  const current = await getDocument(resource, event.id)
  assertDocumentAccess(current, resource, actor)
  if (current.isDeleted) return { deleted: true }

  if (event.resource === 'equipments') {
    const linkedRes = await db.collection('devices').where({
      equipmentId: event.id,
      isDeleted: false
    }).count()
    const linkedCount = Number(linkedRes.total || 0)
    if (linkedCount > 0) {
      throw new Error(`该设备仍绑定 ${linkedCount} 块压力表，请先换绑或删除压力表`)
    }
  }

  const now = new Date()
  const deletedBy = actor.type === 'admin' ? actor.username : actor.companyName
  await ensureCollection('operation_logs')
  await db.collection(resource.collection).doc(event.id).update({
    data: { isDeleted: true, deletedAt: now, deletedBy, deletedById: actor.id, updateTime: now }
  })

  let relatedRecordCount = 0
  if (event.resource === 'devices') {
    const countRes = await db.collection('pressure_records').where({ deviceId: event.id, isDeleted: false }).count()
    relatedRecordCount = Number(countRes.total || 0)
    if (relatedRecordCount) {
      await db.collection('pressure_records').where({ deviceId: event.id, isDeleted: false }).update({
        data: { isDeleted: true, deletedAt: now, deletedBy, deletedById: actor.id, updateTime: now }
      })
    }
  }

  await writeDeletionLog(event.resource, current, actor, now, relatedRecordCount)
  await writeOperationLog({
    event,
    actor,
    operation: 'delete',
    entityId: event.id,
    before: current,
    after: { ...current, isDeleted: true, deletedAt: now, deletedBy, deletedById: actor.id, updateTime: now },
    metadata: { relatedRecordCount }
  })
  if (event.resource === 'devices' && current.equipmentId) await syncGaugeCount(current.equipmentId)
  if (event.resource === 'pressure_records' && current.deviceId) await syncDeviceSnapshot(current.deviceId)
  return { deleted: true, relatedRecordCount }
}

async function handleLogLifecycle(event, actor) {
  const deviceResource = RESOURCES.devices
  const device = await getDocument(deviceResource, event.data?.deviceId)
  assertDocumentAccess(device, deviceResource, actor)
  const now = new Date()
  const data = {
    deviceId: device._id,
    enterpriseName: device.enterpriseName || '',
    district: device.district || '',
    action: clean(event.data?.action),
    operator: actor.type === 'admin' ? actor.username : actor.companyName,
    operatorId: actor.id,
    remark: clean(event.data?.remark),
    images: Array.isArray(event.data?.images) ? event.data.images.slice(0, 6) : [],
    createTime: now,
    timestamp: Date.now()
  }
  if (!data.action) throw new Error('缺少动作名称')
  const res = await db.collection('lifecycle_logs').add({ data })
  return { id: res._id }
}

async function handleEnterpriseDashboard(event, actor) {
  if (actor.type !== 'enterprise') throw new Error('仅企业账号可访问')
  const base = { enterpriseName: actor.companyName, isDeleted: false }
  const today = formatYmd(new Date())
  const [equipments, deviceRes, inactiveRes, expiredRes, inactiveListRes, version] = await Promise.all([
    fetchAll('equipments', base, {
      fields: { _id: true, equipmentName: true, equipmentNo: true, location: true, gaugeCount: true },
      maxRecords: 20000
    }),
    db.collection('devices').where(base).count(),
    db.collection('devices').where({ ...base, status: _.in(['停用', '报废']) }).count(),
    db.collection('devices').where({ ...base, latestExpiryDate: _.lt(today) }).count(),
    db.collection('devices')
      .where({ ...base, status: _.in(['停用', '报废']) })
      .orderBy('updateTime', 'desc')
      .limit(5)
      .field({ _id: true, deviceName: true, factoryNo: true, equipmentName: true, status: true })
      .get(),
    getLatestOperationVersion(actor)
  ])
  const unboundEquipments = equipments.filter((item) => Number(item.gaugeCount || 0) === 0)
  return {
    summary: {
      equipmentCount: equipments.length,
      gaugeCount: Number(deviceRes.total || 0),
      expiredCount: Number(expiredRes.total || 0),
      inactiveCount: Number(inactiveRes.total || 0)
    },
    bindingReminder: {
      count: unboundEquipments.length,
      items: unboundEquipments.slice(0, 5)
    },
    inactiveDevices: inactiveListRes.data || [],
    version
  }
}

async function handleGetDataVersion(event, actor) {
  return { version: await getLatestOperationVersion(actor) }
}

async function handleAdminDashboardStats(event, actor) {
  if (actor.type !== 'admin') throw new Error('仅管理端可访问')

  const filters = buildFilters(RESOURCES.equipments, actor, { isDeleted: false })
  const equipments = await fetchAll('equipments', filters, {
    fields: { district: true },
    maxRecords: 20000
  })
  const districtMap = {}

  equipments.forEach((item) => {
    const district = clean(item.district) || '未设置'
    districtMap[district] = (districtMap[district] || 0) + 1
  })

  const districtStats = Object.entries(districtMap)
    .map(([district, count]) => ({ district, count }))
    .sort((a, b) => b.count - a.count || a.district.localeCompare(b.district))

  return {
    totalEquipments: equipments.length,
    districtStats,
    version: await getLatestOperationVersion(actor)
  }
}

async function getLatestOperationVersion(actor) {
  try {
    await ensureCollection('operation_logs')
    let query = db.collection('operation_logs')
    if (actor.type === 'enterprise') {
      query = query.where({ enterpriseName: actor.companyName })
    } else if (actor.role === 'district' && actor.district) {
      query = query.where({ district: actor.district })
    }
    const result = await query.orderBy('timestamp', 'desc').limit(1).field({ timestamp: true }).get()
    return Number(result.data?.[0]?.timestamp || 0)
  } catch (error) {
    return Date.now()
  }
}

function buildFilters(resource, actor, input) {
  const allowed = new Set(['_id', 'isDeleted', 'status', 'gaugeStatus', 'approvalStatus', 'district', 'enterpriseName', 'companyName', 'equipmentId', 'deviceId', 'action', 'certNo', 'factoryNo', 'conclusion', 'expiryDate'])
  const filters = {}
  Object.keys(input || {}).forEach((key) => {
    if (!allowed.has(key)) return
    const value = input[key]
    if (value && typeof value === 'object' && Array.isArray(value.in)) filters[key] = _.in(value.in.slice(0, 20))
    else if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'neq')) filters[key] = _.neq(value.neq)
    else if (value && typeof value === 'object' && value.gte !== undefined && value.lte !== undefined) filters[key] = _.and(_.gte(value.gte), _.lte(value.lte))
    else if (value && typeof value === 'object' && value.lt !== undefined) filters[key] = _.lt(value.lt)
    else if (value && typeof value === 'object' && value.lte !== undefined) filters[key] = _.lte(value.lte)
    else if (value && typeof value === 'object' && value.gte !== undefined) filters[key] = _.gte(value.gte)
    else if (value !== undefined) filters[key] = value
  })
  applyScopeFilter(filters, resource, actor)
  return filters
}

function applyScopeFilter(filters, resource, actor) {
  if (actor.type === 'enterprise') {
    filters[resource.enterpriseField] = actor.companyName
    return
  }
  if (actor.role === 'district' && actor.district) filters.district = actor.district
}

function applyOwnership(data, resource, actor, original) {
  if (actor.type === 'enterprise') {
    data[resource.enterpriseField] = actor.companyName
    if ('district' in data || resource.collection !== 'enterprises') data.district = actor.district
    if (resource.collection === 'pressure_records') {
      data.enterprisePhone = actor.phone
      data.enterpriseLegalPerson = actor.legalPerson
      data.createdBy = 'enterprise'
    }
    return
  }
  if (actor.role === 'district') data.district = actor.district
  const requestedEnterprise = clean(original.enterpriseName || original.companyName)
  if (requestedEnterprise) data[resource.enterpriseField] = requestedEnterprise
  if (!data[resource.enterpriseField]) throw new Error('请选择所属企业')
}

function assertDocumentAccess(item, resource, actor) {
  if (!item) throw new Error('数据不存在')
  if (actor.type === 'enterprise' && clean(item[resource.enterpriseField]) !== actor.companyName) throw new Error('无权访问该数据')
  if (actor.type === 'admin' && actor.role === 'district' && clean(item.district) !== actor.district) throw new Error('无权访问其他辖区数据')
}

async function getDocument(resource, id) {
  if (!id) throw new Error('缺少数据ID')
  const res = await db.collection(resource.collection).doc(id).get()
  return res.data
}

async function validateEquipmentBinding(data, actor) {
  if (!data.equipmentId) throw new Error('压力表必须绑定所属设备')
  const equipment = await getDocument(RESOURCES.equipments, data.equipmentId)
  assertDocumentAccess(equipment, RESOURCES.equipments, actor)
  if (equipment.isDeleted) throw new Error('所属设备已删除')
  data.equipmentName = equipment.equipmentName || ''
  data.district = equipment.district || data.district || ''
}

async function validateRecordBinding(data, actor) {
  if (!data.deviceId) throw new Error('请选择所属压力表')
  const device = await getDocument(RESOURCES.devices, data.deviceId)
  assertDocumentAccess(device, RESOURCES.devices, actor)
  if (device.isDeleted || !device.equipmentId) throw new Error('所属压力表无效或尚未绑定设备')
  data.deviceName = device.deviceName || ''
  data.deviceNo = device.deviceNo || ''
  data.deviceStatus = device.status || '在用'
  data.equipmentId = device.equipmentId
  data.equipmentName = device.equipmentName || ''
}

async function syncGaugeCount(equipmentId) {
  const countRes = await db.collection('devices').where({ equipmentId, isDeleted: false }).count()
  await db.collection('equipments').doc(equipmentId).update({
    data: { gaugeCount: Number(countRes.total || 0), updateTime: new Date() }
  })
}

async function syncDeviceSnapshot(deviceId) {
  const condition = { deviceId, isDeleted: false }
  const [countRes, latestRes] = await Promise.all([
    db.collection('pressure_records').where(condition).count(),
    db.collection('pressure_records').where(condition).orderBy('verificationDate', 'desc').limit(1).get()
  ])
  const latest = latestRes.data?.[0]
  await db.collection('devices').doc(deviceId).update({
    data: {
      recordCount: Number(countRes.total || 0),
      latestRecordId: latest?._id || '',
      latestVerificationDate: latest?.verificationDate || '',
      latestExpiryDate: latest?.expiryDate || '',
      latestConclusion: latest?.conclusion || '',
      updateTime: new Date()
    }
  })
}

async function writeDeletionLog(resourceName, item, actor, deletedAt, relatedRecordCount) {
  const entityType = resourceName === 'pressure_records' ? 'pressure_record' : resourceName.slice(0, -1)
  await db.collection('deletion_logs').add({
    data: {
      entityType,
      entityId: item._id,
      entityName: item.deviceName || item.equipmentName || item.factoryNo || item.certNo || '记录',
      enterpriseName: item.enterpriseName || actor.companyName || '',
      district: item.district || actor.district || '',
      equipmentId: item.equipmentId || '',
      equipmentName: item.equipmentName || '',
      factoryNo: item.factoryNo || '',
      deviceNo: item.deviceNo || '',
      certNo: item.certNo || '',
      relatedRecordCount,
      deletedAt,
      deletedBy: actor.type === 'admin' ? actor.username : actor.companyName,
      deletedById: actor.id,
      snapshot: item,
      createTime: deletedAt
    }
  })
}

async function writeOperationLog({ event, actor, operation, entityId, before, after, metadata = {} }) {
  const source = ['manual', 'admin', 'ai', 'excel', 'system'].includes(event.source)
    ? event.source
    : actor.type === 'admin' ? 'admin' : 'manual'
  const reference = after || before || {}
  const now = new Date()
  await db.collection('operation_logs').add({
    data: {
      requestId: clean(event.requestId) || crypto.randomBytes(12).toString('hex'),
      source,
      operation,
      entityType: event.resource,
      entityId,
      enterpriseName: clean(reference.enterpriseName || reference.companyName || actor.companyName),
      district: clean(reference.district || actor.district),
      operatorType: actor.type,
      operatorId: actor.id || '',
      operatorName: actor.type === 'admin' ? actor.username : actor.companyName,
      before: sanitizeAuditSnapshot(before),
      after: sanitizeAuditSnapshot(after),
      metadata: sanitizeAuditSnapshot(metadata),
      createdAt: now,
      timestamp: now.getTime()
    }
  })
}

function sanitizeAuditSnapshot(input) {
  if (!input || typeof input !== 'object') return input || null
  const blocked = new Set([
    '_openid', 'openid', 'password', 'passwordHash', 'passwordSalt',
    'fileID', 'installPhotoFileID', 'rawText', 'imagePath', 'images'
  ])
  const output = {}
  Object.keys(input).slice(0, 80).forEach((key) => {
    if (blocked.has(key)) return
    const value = input[key]
    if (value instanceof Date) output[key] = value
    else if (Array.isArray(value)) output[key] = value.slice(0, 20).map((item) => typeof item === 'string' ? item.slice(0, 200) : item)
    else if (value && typeof value === 'object') output[key] = sanitizeAuditSnapshot(value)
    else if (typeof value === 'string') output[key] = value.slice(0, 500)
    else output[key] = value
  })
  return output
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    const missing = /collection.*not exist|COLLECTION_NOT_EXIST|集合不存在|DATABASE_COLLECTION_NOT_EXIST/i.test(error.message || '')
    if (!missing || typeof db.createCollection !== 'function') throw error
    try {
      await db.createCollection(name)
    } catch (createError) {
      if (!/already exist|已存在/i.test(createError.message || '')) throw createError
    }
  }
}

function normalizeOrderBy(input) {
  if (!input || typeof input !== 'object') return { field: 'createTime', direction: 'desc' }
  const allowed = ['createTime', 'updateTime', 'verificationDate', 'expiryDate', 'deletedAt', 'timestamp', 'companyName', 'equipmentName']
  if (!allowed.includes(input.field)) return { field: 'createTime', direction: 'desc' }
  return { field: input.field, direction: input.direction === 'asc' ? 'asc' : 'desc' }
}

function pickFields(input, fields) {
  const output = {}
  fields.forEach((field) => {
    if (input[field] !== undefined) output[field] = input[field]
  })
  return output
}

function sanitizeRead(item, resource, actor) {
  if (!item) return null
  const { _openid, openid, password, passwordHash, passwordSalt, ...safe } = item
  if (resource.readFields) {
    const result = { _id: item._id }
    resource.readFields.forEach((field) => { if (safe[field] !== undefined) result[field] = safe[field] })
    return result
  }
  return safe
}

function clean(value) {
  return String(value || '').trim()
}

function normalizeApprovalStatus(enterprise) {
  const status = clean(enterprise?.approvalStatus)
  return ['pending', 'approved', 'rejected'].includes(status) ? status : 'approved'
}

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatYmd(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function fetchAll(collectionName, filters, options = {}) {
  const batchSize = 1000
  const maxRecords = Math.max(batchSize, Number(options.maxRecords || 10000))
  const list = []

  while (list.length < maxRecords) {
    let query = db.collection(collectionName).where(filters).skip(list.length).limit(batchSize)
    if (options.fields) query = query.field(options.fields)
    const res = await query.get()
    const batch = res.data || []
    list.push(...batch)
    if (batch.length < batchSize) break
  }

  if (list.length >= maxRecords) throw new Error('统计数据量超过安全上限，请联系管理员处理')
  return list
}
