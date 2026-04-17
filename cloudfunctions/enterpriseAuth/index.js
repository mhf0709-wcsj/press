const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event) => {
  const { action } = event || {}

  try {
    if (action === 'wechatLogin') {
      return await wechatLogin()
    }

    if (action === 'bindEnterprise') {
      return await bindEnterprise(event)
    }

    return {
      success: false,
      error: 'Unknown action'
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Service error'
    }
  }
}

async function wechatLogin() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    throw new Error('Missing openid')
  }

  const res = await db.collection('enterprises')
    .where({ openid })
    .limit(1)
    .get()

  if (!res.data || !res.data.length) {
    return {
      success: true,
      registered: false
    }
  }

  const enterprise = res.data[0]
  await db.collection('enterprises').doc(enterprise._id).update({
    data: {
      lastLoginTime: new Date(),
      authType: 'wechat',
      updateTime: new Date()
    }
  })

  return {
    success: true,
    registered: true,
    enterprise: sanitizeEnterprise({
      ...enterprise,
      authType: 'wechat',
      lastLoginTime: new Date()
    })
  }
}

async function bindEnterprise(event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const {
    companyName = '',
    creditCode = '',
    legalPerson = '',
    phone = '',
    district = ''
  } = event || {}

  if (!openid) throw new Error('Missing openid')

  const company = companyName.trim()
  const code = creditCode.trim().toUpperCase()
  const leader = legalPerson.trim()
  const mobile = phone.trim()
  const districtName = district.trim()

  if (!company) throw new Error('请输入企业名称')
  if (!code || code.length !== 18) throw new Error('请输入正确的统一社会信用代码')
  if (!leader) throw new Error('请输入企业法人')
  if (!/^1[3-9]\d{9}$/.test(mobile)) throw new Error('请输入正确的法人手机号')
  if (!districtName) throw new Error('请选择所在辖区')

  const openidRes = await db.collection('enterprises')
    .where({ openid })
    .limit(1)
    .get()
  if (openidRes.data && openidRes.data.length) {
    return {
      success: true,
      registered: true,
      enterprise: sanitizeEnterprise(openidRes.data[0])
    }
  }

  const companyRes = await db.collection('enterprises')
    .where({ companyName: company })
    .limit(1)
    .get()
  if (companyRes.data && companyRes.data.length) {
    throw new Error('该企业已存在，请联系管理员处理绑定')
  }

  const creditRes = await db.collection('enterprises')
    .where({ creditCode: code })
    .limit(1)
    .get()
  if (creditRes.data && creditRes.data.length) {
    throw new Error('该统一社会信用代码已存在')
  }

  const phoneRes = await db.collection('enterprises')
    .where({ phone: mobile })
    .limit(1)
    .get()
  if (phoneRes.data && phoneRes.data.length) {
    throw new Error('该手机号已被其他企业使用')
  }

  const now = new Date()
  const addRes = await db.collection('enterprises').add({
    data: {
      companyName: company,
      creditCode: code,
      legalPerson: leader,
      phone: mobile,
      district: districtName,
      openid,
      authType: 'wechat',
      bindTime: now,
      createTime: now,
      updateTime: now,
      lastLoginTime: now
    }
  })

  const docRes = await db.collection('enterprises').doc(addRes._id).get()
  return {
    success: true,
    registered: true,
    enterprise: sanitizeEnterprise(docRes.data)
  }
}

function sanitizeEnterprise(item) {
  if (!item) return null
  const { openid, _openid, ...rest } = item
  return rest
}
