const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isExpiredDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date < startOfToday()
}

function isExpiringDate(value, days = 30) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const today = startOfToday()
  const future = addDays(today, days)
  return date >= today && date <= future
}

function normalizeAdmin(admin) {
  return {
    id: admin._id,
    username: admin.username,
    role: admin.role || 'admin',
    district: admin.district || ''
  }
}

function normalizeEnterprise(enterprise) {
  return {
    id: enterprise._id,
    companyName: enterprise.companyName || enterprise.enterpriseName || '',
    phone: enterprise.phone || enterprise.contactPhone || enterprise.legalPersonPhone || '',
    legalPerson: enterprise.legalPerson || enterprise.contact || '',
    creditCode: enterprise.creditCode || '',
    district: enterprise.district || ''
  }
}

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

async function getAdminByCredential(username, password) {
  const result = await db.collection('admins').where({
    username,
    password
  }).limit(1).get()

  return result.data && result.data.length > 0 ? result.data[0] : null
}

async function fetchAll(collectionName, whereCondition = null, orderByField = 'createTime', direction = 'desc') {
  const pageSize = 100
  let skip = 0
  let all = []

  while (true) {
    let query = db.collection(collectionName)
    if (whereCondition && Object.keys(whereCondition).length > 0) {
      query = query.where(whereCondition)
    }

    if (orderByField) {
      query = query.orderBy(orderByField, direction)
    }

    const res = await query.skip(skip).limit(pageSize).get()
    const batch = res.data || []
    all = all.concat(batch)
    if (batch.length < pageSize) break
    skip += pageSize
  }

  return all
}

function buildScopedWhere(admin) {
  const condition = {}
  if (admin && admin.role === 'district' && admin.district) {
    condition.district = admin.district
  }
  return condition
}

function buildScopedRecordWhere(admin) {
  return Object.assign({}, buildScopedWhere(admin), {
    isDeleted: false
  })
}

function matchKeyword(fields, keyword) {
  if (!keyword) return true
  const normalized = String(keyword).trim().toLowerCase()
  if (!normalized) return true
  return fields.some((field) => String(field || '').toLowerCase().includes(normalized))
}

async function handleLogin(payload = {}) {
  const username = String(payload.username || '').trim()
  const password = String(payload.password || '').trim()

  if (!username || !password) {
    throw new Error('请输入用户名和密码')
  }

  const admin = await getAdminByCredential(username, password)
  if (!admin) {
    throw new Error('用户名或密码错误')
  }

  return {
    admin: normalizeAdmin(admin),
    token: `web_admin_${Date.now()}`
  }
}

async function handleEnterpriseLogin(payload = {}) {
  const companyName = String(payload.companyName || '').trim()
  const phone = String(payload.phone || '').trim()

  if (!companyName || !phone) {
    throw new Error('请输入企业名称和法人手机号')
  }

  const result = await db.collection('enterprises').where({
    companyName,
    phone
  }).limit(1).get()

  const enterprise = result.data && result.data.length > 0 ? result.data[0] : null
  if (!enterprise) {
    throw new Error('企业名称或手机号不匹配')
  }

  await db.collection('enterprises').doc(enterprise._id).update({
    data: {
      lastLoginTime: new Date(),
      updateTime: new Date()
    }
  })

  return {
    enterprise: normalizeEnterprise(enterprise),
    token: `web_enterprise_${Date.now()}`
  }
}

async function handleEnterpriseRegister(payload = {}) {
  const companyName = String(payload.companyName || '').trim()
  const creditCode = String(payload.creditCode || '').trim().toUpperCase()
  const legalPerson = String(payload.legalPerson || '').trim()
  const phone = String(payload.phone || '').trim()
  const district = String(payload.district || '').trim()

  if (!companyName) throw new Error('请输入企业名称')
  if (!creditCode || creditCode.length !== 18) throw new Error('请输入18位统一社会信用代码')
  if (!legalPerson) throw new Error('请输入企业法人')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入正确的法人手机号')
  if (!district) throw new Error('请选择辖区')

  const [companyRes, creditRes, phoneRes] = await Promise.all([
    db.collection('enterprises').where({ companyName }).limit(1).get(),
    db.collection('enterprises').where({ creditCode }).limit(1).get(),
    db.collection('enterprises').where({ phone }).limit(1).get()
  ])

  if (companyRes.data && companyRes.data.length) throw new Error('该企业已注册')
  if (creditRes.data && creditRes.data.length) throw new Error('该统一社会信用代码已存在')
  if (phoneRes.data && phoneRes.data.length) throw new Error('该手机号已被注册')

  const now = new Date()
  const addRes = await db.collection('enterprises').add({
    data: {
      companyName,
      creditCode,
      legalPerson,
      phone,
      district,
      createTime: now,
      updateTime: now,
      lastLoginTime: now,
      authType: 'web'
    }
  })

  const docRes = await db.collection('enterprises').doc(addRes._id).get()
  return {
    enterprise: normalizeEnterprise(docRes.data),
    token: `web_enterprise_${Date.now()}`
  }
}

function buildEnterpriseWhere(enterprise) {
  const companyName = enterprise.companyName || enterprise.enterpriseName || ''
  if (!companyName) throw new Error('缺少企业身份')
  return {
    enterpriseName: companyName,
    isDeleted: false
  }
}

function parseDateInput(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const normalized = text
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\./g, '-')
    .replace(/\//g, '-')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function calculateExpiryDate(value) {
  const date = parseDateInput(value)
  if (!date) return ''
  const expiryDate = new Date(date)
  expiryDate.setMonth(expiryDate.getMonth() + 6)
  expiryDate.setDate(expiryDate.getDate() - 1)
  return formatDate(expiryDate)
}

async function handleGetEnterpriseDashboard(payload = {}) {
  const enterprise = payload.enterprise || {}
  const companyName = enterprise.companyName || ''
  const today = startOfToday()

  const [equipments, gauges, records] = await Promise.all([
    fetchAll('equipments', { enterpriseName: companyName, isDeleted: false }, 'createTime', 'desc'),
    fetchAll('devices', { enterpriseName: companyName, isDeleted: false }, 'createTime', 'desc'),
    fetchAll('pressure_records', { enterpriseName: companyName, isDeleted: false }, 'createTime', 'desc')
  ])

  const expiredCount = records.filter((item) => isExpiredDate(item.expiryDate)).length
  const expiringCount = records.filter((item) => !isExpiredDate(item.expiryDate) && isExpiringDate(item.expiryDate, 30)).length
  const inactiveCount = gauges.filter((item) => ['停用', '报废'].includes(item.status)).length
  const unboundCount = equipments.filter((item) => Number(item.gaugeCount || 0) === 0).length

  return {
    summary: {
      equipmentCount: equipments.length,
      gaugeCount: gauges.length,
      expiredCount,
      expiringCount,
      inactiveCount,
      unboundCount
    },
    recentRecords: records.slice(0, 8).map((item) => ({
      _id: item._id,
      certNo: item.certNo || '',
      factoryNo: item.factoryNo || '',
      instrumentName: item.instrumentName || '',
      equipmentName: item.equipmentName || '',
      conclusion: item.conclusion || '',
      verificationDate: formatDate(item.verificationDate),
      expiryDate: formatDate(item.expiryDate),
      isExpired: new Date(item.expiryDate) < today
    })),
    unboundEquipments: equipments
      .filter((item) => Number(item.gaugeCount || 0) === 0)
      .slice(0, 8)
      .map((item) => ({
        _id: item._id,
        equipmentName: item.equipmentName || '',
        equipmentNo: item.equipmentNo || '',
        location: item.location || ''
      }))
  }
}

async function handleGetEnterpriseEquipments(payload = {}) {
  const enterprise = payload.enterprise || {}
  const keyword = String(payload.keyword || '').trim()
  const whereCondition = buildEnterpriseWhere(enterprise)
  const list = await fetchAll('equipments', whereCondition, 'createTime', 'desc')

  return {
    list: list
      .filter((item) => matchKeyword([item.equipmentName, item.equipmentNo, item.location], keyword))
      .map((item) => ({
        _id: item._id,
        equipmentName: item.equipmentName || '',
        equipmentNo: item.equipmentNo || '',
        location: item.location || '',
        district: item.district || '',
        gaugeCount: Number(item.gaugeCount || 0),
        createTime: formatDate(item.createTime)
      }))
  }
}

async function handleSaveEnterpriseEquipment(payload = {}) {
  const enterprise = payload.enterprise || {}
  const data = payload.data || {}
  const companyName = enterprise.companyName || ''
  const now = formatDateTime(new Date())
  const equipmentName = String(data.equipmentName || '').trim()

  if (!companyName) throw new Error('缺少企业身份')
  if (!equipmentName) throw new Error('请输入设备名称')

  const doc = {
    equipmentNo: data.equipmentNo || `EQ-${Date.now()}`,
    equipmentName,
    enterpriseName: companyName,
    district: data.district || enterprise.district || '',
    location: data.location || '',
    gaugeCount: Number(data.gaugeCount || 0),
    isDeleted: false,
    updateTime: now
  }

  if (data._id) {
    await db.collection('equipments').doc(data._id).update({ data: doc })
    return { _id: data._id, ...doc }
  }

  const res = await db.collection('equipments').add({
    data: {
      ...doc,
      deletedAt: '',
      deletedBy: '',
      deletedById: '',
      createTime: now
    }
  })
  return { _id: res._id, ...doc }
}

async function handleDeleteEnterpriseEquipment(payload = {}) {
  const enterprise = payload.enterprise || {}
  const id = payload.id
  if (!id) throw new Error('缺少设备ID')
  const current = await db.collection('equipments').doc(id).get()
  if (!current.data || current.data.enterpriseName !== enterprise.companyName) {
    throw new Error('无权删除该设备')
  }
  const now = formatDateTime(new Date())
  await db.collection('equipments').doc(id).update({
    data: {
      isDeleted: true,
      deletedAt: now,
      deletedBy: enterprise.companyName || '企业用户',
      deletedById: enterprise.id || '',
      updateTime: now
    }
  })
  return { success: true }
}

async function handleGetEnterpriseGauges(payload = {}) {
  const enterprise = payload.enterprise || {}
  const keyword = String(payload.keyword || '').trim()
  const status = String(payload.status || '').trim()
  const whereCondition = buildEnterpriseWhere(enterprise)
  const list = await fetchAll('devices', whereCondition, 'createTime', 'desc')

  return {
    list: list
      .filter((item) => !status || item.status === status)
      .filter((item) => matchKeyword([item.deviceName, item.deviceNo, item.factoryNo, item.equipmentName, item.modelSpec], keyword))
      .map((item) => ({
        _id: item._id,
        deviceName: item.deviceName || '',
        deviceNo: item.deviceNo || '',
        factoryNo: item.factoryNo || '',
        equipmentId: item.equipmentId || '',
        equipmentName: item.equipmentName || '',
        status: item.status || '',
        manufacturer: item.manufacturer || '',
        modelSpec: item.modelSpec || '',
        createTime: formatDate(item.createTime)
      }))
  }
}

async function handleGetEnterpriseRecords(payload = {}) {
  const enterprise = payload.enterprise || {}
  const keyword = String(payload.keyword || '').trim()
  const filterType = String(payload.filterType || '').trim()
  const whereCondition = buildEnterpriseWhere(enterprise)
  const records = await fetchAll('pressure_records', whereCondition, 'createTime', 'desc')

  return {
    list: records
      .filter((item) => {
        const expired = isExpiredDate(item.expiryDate)
        if (filterType === 'expired' && !expired) return false
        if (filterType === 'expiring' && (expired || !isExpiringDate(item.expiryDate, 30))) return false
        return true
      })
      .filter((item) => matchKeyword([item.certNo, item.factoryNo, item.instrumentName, item.equipmentName, item.deviceName], keyword))
      .map((item) => ({
        _id: item._id,
        certNo: item.certNo || '',
        factoryNo: item.factoryNo || '',
        instrumentName: item.instrumentName || '',
        equipmentName: item.equipmentName || '',
        conclusion: item.conclusion || '',
        verificationDate: formatDate(item.verificationDate),
        expiryDate: formatDate(item.expiryDate),
        status: item.status || ''
      }))
  }
}

async function handleSaveEnterpriseAiRecord(payload = {}) {
  const enterprise = payload.enterprise || {}
  const extractedData = payload.extractedData || {}
  const equipmentId = String(payload.equipmentId || '').trim()
  const fileID = String(payload.fileID || '').trim()

  const companyName = enterprise.companyName || enterprise.enterpriseName || ''
  if (!companyName) throw new Error('缺少企业身份')
  if (!equipmentId) throw new Error('请选择所属设备')

  const equipmentRes = await db.collection('equipments').doc(equipmentId).get()
  const equipment = equipmentRes.data
  if (!equipment || equipment.isDeleted) {
    throw new Error('所选设备不存在')
  }
  if (equipment.enterpriseName !== companyName) {
    throw new Error('无权使用该设备')
  }

  const parsedVerificationDate = parseDateInput(extractedData.verificationDate)
  if (!parsedVerificationDate) {
    throw new Error('请补全检定日期后再保存')
  }
  const verificationDate = formatDate(parsedVerificationDate)

  const now = formatDateTime(new Date())
  const deviceNo = `DEV-${Date.now()}`
  const deviceName = String(extractedData.instrumentName || '压力表').trim() || '压力表'
  const factoryNo = String(extractedData.factoryNo || '').trim()
  const modelSpec = String(extractedData.modelSpec || '').trim()
  const manufacturer = String(extractedData.manufacturer || '').trim()
  const conclusion = String(extractedData.conclusion || '合格').trim() || '合格'
  const sendUnit = String(extractedData.sendUnit || '').trim()
  const certNo = String(extractedData.certNo || '').trim()
  const verificationStd = String(extractedData.verificationStd || '').trim()
  const district = String(extractedData.district || equipment.district || enterprise.district || '').trim()
  const gaugeStatus = String(extractedData.gaugeStatus || '在用').trim() || '在用'

  const deviceDoc = {
    deviceNo,
    deviceName,
    deviceType: '压力表',
    enterpriseId: enterprise.id || enterprise._id || companyName,
    enterpriseName: companyName,
    district,
    factoryNo,
    equipmentId: equipment._id,
    equipmentName: equipment.equipmentName || '',
    status: gaugeStatus,
    manufacturer,
    modelSpec,
    installLocation: equipment.location || '',
    recordCount: 1,
    isDeleted: false,
    deletedAt: '',
    deletedBy: '',
    deletedById: '',
    createTime: now,
    updateTime: now
  }

  const deviceAddRes = await db.collection('devices').add({ data: deviceDoc })

  const recordDoc = {
    certNo,
    sendUnit,
    instrumentName: deviceName,
    modelSpec,
    factoryNo,
    manufacturer,
    verificationStd,
    conclusion,
    verificationDate,
    expiryDate: calculateExpiryDate(verificationDate),
    district,
    status: 'valid',
    isDeleted: false,
    deletedAt: '',
    deletedBy: '',
    createTime: now,
    updateTime: now,
    ocrSource: 'web_ai_assistant',
    hasImage: !!fileID,
    hasInstallPhoto: false,
    enterpriseId: enterprise.id || enterprise._id || companyName,
    enterpriseName: companyName,
    enterprisePhone: enterprise.phone || '',
    enterpriseLegalPerson: enterprise.legalPerson || '',
    createdBy: 'enterprise_web',
    equipmentId: equipment._id,
    equipmentName: equipment.equipmentName || '',
    deviceId: deviceAddRes._id,
    deviceName,
    deviceNo,
    deviceStatus: gaugeStatus
  }

  if (fileID) {
    recordDoc.fileID = fileID
  }

  const recordAddRes = await db.collection('pressure_records').add({
    data: recordDoc
  })

  const gaugeCountRes = await db.collection('devices').where({
    equipmentId: equipment._id,
    isDeleted: false
  }).count()

  await db.collection('equipments').doc(equipment._id).update({
    data: {
      gaugeCount: Number(gaugeCountRes.total || 0),
      updateTime: now
    }
  })

  return {
    success: true,
    recordId: recordAddRes._id,
    deviceId: deviceAddRes._id,
    equipmentId: equipment._id
  }
}

async function handleChangePassword(payload = {}) {
  const admin = payload.admin || {}
  const oldPassword = String(payload.oldPassword || '').trim()
  const newPassword = String(payload.newPassword || '').trim()

  if (!admin.username || !oldPassword || !newPassword) {
    throw new Error('缺少必要参数')
  }

  const target = await getAdminByCredential(admin.username, oldPassword)
  if (!target) {
    throw new Error('原密码错误')
  }

  await db.collection('admins').doc(target._id).update({
    data: {
      password: newPassword,
      updateTime: new Date()
    }
  })

  return { success: true }
}

async function handleGetDashboard(payload = {}) {
  const admin = payload.admin || {}
  const whereCondition = buildScopedWhere(admin)
  const recordWhereCondition = buildScopedRecordWhere(admin)
  const [records, enterprises] = await Promise.all([
    fetchAll('pressure_records', recordWhereCondition, 'createTime', 'desc'),
    fetchAll('enterprises', whereCondition, 'createTime', 'desc')
  ])

  let expiredCount = 0
  let expiringCount = 0
  const districtMap = new Map()
  const conclusionMap = new Map()
  const riskMap = new Map()

  records.forEach((record) => {
    const district = record.district || '未分配辖区'
    districtMap.set(district, (districtMap.get(district) || 0) + 1)

    const conclusion = record.conclusion || '未知'
    conclusionMap.set(conclusion, (conclusionMap.get(conclusion) || 0) + 1)

    const expired = isExpiredDate(record.expiryDate)
    const expiring = !expired && isExpiringDate(record.expiryDate, 30)

    if (expired) expiredCount += 1
    if (expiring) expiringCount += 1

    if (expired || expiring) {
      const enterpriseName = record.enterpriseName || '未命名企业'
      if (!riskMap.has(enterpriseName)) {
        riskMap.set(enterpriseName, {
          enterpriseName,
          district: record.district || '',
          expiredCount: 0,
          expiringCount: 0,
          latestExpiryDate: formatDate(record.expiryDate),
          phone: ''
        })
      }
      const current = riskMap.get(enterpriseName)
      if (expired) current.expiredCount += 1
      if (expiring) current.expiringCount += 1

      const currentDate = formatDate(record.expiryDate)
      if (!current.latestExpiryDate || currentDate < current.latestExpiryDate) {
        current.latestExpiryDate = currentDate
      }
    }
  })

  const enterprisePhoneMap = new Map()
  enterprises.forEach((item) => {
    const name = item.companyName || item.enterpriseName
    if (name) {
      enterprisePhoneMap.set(name, item.phone || item.contactPhone || item.legalPersonPhone || '')
    }
  })

  const focusEnterprises = Array.from(riskMap.values())
    .map((item) => ({
      ...item,
      phone: enterprisePhoneMap.get(item.enterpriseName) || item.phone
    }))
    .sort((a, b) => {
      if (b.expiredCount !== a.expiredCount) return b.expiredCount - a.expiredCount
      if (b.expiringCount !== a.expiringCount) return b.expiringCount - a.expiringCount
      return a.enterpriseName.localeCompare(b.enterpriseName)
    })
    .slice(0, 8)

  const recentRecords = records.slice(0, 8).map((item) => ({
    _id: item._id,
    certNo: item.certNo || '',
    factoryNo: item.factoryNo || '',
    enterpriseName: item.enterpriseName || '',
    district: item.district || '',
    conclusion: item.conclusion || '',
    verificationDate: formatDate(item.verificationDate),
    expiryDate: formatDate(item.expiryDate)
  }))

  return {
    summary: {
      totalRecords: records.length,
      expiredCount,
      expiringCount,
      enterpriseCount: focusEnterprises.length
    },
    recentRecords,
    districtStats: Array.from(districtMap.entries()).map(([name, value]) => ({ name, value })),
    conclusionStats: Array.from(conclusionMap.entries()).map(([name, value]) => ({ name, value })),
    focusEnterprises
  }
}

async function handleGetRecords(payload = {}) {
  const admin = payload.admin || {}
  const whereCondition = buildScopedRecordWhere(admin)
  const records = await fetchAll('pressure_records', whereCondition, 'createTime', 'desc')

  const keyword = payload.keyword || ''
  const district = payload.district || ''
  const enterpriseName = payload.enterpriseName || ''
  const conclusion = payload.conclusion || ''
  const filterType = payload.filterType || ''
  const page = Number(payload.page || 1)
  const pageSize = Number(payload.pageSize || 20)

  const filtered = records.filter((item) => {
    if (district && district !== '全部辖区' && item.district !== district) return false
    if (enterpriseName && enterpriseName !== '全部企业' && item.enterpriseName !== enterpriseName) return false
    if (conclusion && item.conclusion !== conclusion) return false

    const expired = isExpiredDate(item.expiryDate)
    const expiring = !expired && isExpiringDate(item.expiryDate, 30)
    if (filterType === 'expired' && !expired) return false
    if (filterType === 'expiring' && !expiring) return false
    if (filterType === 'risk' && !(expired || expiring)) return false

    return matchKeyword([
      item.certNo,
      item.factoryNo,
      item.sendUnit,
      item.enterpriseName,
      item.instrumentName,
      item.deviceName,
      item.equipmentName
    ], keyword)
  })

  const list = filtered
    .slice((page - 1) * pageSize, page * pageSize)
    .map((item) => ({
      _id: item._id,
      certNo: item.certNo || '',
      factoryNo: item.factoryNo || '',
      enterpriseName: item.enterpriseName || '',
      instrumentName: item.instrumentName || '',
      district: item.district || '',
      conclusion: item.conclusion || '',
      verificationDate: formatDate(item.verificationDate),
      expiryDate: formatDate(item.expiryDate),
      sendUnit: item.sendUnit || '',
      equipmentName: item.equipmentName || item.deviceName || ''
    }))

  const enterpriseOptions = Array.from(new Set(records.map((item) => item.enterpriseName).filter(Boolean))).sort()

  return {
    list,
    total: filtered.length,
    page,
    pageSize,
    enterpriseOptions
  }
}

async function handleGetEnterprises(payload = {}) {
  const admin = payload.admin || {}
  const whereCondition = buildScopedWhere(admin)
  const recordWhereCondition = buildScopedRecordWhere(admin)
  const [records, enterprises] = await Promise.all([
    fetchAll('pressure_records', recordWhereCondition, 'createTime', 'desc'),
    fetchAll('enterprises', whereCondition, 'createTime', 'desc')
  ])

  const keyword = payload.keyword || ''
  const recordMap = new Map()

  records.forEach((record) => {
    const enterpriseName = record.enterpriseName || '未命名企业'
    if (!recordMap.has(enterpriseName)) {
      recordMap.set(enterpriseName, {
        totalRecords: 0,
        expiredCount: 0,
        expiringCount: 0
      })
    }

    const current = recordMap.get(enterpriseName)
    current.totalRecords += 1
    if (isExpiredDate(record.expiryDate)) current.expiredCount += 1
    else if (isExpiringDate(record.expiryDate, 30)) current.expiringCount += 1
  })

  const list = enterprises
    .map((item) => {
      const companyName = item.companyName || item.enterpriseName || ''
      const stats = recordMap.get(companyName) || {
        totalRecords: 0,
        expiredCount: 0,
        expiringCount: 0
      }
      return {
        _id: item._id,
        companyName,
        district: item.district || '',
        phone: item.phone || item.contactPhone || item.legalPersonPhone || '',
        contact: item.contact || item.legalPerson || '',
        creditCode: item.creditCode || '',
        totalRecords: stats.totalRecords,
        expiredCount: stats.expiredCount,
        expiringCount: stats.expiringCount,
        createdAt: formatDate(item.createTime || item.createdAt)
      }
    })
    .filter((item) => matchKeyword([
      item.companyName,
      item.contact,
      item.phone,
      item.district,
      item.creditCode
    ], keyword))
    .sort((a, b) => {
      if (b.expiredCount !== a.expiredCount) return b.expiredCount - a.expiredCount
      if (b.expiringCount !== a.expiringCount) return b.expiringCount - a.expiringCount
      return a.companyName.localeCompare(b.companyName)
    })

  return { list }
}

exports.main = async (event) => {
  try {
    if (process.env.WEB_ADMIN_ENABLED !== 'true') {
      throw new Error('网页监管接口已停用，请使用小程序安全数据接口')
    }
    const action = event.action
    const payload = event.payload || {}
    let data = null

    if (action === 'login') data = await handleLogin(payload)
    else if (action === 'changePassword') data = await handleChangePassword(payload)
    else if (action === 'getDashboard') data = await handleGetDashboard(payload)
    else if (action === 'getRecords') data = await handleGetRecords(payload)
    else if (action === 'getEnterprises') data = await handleGetEnterprises(payload)
    else if (action === 'enterpriseLogin') data = await handleEnterpriseLogin(payload)
    else if (action === 'enterpriseRegister') data = await handleEnterpriseRegister(payload)
    else if (action === 'getEnterpriseDashboard') data = await handleGetEnterpriseDashboard(payload)
    else if (action === 'getEnterpriseEquipments') data = await handleGetEnterpriseEquipments(payload)
    else if (action === 'saveEnterpriseEquipment') data = await handleSaveEnterpriseEquipment(payload)
    else if (action === 'deleteEnterpriseEquipment') data = await handleDeleteEnterpriseEquipment(payload)
    else if (action === 'getEnterpriseGauges') data = await handleGetEnterpriseGauges(payload)
    else if (action === 'getEnterpriseRecords') data = await handleGetEnterpriseRecords(payload)
    else if (action === 'saveEnterpriseAiRecord') data = await handleSaveEnterpriseAiRecord(payload)
    else throw new Error('不支持的操作类型')

    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      message: error.message || '网页监管接口调用失败'
    }
  }
}
