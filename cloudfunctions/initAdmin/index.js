const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ITERATIONS = 120000

exports.main = async (event = {}) => {
  try {
    const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET || ''
    const username = String(process.env.INITIAL_ADMIN_USERNAME || '').trim()
    const password = String(process.env.INITIAL_ADMIN_PASSWORD || '')

    if (!bootstrapSecret || event.bootstrapSecret !== bootstrapSecret) {
      throw new Error('初始化密钥无效')
    }
    if (!username || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new Error('请配置 INITIAL_ADMIN_USERNAME 和符合强度要求的 INITIAL_ADMIN_PASSWORD')
    }

    const existingRes = await db.collection('admins').where({ username }).limit(1).get()
    if (existingRes.data?.length) return { success: true, created: false, message: '管理员账号已存在' }

    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('hex')
    const now = new Date()
    const createResult = await db.collection('admins').add({
      data: {
        username,
        passwordHash,
        passwordSalt: salt,
        passwordIterations: ITERATIONS,
        role: 'admin',
        failedLoginCount: 0,
        createTime: now,
        updateTime: now
      }
    })

    return {
      success: true,
      created: true,
      message: '管理员账号创建成功',
      data: { _id: createResult._id, username, role: 'admin' }
    }
  } catch (error) {
    return { success: false, message: error.message || '初始化失败' }
  }
}
