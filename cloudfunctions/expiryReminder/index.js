// 到期提醒云函数
// 功能：查询临期/已过期的压力表记录，支持企业和管理员两种模式
// 支持微信订阅消息提醒和短信提醒

const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, enterpriseName, days = 30, district, openid, templateId, data } = event
  
  console.log('=== 到期提醒云函数调用 ===')
  console.log('action:', action)
  console.log('district:', district)
  console.log('days:', days)
  
  switch (action) {
    case 'getEnterpriseExpiring':
      // 获取单个企业的临期记录
      return await getEnterpriseExpiring(enterpriseName, days)
    
    case 'getAllExpiring':
      // 获取所有企业的临期记录（管理员用）
      return await getAllExpiring(days, district)
    
    case 'getExpiringSummary':
      // 获取临期汇总统计（管理员用）
      return await getExpiringSummary(days, district)
    
    case 'sendWxSubscribeMessage':
      // 发送微信订阅消息
      return await sendWxSubscribeMessage(event)
    
    case 'sendSmsReminder':
      // 发送短信提醒（预留接口）
      return await sendSmsReminder(event)
    
    case 'batchSendReminder':
      // 批量发送提醒（微信+短信）
      return await batchSendReminder(event)
    
    default:
      return { success: false, error: '未知操作' }
  }
}

/**
 * 获取单个企业的临期记录
 * @param {string} enterpriseName - 企业名称
 * @param {number} days - 提前天数，默认30天
 */
async function getEnterpriseExpiring(enterpriseName, days) {
  try {
    const now = new Date()
    const expiryThreshold = new Date()
    expiryThreshold.setDate(now.getDate() + days)
    
    // 格式化日期
    const nowStr = formatDate(now)
    const thresholdStr = formatDate(expiryThreshold)
    
    console.log(`查询企业 ${enterpriseName} 的临期记录，当前日期: ${nowStr}, 阈值日期: ${thresholdStr}`)
    
    // 查询已过期和即将过期的记录
    const expiredResult = await db.collection('pressure_records')
      .where({
        enterpriseName: enterpriseName,
        expiryDate: _.lt(nowStr),
        status: 'valid'
      })
      .orderBy('expiryDate', 'asc')
      .limit(100)
      .get()
    
    const expiringResult = await db.collection('pressure_records')
      .where({
        enterpriseName: enterpriseName,
        expiryDate: _.gte(nowStr).and(_.lte(thresholdStr)),
        status: 'valid'
      })
      .orderBy('expiryDate', 'asc')
      .limit(100)
      .get()
    
    // 更新已过期记录的状态
    if (expiredResult.data.length > 0) {
      const expiredIds = expiredResult.data.map(item => item._id)
      await db.collection('pressure_records')
        .where({
          _id: _.in(expiredIds)
        })
        .update({
          data: { status: 'expired' }
        })
    }
    
    return {
      success: true,
      data: {
        expired: expiredResult.data,       // 已过期
        expiring: expiringResult.data,     // 即将过期
        expiredCount: expiredResult.data.length,
        expiringCount: expiringResult.data.length,
        totalCount: expiredResult.data.length + expiringResult.data.length
      }
    }
  } catch (err) {
    console.error('查询企业临期记录失败:', err)
    return { success: false, error: err.message }
  }
}

/**
 * 获取所有企业的临期记录（管理员用）
 * @param {number} days - 提前天数
 * @param {string} district - 辖区（可选）
 */
async function getAllExpiring(days, district) {
  try {
    const now = new Date()
    const expiryThreshold = new Date()
    expiryThreshold.setDate(now.getDate() + days)
    
    const nowStr = formatDate(now)
    const thresholdStr = formatDate(expiryThreshold)
    
    console.log('查询到期记录，当前日期:', nowStr, '阈值日期:', thresholdStr)
    console.log('辖区过滤:', district || '全部')
    
    // 构建查询条件
    let baseCondition = {}
    if (district) {
      baseCondition.district = district
    }
    
    // 查询已过期记录
    const expiredCondition = { ...baseCondition, expiryDate: _.lt(nowStr), status: _.in(['valid', 'expired']) }
    console.log('已过期查询条件:', JSON.stringify(expiredCondition))
    
    const expiredResult = await db.collection('pressure_records')
      .where(expiredCondition)
      .orderBy('expiryDate', 'asc')
      .limit(1000)
      .get()
    
    console.log('已过期记录数:', expiredResult.data.length)
    
    // 查询即将过期记录
    const expiringCondition = { ...baseCondition, expiryDate: _.gte(nowStr).and(_.lte(thresholdStr)), status: 'valid' }
    const expiringResult = await db.collection('pressure_records')
      .where(expiringCondition)
      .orderBy('expiryDate', 'asc')
      .limit(1000)
      .get()
    
    // 按企业分组统计
    const enterpriseStats = {}
    const processRecords = (records, type) => {
      records.forEach(record => {
        const name = record.enterpriseName || '未知企业'
        if (!enterpriseStats[name]) {
          enterpriseStats[name] = {
            enterpriseName: name,
            expired: [],
            expiring: [],
            expiredCount: 0,
            expiringCount: 0
          }
        }
        enterpriseStats[name][type].push(record)
        enterpriseStats[name][type + 'Count']++
      })
    }
    
    processRecords(expiredResult.data, 'expired')
    processRecords(expiringResult.data, 'expiring')
    
    return {
      success: true,
      data: {
        records: {
          expired: expiredResult.data,
          expiring: expiringResult.data
        },
        enterpriseStats: Object.values(enterpriseStats),
        summary: {
          expiredCount: expiredResult.data.length,
          expiringCount: expiringResult.data.length,
          enterpriseCount: Object.keys(enterpriseStats).length
        }
      }
    }
  } catch (err) {
    console.error('查询所有临期记录失败:', err)
    return { success: false, error: err.message }
  }
}

/**
 * 获取临期汇总统计（管理员用）
 * @param {number} days - 提前天数
 * @param {string} district - 辖区（可选）
 */
async function getExpiringSummary(days, district) {
  try {
    const result = await getAllExpiring(days, district)
    if (!result.success) return result
    
    const { enterpriseStats, summary } = result.data
    
    // 获取企业联系方式
    const enterpriseNames = enterpriseStats.map(e => e.enterpriseName).filter(name => name !== '未知企业')
    let enterpriseContacts = {}
    
    if (enterpriseNames.length > 0) {
      const enterprisesResult = await db.collection('enterprises')
        .where({
          companyName: _.in(enterpriseNames)
        })
        .field({ companyName: true, phone: true, legalPerson: true })
        .get()
      
      enterprisesResult.data.forEach(e => {
        enterpriseContacts[e.companyName] = {
          phone: e.phone || '',
          legalPerson: e.legalPerson || ''
        }
      })
    }
    
    // 为每个企业添加联系方式
    const enrichedStats = enterpriseStats.map(stat => ({
      ...stat,
      phone: enterpriseContacts[stat.enterpriseName]?.phone || '',
      legalPerson: enterpriseContacts[stat.enterpriseName]?.legalPerson || ''
    }))
    
    return {
      success: true,
      data: {
        summary,
        enterpriseStats: enrichedStats.sort((a, b) => 
          (b.expiredCount + b.expiringCount) - (a.expiredCount + a.expiringCount)
        )
      }
    }
  } catch (err) {
    console.error('获取临期汇总失败:', err)
    return { success: false, error: err.message }
  }
}

/**
 * 发送短信提醒（预留接口）
 * @param {object} event - 包含phones, content等信息
 */
async function sendSmsReminder(event) {
  const { phones, content, records } = event
  
  // TODO: 接入短信服务商API
  // 示例：阿里云短信、腾讯云短信等
  
  console.log('=== 短信提醒接口调用 ===')
  console.log('接收号码:', phones)
  console.log('提醒内容:', content)
  console.log('相关记录:', records?.length || 0, '条')
  
  // 预留短信发送逻辑
  // const smsResult = await sendSms({
  //   phones: phones,
  //   templateId: 'SMS_TEMPLATE_ID',
  //   params: {
  //     count: records?.length || 0,
  //     expiryDate: 'xxx'
  //   }
  // })
  
  return {
    success: true,
    message: '短信提醒接口已预留，请接入短信服务商',
    data: {
      phones,
      content,
      recordCount: records?.length || 0,
      // 短信发送结果将在此返回
      smsResult: null
    }
  }
}

/**
 * 发送微信订阅消息
 * @param {object} event - 包含touser, templateId, data等信息
 */
async function sendWxSubscribeMessage(event) {
  const { touser, templateId, page, data } = event
  
  console.log('=== 微信订阅消息发送 ===')
  console.log('接收用户:', touser)
  console.log('模板ID:', templateId)
  
  try {
    // 调用微信云开发的订阅消息发送接口
    const result = await cloud.openapi.subscribeMessage.send({
      touser: touser,
      templateId: templateId || 'TEMPLATE_ID_PLACEHOLDER', // 需要在微信公众平台申请
      page: page || 'pages/archive/archive',
      data: data || {
        thing1: { value: '压力表到期提醒' },
        thing2: { value: '您有压力表即将到期' },
        date3: { value: formatDate(new Date()) },
        thing4: { value: '请及时处理' }
      },
      miniprogramState: 'formal' // formal: 正式版, developer: 开发版, trial: 体验版
    })
    
    console.log('订阅消息发送成功:', result)
    return {
      success: true,
      message: '订阅消息发送成功',
      data: result
    }
  } catch (err) {
    console.error('订阅消息发送失败:', err)
    return {
      success: false,
      error: err.message || '发送失败',
      errCode: err.errCode
    }
  }
}

/**
 * 批量发送提醒（微信订阅消息 + 短信）
 * @param {object} event - 包含users数组等信息
 */
async function batchSendReminder(event) {
  const { users, templateId, message } = event
  
  console.log('=== 批量发送提醒 ===')
  console.log('用户数量:', users?.length || 0)
  
  const results = {
    wxSuccess: 0,
    wxFail: 0,
    smsSuccess: 0,
    smsFail: 0,
    details: []
  }
  
  for (const user of (users || [])) {
    // 发送微信订阅消息
    if (user.openid) {
      const wxResult = await sendWxSubscribeMessage({
        touser: user.openid,
        templateId: templateId,
        page: 'pages/archive/archive',
        data: {
          thing1: { value: '压力表到期提醒' },
          thing2: { value: user.message || message || '您有压力表即将到期' },
          date3: { value: formatDate(new Date()) },
          thing4: { value: '请及时处理' }
        }
      })
      
      if (wxResult.success) {
        results.wxSuccess++
      } else {
        results.wxFail++
      }
      
      results.details.push({
        openid: user.openid,
        wxResult: wxResult.success
      })
    }
    
    // 发送短信（如果有手机号）
    if (user.phone) {
      const smsResult = await sendSmsReminder({
        phones: [user.phone],
        content: user.message || message
      })
      
      if (smsResult.success) {
        results.smsSuccess++
      } else {
        results.smsFail++
      }
    }
  }
  
  return {
    success: true,
    message: '批量发送完成',
    data: results
  }
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
