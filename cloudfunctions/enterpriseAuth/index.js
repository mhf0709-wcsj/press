const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const PASSWORD_ITERATIONS = 120000
const MAX_LOGIN_FAILURES = 5
const LOCK_TIME_MS = 15 * 60 * 1000
const ALLOWED_DISTRICTS = ['大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所']

exports.main = async (event = {}) => {
  try {
    const handlers = {
      wechatLogin,
      bindEnterprise,
      updateEnterpriseProfile,
      adminLogin,
      validateAdminSession,
      changeAdminPassword,
      adminLogout,
      reviewEnterprise,
      listDistrictAdmins,
      createDistrictAdmin,
      updateDistrictAdmin,
      deleteDistrictAdmin
    }
    const handler = handlers[event.action]
    if (!handler) throw new Error('不支持的鉴权操作')
    return { success: true, ...(await handler(event)) }
  } catch (error) {
    return { success: false, error: error.message || '鉴权服务异常' }
  }
}

async function updateEnterpriseProfile(event) {
  const openid = requireOpenid()
  const legalPerson = clean(event.legalPerson)
  const phone = clean(event.phone)
  const district = clean(event.district)

  if (!legalPerson) throw new Error('请输入企业法人')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入正确的联系电话')
  if (!ALLOWED_DISTRICTS.includes(district)) throw new Error('请选择正确的所在辖区')

  const res = await db.collection('enterprises').where({ openid }).limit(1).get()
  const enterprise = res.data?.[0]
  if (!enterprise) throw new Error('未找到当前企业资料，请重新登录')
  if (normalizeApprovalStatus(enterprise) !== 'approved') throw new Error('企业账号尚未通过审核')

  await assertEnterpriseFieldsAvailable({
    companyName: clean(enterprise.companyName),
    creditCode: clean(enterprise.creditCode).toUpperCase(),
    phone,
    excludeId: enterprise._id
  })

  const updateTime = new Date()
  const updateData = { legalPerson, phone, district, updateTime }
  await db.collection('enterprises').doc(enterprise._id).update({ data: updateData })

  return {
    enterprise: sanitizeEnterprise({
      ...enterprise,
      ...updateData,
      approvalStatus: 'approved'
    })
  }
}

async function wechatLogin() {
  const openid = requireOpenid()
  const res = await db.collection('enterprises').where({ openid }).limit(1).get()
  if (!res.data?.length) return { registered: false }

  const enterprise = res.data[0]
  const approvalStatus = normalizeApprovalStatus(enterprise)
  if (approvalStatus !== 'approved') {
    return {
      registered: false,
      approvalStatus,
      companyName: enterprise.companyName || '',
      reviewReason: enterprise.reviewReason || ''
    }
  }
  await db.collection('enterprises').doc(enterprise._id).update({
    data: { lastLoginTime: new Date(), authType: 'wechat', updateTime: new Date() }
  })
  return {
    registered: true,
    approvalStatus,
    enterprise: sanitizeEnterprise({ ...enterprise, approvalStatus })
  }
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
    const boundEnterprise = boundRes.data[0]
    const approvalStatus = normalizeApprovalStatus(boundEnterprise)
    if (approvalStatus === 'approved') {
      return { registered: true, approvalStatus, enterprise: sanitizeEnterprise(boundEnterprise) }
    }

    await assertEnterpriseFieldsAvailable({
      companyName,
      creditCode,
      phone,
      excludeId: boundEnterprise._id
    })
    const updateData = {
      companyName,
      creditCode,
      legalPerson,
      phone,
      district,
      approvalStatus: 'pending',
      submittedAt: new Date(),
      updateTime: new Date(),
      reviewReason: _.remove(),
      reviewedAt: _.remove(),
      reviewedBy: _.remove()
    }
    await db.collection('enterprises').doc(boundEnterprise._id).update({ data: updateData })
    return { registered: false, pendingReview: true, approvalStatus: 'pending', companyName }
  }

  const creditRes = await db.collection('enterprises').where({ creditCode }).limit(2).get()
  const existing = creditRes.data?.[0]
  const now = new Date()

  if (existing) {
    if (existing.openid && existing.openid !== openid) throw new Error('该企业已绑定其他微信账号，请联系管理员')
    if (clean(existing.companyName) !== companyName || clean(existing.phone) !== phone) {
      throw new Error('企业名称、信用代码或法人手机号核验不一致')
    }

    const approvalStatus = normalizeApprovalStatus(existing)
    const nextStatus = approvalStatus === 'approved' ? 'approved' : 'pending'
    await db.collection('enterprises').doc(existing._id).update({
      data: {
        openid,
        legalPerson,
        district,
        authType: 'wechat',
        bindTime: now,
        approvalStatus: nextStatus,
        submittedAt: nextStatus === 'pending' ? now : (existing.submittedAt || now),
        lastLoginTime: nextStatus === 'approved' ? now : (existing.lastLoginTime || null),
        updateTime: now,
        ...(nextStatus === 'pending' ? {
          reviewReason: _.remove(),
          reviewedAt: _.remove(),
          reviewedBy: _.remove()
        } : {})
      }
    })

    if (nextStatus === 'pending') {
      return { registered: false, pendingReview: true, approvalStatus: 'pending', companyName }
    }
    return {
      registered: true,
      approvalStatus: 'approved',
      enterprise: sanitizeEnterprise({ ...existing, openid, legalPerson, district, approvalStatus: 'approved' })
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
      approvalStatus: 'pending',
      submittedAt: now,
      createTime: now,
      updateTime: now
    }
  })
  return {
    registered: false,
    pendingReview: true,
    approvalStatus: 'pending',
    companyName,
    enterpriseId: addRes._id
  }
}

async function reviewEnterprise(event) {
  const session = await getAdminSession(event.adminToken)
  const enterpriseId = clean(event.enterpriseId)
  const decision = clean(event.decision)
  const reason = clean(event.reason)
  if (!enterpriseId) throw new Error('缺少企业ID')
  if (!['approved', 'rejected'].includes(decision)) throw new Error('不支持的审核结果')
  if (decision === 'rejected' && !reason) throw new Error('请填写驳回原因')

  const enterpriseRes = await db.collection('enterprises').doc(enterpriseId).get()
  const enterprise = enterpriseRes.data
  if (!enterprise) throw new Error('企业不存在')
  if (session.role === 'district' && session.district && clean(enterprise.district) !== clean(session.district)) {
    throw new Error('无权审核其他辖区企业')
  }

  const now = new Date()
  const updateData = {
    approvalStatus: decision,
    reviewReason: decision === 'rejected' ? reason : _.remove(),
    reviewedAt: now,
    reviewedBy: session.username || '',
    updateTime: now
  }
  await db.collection('enterprises').doc(enterpriseId).update({ data: updateData })
  return {
    approvalStatus: decision,
    enterprise: sanitizeEnterprise({
      ...enterprise,
      approvalStatus: decision,
      reviewReason: decision === 'rejected' ? reason : '',
      reviewedAt: now,
      reviewedBy: session.username || '',
      updateTime: now
    })
  }
}

async function assertEnterpriseFieldsAvailable({ companyName, creditCode, phone, excludeId }) {
  const [companyRes, creditRes, phoneRes] = await Promise.all([
    db.collection('enterprises').where({ companyName }).limit(2).get(),
    db.collection('enterprises').where({ creditCode }).limit(2).get(),
    db.collection('enterprises').where({ phone }).limit(2).get()
  ])
  const conflicts = [companyRes, creditRes, phoneRes]
    .flatMap((item) => item.data || [])
    .filter((item) => item._id !== excludeId)
  if (conflicts.length) throw new Error('企业名称、信用代码或手机号已存在，请联系管理员核验')
}

async function listDistrictAdmins(event) {
  await requireSuperAdmin(event.adminToken)
  const res = await db.collection('admins').where({ role: 'district' }).limit(100).get()
  const accounts = (res.data || [])
    .map(sanitizeManagedAdmin)
    .sort((left, right) => clean(left.district).localeCompare(clean(right.district), 'zh-CN') || clean(left.username).localeCompare(clean(right.username)))
  return { accounts }
}

async function createDistrictAdmin(event) {
  const operator = await requireSuperAdmin(event.adminToken)
  const username = validateManagedUsername(event.username)
  const district = validateManagedDistrict(event.district)
  const password = validateManagedPassword(event.password)

  const existing = await db.collection('admins').where({ username }).limit(1).get()
  if (existing.data?.length) throw new Error('用户名已存在')

  const passwordData = hashPassword(password)
  const now = new Date()
  const addRes = await db.collection('admins').add({
    data: {
      username,
      role: 'district',
      district,
      status: 'active',
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      passwordIterations: passwordData.iterations,
      createdBy: operator.username || '',
      createTime: now,
      updateTime: now
    }
  })
  return {
    account: sanitizeManagedAdmin({
      _id: addRes._id,
      username,
      role: 'district',
      district,
      status: 'active',
      createTime: now,
      updateTime: now
    })
  }
}

async function updateDistrictAdmin(event) {
  await requireSuperAdmin(event.adminToken)
  const accountId = clean(event.accountId)
  if (!accountId) throw new Error('缺少辖区账号ID')

  const currentRes = await db.collection('admins').doc(accountId).get()
  const current = currentRes.data
  if (!current || current.role !== 'district') throw new Error('辖区账号不存在')

  const username = validateManagedUsername(event.username)
  const district = validateManagedDistrict(event.district)
  const password = String(event.password || '')
  const duplicateRes = await db.collection('admins').where({ username }).limit(2).get()
  if ((duplicateRes.data || []).some((item) => item._id !== accountId)) throw new Error('用户名已存在')

  const updateData = { username, district, updateTime: new Date() }
  if (password) {
    const passwordData = hashPassword(validateManagedPassword(password))
    updateData.passwordHash = passwordData.hash
    updateData.passwordSalt = passwordData.salt
    updateData.passwordIterations = passwordData.iterations
    updateData.password = _.remove()
    updateData.passwordChangedAt = new Date()
  }

  await db.collection('admins').doc(accountId).update({ data: updateData })
  await db.collection('auth_sessions').where({ adminId: accountId }).remove()
  return { account: sanitizeManagedAdmin({ ...current, ...updateData }) }
}

async function deleteDistrictAdmin(event) {
  await requireSuperAdmin(event.adminToken)
  const accountId = clean(event.accountId)
  if (!accountId) throw new Error('缺少辖区账号ID')

  const currentRes = await db.collection('admins').doc(accountId).get()
  const current = currentRes.data
  if (!current || current.role !== 'district') throw new Error('辖区账号不存在')

  await db.collection('auth_sessions').where({ adminId: accountId }).remove()
  await db.collection('admins').doc(accountId).remove()
  return { deleted: true, accountId }
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
  const currentOpenid = cloud.getWXContext().OPENID || ''
  if (session.openid && currentOpenid && session.openid !== currentOpenid) throw new Error('管理端会话与当前微信账号不匹配')
  return session
}

async function requireSuperAdmin(token) {
  const session = await getAdminSession(token)
  if (!['admin', 'super_admin'].includes(session.role)) throw new Error('仅总管理员可以管理辖区账号')
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

function validateManagedUsername(value) {
  const username = clean(value)
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) throw new Error('用户名需为 3-32 位字母、数字、下划线或短横线')
  return username
}

function validateManagedDistrict(value) {
  const district = clean(value)
  if (!ALLOWED_DISTRICTS.includes(district)) throw new Error('请选择正确的管理辖区')
  return district
}

function validateManagedPassword(value) {
  const password = String(value || '')
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('密码至少 8 位并同时包含字母和数字')
  }
  return password
}

function normalizeApprovalStatus(enterprise) {
  const status = clean(enterprise?.approvalStatus)
  return ['pending', 'approved', 'rejected'].includes(status) ? status : 'approved'
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

function sanitizeManagedAdmin(item) {
  return {
    _id: item._id || '',
    username: item.username || '',
    role: 'district',
    district: item.district || '',
    status: item.status || 'active',
    lastLoginTime: item.lastLoginTime || null,
    createTime: item.createTime || null,
    updateTime: item.updateTime || null
  }
}
