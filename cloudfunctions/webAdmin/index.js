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
    isDeleted: _.neq(true)
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
    const action = event.action
    const payload = event.payload || {}
    let data = null

    if (action === 'login') data = await handleLogin(payload)
    else if (action === 'changePassword') data = await handleChangePassword(payload)
    else if (action === 'getDashboard') data = await handleGetDashboard(payload)
    else if (action === 'getRecords') data = await handleGetRecords(payload)
    else if (action === 'getEnterprises') data = await handleGetEnterprises(payload)
    else throw new Error('不支持的操作类型')

    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      message: error.message || '网页监管接口调用失败'
    }
  }
}
