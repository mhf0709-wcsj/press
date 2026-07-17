const cloud = require('wx-server-sdk')
const readXlsxFile = require('read-excel-file/node')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_ROWS = 100
const HEADER_ALIASES = {
  deviceNo: ['压力表编号', '表编号', '设备编号', 'deviceno'],
  factoryNo: ['出厂编号', '出厂号', 'factoryno'],
  certNo: ['证书编号', '检定证书编号', 'certno', 'certificateno'],
  sendUnit: ['送检单位', '受检单位', '使用单位', 'sendunit'],
  instrumentName: ['压力表名称', '仪表名称', '计量器具名称', '器具名称', 'instrumentname'],
  modelSpec: ['型号规格', '型号/规格', '规格型号', '型号', 'modelspec'],
  manufacturer: ['制造单位', '生产厂家', '制造商', 'manufacturer'],
  verificationStd: ['检定依据', '检定规程', 'verificationstd', 'verificationbasis'],
  conclusion: ['检定结论', '结论', 'conclusion'],
  verificationDate: ['检定日期', '校准日期', 'verificationdate'],
  district: ['辖区', '所属辖区', 'district'],
  gaugeStatus: ['压力表状态', '使用状态', '状态', 'gaugestatus'],
  equipmentNo: ['所属设备编号', '设备台账编号', 'equipmentno'],
  equipmentName: ['所属设备', '设备名称', 'equipmentname']
}

const HEADER_LOOKUP = Object.keys(HEADER_ALIASES).reduce((result, key) => {
  HEADER_ALIASES[key].forEach((alias) => { result[normalizeHeader(alias)] = key })
  return result
}, {})

exports.main = async (event = {}) => {
  try {
    const actor = await resolveEnterprise()
    if (event.action === 'parseExcel') return await parseExcel(event, actor)
    if (event.action === 'commitExcel') return await commitExcel(event, actor)
    throw new Error('不支持的批量导入操作')
  } catch (error) {
    return {
      success: false,
      code: error.code || 'BATCH_IMPORT_FAILED',
      error: error.message || '批量导入失败'
    }
  }
}

async function resolveEnterprise() {
  const openid = cloud.getWXContext().OPENID
  if (!openid) throw new Error('登录状态无效')
  const result = await db.collection('enterprises').where({ openid }).limit(1).get()
  const enterprise = result.data?.[0]
  if (!enterprise) throw new Error('请先登录企业账号')
  if (enterprise.approvalStatus === 'pending') throw new Error('企业账号正在审核中')
  if (enterprise.approvalStatus === 'rejected') throw new Error('企业账号审核未通过')
  return {
    id: enterprise._id,
    companyName: clean(enterprise.companyName),
    district: clean(enterprise.district),
    phone: clean(enterprise.phone),
    legalPerson: clean(enterprise.legalPerson)
  }
}

async function parseExcel(event, actor) {
  if (!event.fileID) throw new Error('未获取到 Excel 文件')
  let download
  try {
    download = await cloud.downloadFile({ fileID: event.fileID })
  } catch (error) {
    throw createImportError('FILE_DOWNLOAD_FAILED', 'Excel 文件下载失败，请重新选择文件。')
  }

  let matrix
  try {
    matrix = await readXlsxFile(download.fileContent)
  } catch (error) {
    const raw = String(error?.message || '')
    if (/zip|archive|central directory|invalid/i.test(raw)) {
      throw createImportError('INVALID_XLSX', '文件不是有效的 .xlsx 工作簿，请在 Excel 或 WPS 中重新另存后导入。')
    }
    throw createImportError('XLSX_PARSE_FAILED', `Excel 内容解析失败：${raw || '工作簿结构异常'}`)
  }
  if (!matrix.length) throw new Error('Excel 中没有可读取的工作表')
  const sheetName = '工作表1'
  const headerIndex = findHeaderIndex(matrix)
  if (headerIndex < 0) {
    throw new Error('未找到表头，请至少包含“压力表编号或出厂编号、检定日期、检定结论”')
  }

  const columns = buildColumns(matrix[headerIndex])
  const devices = await loadEnterpriseDocuments('devices', actor.companyName)
  const activeDevices = devices.filter((item) => !item.isDeleted)
  const deviceIndexes = buildDeviceIndexes(activeDevices)
  const equipments = (await loadEnterpriseDocuments('equipments', actor.companyName)).filter((item) => !item.isDeleted)
  const equipmentIndexes = buildEquipmentIndexes(equipments)
  const existingRecords = await loadEnterpriseDocuments('pressure_records', actor.companyName)
  const duplicateKeys = new Set(existingRecords.filter((item) => !item.isDeleted).flatMap(buildDuplicateKeys))
  const dataRows = matrix.slice(headerIndex + 1).filter((row) => row.some((value) => clean(value)))
  if (!dataRows.length) throw new Error('Excel 中没有可导入的数据')
  if (dataRows.length > MAX_ROWS) throw new Error(`单次最多导入 ${MAX_ROWS} 行，请拆分文件后重试`)

  const rows = dataRows.map((row, index) => normalizeRow(
    row,
    columns,
    headerIndex + index + 2,
    actor,
    deviceIndexes,
    equipmentIndexes,
    duplicateKeys
  ))
  return {
    success: true,
    data: {
      fileName: clean(event.fileName) || sheetName,
      sheetName,
      rows,
      total: rows.length,
      readyCount: rows.filter((item) => item.status === 'ready').length,
      errorCount: rows.filter((item) => item.status === 'error').length,
      duplicateCount: rows.filter((item) => item.status === 'duplicate').length
    }
  }
}

async function commitExcel(event, actor) {
  const inputRows = Array.isArray(event.rows) ? event.rows.slice(0, MAX_ROWS) : []
  if (!inputRows.length) throw new Error('没有待导入的数据')

  const devices = await loadEnterpriseDocuments('devices', actor.companyName)
  const activeDevices = devices.filter((item) => !item.isDeleted)
  const deviceById = new Map(activeDevices.map((item) => [item._id, item]))
  const deviceIndexes = buildDeviceIndexes(activeDevices)
  const equipments = (await loadEnterpriseDocuments('equipments', actor.companyName)).filter((item) => !item.isDeleted)
  const equipmentById = new Map(equipments.map((item) => [item._id, item]))
  const existingRecords = await loadEnterpriseDocuments('pressure_records', actor.companyName)
  const duplicateKeys = new Set(existingRecords.filter((item) => !item.isDeleted).flatMap(buildDuplicateKeys))
  const results = []
  const touchedDeviceIds = new Set()
  const touchedEquipmentIds = new Set()
  await ensureCollection('operation_logs')

  for (const input of inputRows) {
    const rowNo = Number(input.rowNo || 0)
    try {
      let device = deviceById.get(clean(input.deviceId))
      if (!device) {
        device = findDevice(input, deviceIndexes)
      }
      if (!device) {
        const equipment = equipmentById.get(clean(input.equipmentId))
        if (!equipment || clean(equipment.enterpriseName) !== actor.companyName) throw new Error('匹配的所属设备不存在或已删除')
        device = await createGauge(input, actor, equipment)
        deviceById.set(device._id, device)
        if (device.deviceNo) deviceIndexes.byDeviceNo.set(normalizeKey(device.deviceNo), device)
        if (device.factoryNo) deviceIndexes.byFactoryNo.set(normalizeKey(device.factoryNo), device)
        touchedEquipmentIds.add(equipment._id)
      }
      if (clean(device.enterpriseName) !== actor.companyName) throw new Error('匹配的压力表不属于当前企业')
      if (!device.equipmentId) throw new Error('该压力表尚未绑定所属设备')

      if (input.importMode === 'gauge') {
        results.push({ rowNo, status: 'success', id: device._id, importMode: 'gauge' })
        continue
      }

      const record = sanitizeCommitRow(input, actor, device)
      const keys = buildDuplicateKeys(record)
      if (keys.some((key) => duplicateKeys.has(key))) {
        results.push({ rowNo, status: 'duplicate', message: '已存在相同记录，已跳过' })
        continue
      }

      const createdAt = new Date()
      const addResult = await db.collection('pressure_records').add({
        data: {
          ...record,
          createTime: createdAt,
          updateTime: createdAt,
          isDeleted: false
        }
      })
      keys.forEach((key) => duplicateKeys.add(key))
      touchedDeviceIds.add(device._id)
      results.push({ rowNo, status: 'success', id: addResult._id })
    } catch (error) {
      results.push({ rowNo, status: 'error', message: error.message || '导入失败' })
    }
  }

  await runInChunks([...touchedEquipmentIds], 5, syncGaugeCount)
  await runInChunks([...touchedDeviceIds], 5, syncDeviceSnapshot)

  const successful = results.filter((item) => item.status === 'success')
  if (successful.length) {
    const now = new Date()
    await db.collection('operation_logs').add({
      data: {
        requestId: clean(event.requestId) || `excel-${now.getTime()}-${Math.random().toString(16).slice(2)}`,
        source: 'excel',
        operation: 'batch_create',
        entityType: 'pressure_records',
        entityId: '',
        entityIds: successful.map((item) => item.id).filter(Boolean).slice(0, MAX_ROWS),
        enterpriseName: actor.companyName,
        district: actor.district,
        operatorType: 'enterprise',
        operatorId: actor.id,
        operatorName: actor.companyName,
        before: null,
        after: {
          total: results.length,
          successCount: successful.length,
          duplicateCount: results.filter((item) => item.status === 'duplicate').length,
          errorCount: results.filter((item) => item.status === 'error').length
        },
        metadata: { importMode: 'excel' },
        createdAt: now,
        timestamp: now.getTime()
      }
    })
  }

  return {
    success: true,
    data: {
      total: results.length,
      successCount: results.filter((item) => item.status === 'success').length,
      duplicateCount: results.filter((item) => item.status === 'duplicate').length,
      errorCount: results.filter((item) => item.status === 'error').length,
      results
    }
  }
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

function normalizeRow(row, columns, rowNo, actor, indexes, equipmentIndexes, duplicateKeys) {
  const data = {}
  columns.forEach(({ index, key }) => {
    if (key) data[key] = row[index]
  })

  const normalized = {
    rowNo,
    deviceNo: clean(data.deviceNo),
    factoryNo: clean(data.factoryNo),
    certNo: clean(data.certNo),
    sendUnit: clean(data.sendUnit),
    instrumentName: clean(data.instrumentName),
    modelSpec: clean(data.modelSpec),
    manufacturer: clean(data.manufacturer),
    verificationStd: clean(data.verificationStd),
    conclusion: normalizeConclusion(data.conclusion),
    verificationDate: normalizeDate(data.verificationDate),
    district: clean(data.district) || actor.district,
    gaugeStatus: normalizeGaugeStatus(data.gaugeStatus),
    equipmentNo: clean(data.equipmentNo),
    equipmentName: clean(data.equipmentName)
  }
  const candidates = [
    normalized.deviceNo ? indexes.byDeviceNo.get(normalizeKey(normalized.deviceNo)) : null,
    normalized.factoryNo ? indexes.byFactoryNo.get(normalizeKey(normalized.factoryNo)) : null
  ].filter(Boolean)
  const device = candidates[0] || null
  const equipment = device
    ? null
    : findEquipment(normalized, equipmentIndexes)
  const errors = []
  const warnings = []
  const hasRecordData = Boolean(
    normalized.certNo || normalized.verificationStd ||
    normalized.verificationDate || normalized.conclusion
  )
  const importMode = hasRecordData ? 'record' : 'gauge'

  if (!normalized.deviceNo && !normalized.factoryNo) errors.push('缺少压力表编号或出厂编号')
  if (!device && !equipment) errors.push('未匹配到所属设备')
  if (device && !device.equipmentId) errors.push('匹配的压力表尚未绑定设备')
  if (importMode === 'record' && !normalized.verificationDate) errors.push('检定日期无效')
  if (importMode === 'record' && !normalized.conclusion) errors.push('检定结论应为合格或不合格')
  if (normalized.district && actor.district && normalized.district !== actor.district) {
    warnings.push(`辖区已按企业账号修正为${actor.district}`)
    normalized.district = actor.district
  }

  if (device) {
    normalized.deviceId = device._id
    normalized.deviceNo = normalized.deviceNo || clean(device.deviceNo)
    normalized.factoryNo = normalized.factoryNo || clean(device.factoryNo)
    normalized.instrumentName = normalized.instrumentName || clean(device.deviceName) || '压力表'
    normalized.modelSpec = normalized.modelSpec || clean(device.modelSpec)
    normalized.manufacturer = normalized.manufacturer || clean(device.manufacturer)
    normalized.gaugeStatus = normalized.gaugeStatus || normalizeGaugeStatus(device.status) || '在用'
    normalized.equipmentName = clean(device.equipmentName)
    normalized.equipmentId = clean(device.equipmentId)
  } else if (equipment) {
    normalized.equipmentId = equipment._id
    normalized.equipmentNo = normalized.equipmentNo || clean(equipment.equipmentNo)
    normalized.equipmentName = clean(equipment.equipmentName)
    normalized.district = actor.district || clean(equipment.district)
    normalized.instrumentName = normalized.instrumentName || '压力表'
    normalized.gaugeStatus = normalized.gaugeStatus || '在用'
  }

  const isDuplicate = !errors.length && (
    importMode === 'gauge'
      ? Boolean(device)
      : buildDuplicateKeys(normalized).some((key) => duplicateKeys.has(key))
  )
  return {
    ...normalized,
    importMode,
    status: errors.length ? 'error' : (isDuplicate ? 'duplicate' : 'ready'),
    errors,
    warnings
  }
}

function sanitizeCommitRow(input, actor, device) {
  const verificationDate = normalizeDate(input.verificationDate)
  const conclusion = normalizeConclusion(input.conclusion)
  if (!verificationDate) throw new Error('检定日期无效')
  if (!conclusion) throw new Error('检定结论应为合格或不合格')

  const factoryNo = clean(input.factoryNo) || clean(device.factoryNo)
  if (!factoryNo && !device.deviceNo) throw new Error('缺少压力表编号或出厂编号')
  return {
    certNo: clean(input.certNo),
    factoryNo,
    sendUnit: clean(input.sendUnit),
    instrumentName: clean(input.instrumentName) || clean(device.deviceName) || '压力表',
    modelSpec: clean(input.modelSpec) || clean(device.modelSpec),
    manufacturer: clean(input.manufacturer) || clean(device.manufacturer),
    verificationStd: clean(input.verificationStd),
    verificationBasis: clean(input.verificationStd),
    conclusion,
    verificationDate,
    expiryDate: calculateExpiryDate(verificationDate),
    district: actor.district || clean(device.district),
    status: 'valid',
    gaugeStatus: normalizeGaugeStatus(input.gaugeStatus) || normalizeGaugeStatus(device.status) || '在用',
    ocrSource: 'excel_import',
    hasImage: false,
    hasInstallPhoto: false,
    equipmentId: device.equipmentId,
    equipmentName: clean(device.equipmentName),
    deviceId: device._id,
    deviceName: clean(device.deviceName),
    deviceNo: clean(device.deviceNo),
    deviceStatus: normalizeGaugeStatus(device.status) || '在用',
    enterpriseName: actor.companyName,
    enterprisePhone: actor.phone,
    enterpriseLegalPerson: actor.legalPerson,
    createdBy: 'enterprise'
  }
}

function findHeaderIndex(matrix) {
  const max = Math.min(10, matrix.length)
  for (let index = 0; index < max; index += 1) {
    const recognized = matrix[index].filter((value) => HEADER_LOOKUP[normalizeHeader(value)]).length
    if (recognized >= 2) return index
  }
  return -1
}

function buildColumns(headerRow) {
  return headerRow.map((value, index) => ({ index, key: HEADER_LOOKUP[normalizeHeader(value)] || '' }))
}

function buildDeviceIndexes(devices) {
  const byDeviceNo = new Map()
  const byFactoryNo = new Map()
  devices.forEach((device) => {
    if (device.deviceNo) byDeviceNo.set(normalizeKey(device.deviceNo), device)
    if (device.factoryNo) byFactoryNo.set(normalizeKey(device.factoryNo), device)
  })
  return { byDeviceNo, byFactoryNo }
}

function buildEquipmentIndexes(equipments) {
  const byNo = new Map()
  const byName = new Map()
  equipments.forEach((equipment) => {
    if (equipment.equipmentNo) byNo.set(normalizeKey(equipment.equipmentNo), equipment)
    if (equipment.equipmentName) byName.set(normalizeKey(equipment.equipmentName), equipment)
  })
  return { byNo, byName }
}

function findDevice(input, indexes) {
  if (input.deviceNo) {
    const device = indexes.byDeviceNo.get(normalizeKey(input.deviceNo))
    if (device) return device
  }
  if (input.factoryNo) return indexes.byFactoryNo.get(normalizeKey(input.factoryNo)) || null
  return null
}

function findEquipment(input, indexes) {
  if (input.equipmentNo) {
    const equipment = indexes.byNo.get(normalizeKey(input.equipmentNo))
    if (equipment) return equipment
  }
  if (input.equipmentName) return indexes.byName.get(normalizeKey(input.equipmentName)) || null
  return null
}

async function createGauge(input, actor, equipment) {
  const now = new Date()
  const data = {
    deviceNo: clean(input.deviceNo) || `DEV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    deviceName: clean(input.instrumentName) || '压力表',
    deviceType: '压力表',
    district: actor.district || clean(equipment.district),
    factoryNo: clean(input.factoryNo),
    equipmentId: equipment._id,
    equipmentName: clean(equipment.equipmentName),
    status: normalizeGaugeStatus(input.gaugeStatus) || '在用',
    manufacturer: clean(input.manufacturer),
    modelSpec: clean(input.modelSpec),
    installLocation: clean(equipment.location),
    recordCount: 0,
    enterpriseName: actor.companyName,
    isDeleted: false,
    createTime: now,
    updateTime: now
  }
  const result = await db.collection('devices').add({ data })
  return { _id: result._id, ...data }
}

async function syncGaugeCount(equipmentId) {
  const countResult = await db.collection('devices').where({ equipmentId, isDeleted: false }).count()
  await db.collection('equipments').doc(equipmentId).update({
    data: { gaugeCount: Number(countResult.total || 0), updateTime: new Date() }
  })
}

async function syncDeviceSnapshot(deviceId) {
  const condition = { deviceId, isDeleted: false }
  const [countResult, latestResult] = await Promise.all([
    db.collection('pressure_records').where(condition).count(),
    db.collection('pressure_records').where(condition).orderBy('verificationDate', 'desc').limit(1).get()
  ])
  const latest = latestResult.data?.[0]
  await db.collection('devices').doc(deviceId).update({
    data: {
      recordCount: Number(countResult.total || 0),
      latestRecordId: latest?._id || '',
      latestVerificationDate: latest?.verificationDate || '',
      latestExpiryDate: latest?.expiryDate || '',
      latestConclusion: latest?.conclusion || '',
      updateTime: new Date()
    }
  })
}

async function runInChunks(items, size, handler) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(handler))
  }
}

function buildDuplicateKeys(record) {
  const keys = []
  const certNo = normalizeKey(record.certNo)
  const factoryNo = normalizeKey(record.factoryNo)
  const deviceId = clean(record.deviceId)
  const verificationDate = normalizeDate(record.verificationDate)
  if (certNo) keys.push(`cert:${certNo}`)
  if (verificationDate && factoryNo) keys.push(`factory:${factoryNo}:${verificationDate}`)
  if (verificationDate && deviceId) keys.push(`device:${deviceId}:${verificationDate}`)
  return keys
}

async function loadEnterpriseDocuments(collection, enterpriseName) {
  const result = []
  const pageSize = 100
  for (let page = 0; page < 20; page += 1) {
    const response = await db.collection(collection)
      .where({ enterpriseName })
      .skip(page * pageSize)
      .limit(pageSize)
      .get()
    result.push(...(response.data || []))
    if (!response.data || response.data.length < pageSize) break
  }
  return result
}

function normalizeHeader(value) {
  return clean(value).toLowerCase().replace(/[\s_\-—/:：()（）]/g, '')
}

function normalizeKey(value) {
  return clean(value).toLowerCase().replace(/\s+/g, '')
}

function normalizeConclusion(value) {
  const text = clean(value)
  if (/不合格/.test(text)) return '不合格'
  if (/合格|符合/.test(text)) return '合格'
  return ''
}

function normalizeGaugeStatus(value) {
  const text = clean(value)
  return ['在用', '备用', '送检', '停用', '报废'].includes(text) ? text : ''
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDate(value)
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = Math.round((value - 25569) * 86400 * 1000)
    const parsed = new Date(milliseconds)
    if (!Number.isNaN(parsed.getTime())) {
      return buildDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate())
    }
  }
  const text = clean(value)
  const match = text.match(/(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/)
  if (!match) return ''
  return buildDate(match[1], match[2], match[3])
}

function buildDate(year, month, day) {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return ''
  return formatDate(date)
}

function calculateExpiryDate(verificationDate) {
  const source = new Date(`${verificationDate}T00:00:00`)
  const targetMonth = source.getMonth() + 6
  const targetYear = source.getFullYear() + Math.floor(targetMonth / 12)
  const normalizedMonth = ((targetMonth % 12) + 12) % 12
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate()
  const expiry = new Date(targetYear, normalizedMonth, Math.min(source.getDate(), lastDay))
  expiry.setDate(expiry.getDate() - 1)
  return formatDate(expiry)
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function clean(value) {
  return String(value ?? '').trim()
}

function createImportError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

if (process.env.NODE_ENV === 'test') {
  exports.__test = {
    buildColumns,
    buildDeviceIndexes,
    buildEquipmentIndexes,
    calculateExpiryDate,
    normalizeConclusion,
    normalizeDate,
    normalizeRow
  }
}
