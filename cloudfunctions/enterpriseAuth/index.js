const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const PASSWORD_ITERATIONS = 120000
const MAX_LOGIN_FAILURES = 5
const LOCK_TIME_MS = 15 * 60 * 1000

exports.main = async (event = {}) => {
  try {
    const handlers = {
      wechatLogin,
      bindEnterprise,
      adminLogin,
      validateAdminSession,
      changeAdminPassword,
      adminLogout
    }
    const handler = handlers[event.action]
    if (!handler) throw new Error('不支持的鉴权操作')
    return { success: true, ...(await handler(event)) }
  } catch (error) {
    return { success: false, error: error.message || '鉴权服务异常' }
  }
}

async function wechatLogin() {
  const openid = requireOpenid()
  const res = await db.collection('enterprises').where({ openid }).limit(1).get()
  if (!res.data?.length) return { registered: false }

  const enterprise = res.data[0]
  await db.collection('enterprises').doc(enterprise._id).update({
    data: { lastLoginTime: new Date(), authType: 'wechat', updateTime: new Date() }
  })
  return { registered: true, enterprise: sanitizeEnterprise(enterprise) }
}

async function bindEnterprise(event) {
  const openid = requireOpenid()
  const companyName = clean(event.companyName)
  const creditCode = clean(event.creditCode).toUpperCase()
  const legalPerson = clean(event.legalPerson)
  const phone = clean(event.phone)
  const district = clean(event.district)

  if (!companyName) throw new Error('请输入企业名称')
  if (!/^[A-Z0-9]{18}$/.test(creditCode)) throw new Error('请输入正确的统一社会信用代码')
  if (!legalPerson) throw new Error('请输入企业法人')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入正确的法人手机号')
  if (!district) throw new Error('请选择所在辖区')

  const boundRes = await db.collection('enterprises').where({ openid }).limit(1).get()
  if (boundRes.data?.length) {
    return { registered: true, enterprise: sanitizeEnterprise(boundRes.data[0]) }
  }

  const creditRes = await db.collection('enterprises').where({ creditCode }).limit(2).get()
  const existing = creditRes.data?.[0]
  const now = new Date()

  if (existing) {
    if (existing.openid && existing.openid !== openid) throw new Error('该企业已绑定其他微信账号，请联系管理员')
    if (clean(existing.companyName) !== companyName || clean(existing.phone) !== phone) {
      throw new Error('企业名称、信用代码或法人手机号核验不一致')
    }
    await db.collection('enterprises').doc(existing._id).update({
      data: { openid, legalPerson, district, authType: 'wechat', bindTime: now, lastLoginTime: now, updateTime: now }
    })
    return {
      registered: true,
      enterprise: sanitizeEnterprise({ ...existing, openid, legalPerson, district })
    }
  }

  const [companyRes, phoneRes] = await Promise.all([
    db.collection('enterprises').where({ companyName }).limit(1).get(),
    db.collection('enterprises').where({ phone }).limit(1).get()
  ])
  if (companyRes.data?.length || phoneRes.data?.length) throw new Error('企业名称或手机号已存在，请联系管理员核验')

  const addRes = await db.collection('enterprises').add({
    data: {
      companyName,
      creditCode,
      legalPerson,
      phone,
      district,
      openid,
      authType: 'wechat',
      bindTime: now,
      createTime: now,
      updateTime: now,
      lastLoginTime: now
    }
  })
  return {
    registered: true,
    enterprise: sanitizeEnterprise({ _id: addRes._id, companyName, creditCode, legalPerson, phone, district })
  }
}

async function adminLogin(event) {
  const username = clean(event.username)
  const password = String(event.password || '')
  if (!username || !password) throw new Error('请输入用户名和密码')

  const res = await db.collection('admins').where({ username }).limit(1).get()
  const admin = res.data?.[0]
  if (!admin) throw new Error('用户名或密码错误')

  const lockedUntil = toDate(admin.lockedUntil)
  if (lockedUntil && lockedUntil.getTime() > Date.now()) throw new Error('登录失败次数过多，请稍后再试')

  const valid = verifyStoredPassword(password, admin)
  if (!valid) {
    const failedLoginCount = Number(admin.failedLoginCount || 0) + 1
    const update = { failedLoginCount, updateTime: new Date() }
    if (failedLoginCount >= MAX_LOGIN_FAILURES) update.lockedUntil = new Date(Date.now() + LOCK_TIME_MS)
    await db.collection('admins').doc(admin._id).update({ data: update })
    throw new Error('用户名或密码错误')
  }

  const updateData = {
    failedLoginCount: 0,
    lockedUntil: _.remove(),
    lastLoginTime: new Date(),
    updateTime: new Date()
  }
  if (!admin.passwordHash) {
    const passwordData = hashPassword(password)
    updateData.passwordHash = passwordData.hash
    updateData.passwordSalt = passwordData.salt
    updateData.passwordIterations = passwordData.iterations
    updateData.password = _.remove()
  }
  await db.collection('admins').doc(admin._id).update({ data: updateData })

  const token = crypto.randomBytes(32).toString('hex')
  await createAdminSession({
    tokenHash: sha256(token),
    adminId: admin._id,
    username: admin.username,
    role: admin.role || 'admin',
    district: admin.district || '',
    openid: cloud.getWXContext().OPENID || '',
    createTime: new Date(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS)
  })

  return { token, admin: sanitizeAdmin(admin) }
}

async function validateAdminSession(event) {
  const session = await getAdminSession(event.token)
  return { valid: true, admin: sanitizeAdmin(session) }
}

async function changeAdminPassword(event) {
  const oldPassword = String(event.oldPassword || '')
  const newPassword = String(event.newPassword || '')
  if (newPassword.length < 8) throw new Error('新密码至少需要 8 位')
  if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) throw new Error('新密码必须同时包含字母和数字')

  let admin = null
  if (event.token) {
    const session = await getAdminSession(event.token)
    const adminRes = await db.collection('admins').doc(session.adminId).get()
    admin = adminRes.data
  } else {
    const username = clean(event.username)
    if (!username) throw new Error('请输入用户名')
    const adminRes = await db.collection('admins').where({ username }).limit(1).get()
    admin = adminRes.data?.[0]
  }
  if (!admin || !verifyStoredPassword(oldPassword, admin)) throw new Error('原密码错误')

  const passwordData = hashPassword(newPassword)
  await db.collection('admins').doc(admin._id).update({
    data: {
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      passwordIterations: passwordData.iterations,
      password: _.remove(),
      passwordChangedAt: new Date(),
      updateTime: new Date()
    }
  })
  await db.collection('auth_sessions').where({ adminId: admin._id }).remove()
  return { changed: true }
}

async function adminLogout(event) {
  if (event.token) {
    await db.collection('auth_sessions').where({ tokenHash: sha256(event.token) }).remove()
  }
  return { loggedOut: true }
}

async function getAdminSession(token) {
  if (!token) throw new Error('管理端登录已失效')
  const res = await db.collection('auth_sessions').where({ tokenHash: sha256(token) }).limit(1).get()
  const session = res.data?.[0]
  const expiresAt = toDate(session?.expiresAt)
  if (!session || !expiresAt || expiresAt.getTime() <= Date.now()) throw new Error('管理端登录已失效，请重新登录')
  return session
}

async function createAdminSession(data) {
  try {
    return await db.collection('auth_sessions').add({ data })
  } catch (error) {
    const missingCollection = /collection.*not exist|COLLECTION_NOT_EXIST|集合不存在/i.test(error.message || '')
    if (!missingCollection || typeof db.createCollection !== 'function') throw error
    try {
      await db.createCollection('auth_sessions')
    } catch (createError) {
      if (!/already exists|已存在/i.test(createError.message || '')) throw createError
    }
    return db.collection('auth_sessions').add({ data })
  }
}

function requireOpenid() {
  const openid = cloud.getWXContext().OPENID
  if (!openid) throw new Error('无法获取微信身份，请重新进入小程序')
  return openid
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex'), iterations = PASSWORD_ITERATIONS) {
  return {
    salt,
    iterations,
    hash: crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex')
  }
}

function verifyStoredPassword(password, admin) {
  if (admin.passwordHash && admin.passwordSalt) {
    const candidate = hashPassword(password, admin.passwordSalt, Number(admin.passwordIterations || PASSWORD_ITERATIONS)).hash
    const left = Buffer.from(candidate, 'hex')
    const right = Buffer.from(admin.passwordHash, 'hex')
    return left.length === right.length && crypto.timingSafeEqual(left, right)
  }
  return typeof admin.password === 'string' && admin.password === password
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function clean(value) {
  return String(value || '').trim()
}

function sanitizeEnterprise(item) {
  if (!item) return null
  const { openid, _openid, ...rest } = item
  return rest
}

function sanitizeAdmin(item) {
  return {
    _id: item.adminId || item._id || '',
    username: item.username || '',
    role: item.role || 'admin',
    district: item.district || ''
  }
}
