
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const DEVICE_EXPIRY_TEMPLATE_ID = process.env.DEVICE_EXPIRY_TEMPLATE_ID || ''
const debugLog = () => {}

exports.main = async (event, context) => {
  const { action, enterpriseName, days = 30, district, openid, templateId, data } = event
  try {
    const actor = await resolveActor(event)
    const scopedDistrict = actor.type === 'district_admin' ? actor.district : district
    const scopedEnterpriseName = actor.type === 'enterprise' ? actor.companyName : enterpriseName

    switch (action) {
      case 'getEnterpriseExpiryDashboard':
        if (actor.type !== 'enterprise') throw new Error('仅企业账号可访问企业到期看板')
        return await getEnterpriseExpiryDashboard({
          ...(event.payload || {}),
          enterpriseId: actor.enterpriseId,
          enterpriseName: actor.companyName
        })

      case 'syncDeletedDeviceRecords':
        assertAdmin(actor)
        return await syncDeletedDeviceRecords(scopedDistrict)

      case 'getEnterpriseExpiring':
        if (!scopedEnterpriseName) throw new Error('缺少企业身份')
        return await getEnterpriseExpiring(scopedEnterpriseName, days)
    
      case 'getAllExpiring':
        assertAdmin(actor)
        return await getAllExpiring(days, scopedDistrict)
    
      case 'getExpiringSummary':
        assertAdmin(actor)
        return await getExpiringSummary(days, scopedDistrict)
    
      case 'sendWxSubscribeMessage':
      case 'sendSmsReminder':
      case 'batchSendReminder':
        assertAdmin(actor)
        if (action === 'sendWxSubscribeMessage') return await sendWxSubscribeMessage(event)
        if (action === 'sendSmsReminder') return await sendSmsReminder(event)
        return await batchSendReminder(event)
    
      case 'saveAlertSettings':
        if (actor.type !== 'enterprise') throw new Error('仅企业账号可修改提醒设置')
        return await saveAlertSettings({
          ...(event.payload || {}),
          enterpriseId: actor.enterpriseId,
          enterpriseName: actor.companyName
        }, actor.openid)

      case 'confirmWxSubscription':
        if (actor.type !== 'enterprise') throw new Error('仅企业账号可确认订阅')
        return await confirmWxSubscription({
          ...(event.payload || {}),
          enterpriseId: actor.enterpriseId,
          enterpriseName: actor.companyName
        }, actor.openid)
      
      case 'autoScanAndAlert':
        if (actor.type !== 'system') throw new Error('无权执行自动扫描')
        return await autoScanAndAlert()
    
      default:
        return { success: false, error: '未知操作' }
    }
  } catch (error) {
    return { success: false, error: error.message || '提醒服务异常' }
  }
}

async function resolveActor(event = {}) {
  if (process.env.REMINDER_TASK_SECRET && event.taskSecret === process.env.REMINDER_TASK_SECRET) {
    return { type: 'system' }
  }

  const wxContext = cloud.getWXContext()
  const currentOpenid = wxContext.OPENID || ''
  if (event.adminToken) {
    const tokenHash = crypto.createHash('sha256').update(String(event.adminToken)).digest('hex')
    const sessionRes = await db.collection('auth_sessions').where({ tokenHash }).limit(1).get()
    const session = sessionRes.data?.[0]
    if (isValidSession(session, currentOpenid)) return adminActor(session)
  }

  if (!currentOpenid) throw new Error('请先登录')
  const enterpriseRes = await db.collection('enterprises').where({ openid: currentOpenid }).limit(1).get()
  const enterprise = enterpriseRes.data?.[0]
  if (enterprise) {
    return {
      type: 'enterprise',
      enterpriseId: enterprise._id,
      companyName: enterprise.companyName || '',
      district: enterprise.district || '',
      openid: currentOpenid
    }
  }

  const sessionsRes = await db.collection('auth_sessions').where({ openid: currentOpenid }).orderBy('createTime', 'desc').limit(5).get()
  const session = (sessionsRes.data || []).find((item) => isValidSession(item, currentOpenid))
  if (session) return adminActor(session)
  throw new Error('登录状态无效')
}

function isValidSession(session, openid) {
  if (!session) return false
  if (session.openid && openid && session.openid !== openid) return false
  const expiresAt = session.expiresAt instanceof Date ? session.expiresAt : new Date(session.expiresAt)
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now()
}

function adminActor(session) {
  if (session.role === 'district' && session.district) {
    return { type: 'district_admin', district: session.district }
  }
  return { type: 'super_admin', district: '' }
}

function assertAdmin(actor) {
  if (!['super_admin', 'district_admin'].includes(actor.type)) throw new Error('仅管理端可执行该操作')
}

async function getEnterpriseExpiryDashboard(payload) {
  try {
    const { enterpriseId = '', enterpriseName = '', days = 30 } = payload || {}
    const resolvedEnterprise = await resolveEnterpriseProfile({ enterpriseId, enterpriseName })
    if (!resolvedEnterprise.enterpriseName) {
      return {
        success: false,
        error: '未找到企业信息'
      }
    }

    const expiryResult = await getEnterpriseExpiring(resolvedEnterprise.enterpriseName, days)
    if (!expiryResult.success) return expiryResult

    const settings = await getEnterpriseAlertSettings({
      enterpriseId: resolvedEnterprise.enterpriseId,
      enterpriseName: resolvedEnterprise.enterpriseName
    })

    const expired = expiryResult.data?.expired || []
    const expiring = expiryResult.data?.expiring || []
    const recentItems = [...expired, ...expiring]
      .sort((a, b) => String(a.expiryDate || '').localeCompare(String(b.expiryDate || '')))
      .slice(0, 5)
      .map((item) => ({
        _id: item._id,
        factoryNo: item.factoryNo || '',
        instrumentName: item.instrumentName || item.deviceName || '压力表',
        expiryDate: item.expiryDate || '',
        expiryStatus: item.expiryDate && item.expiryDate < formatDate(new Date()) ? 'expired' : 'expiring'
      }))

    return {
      success: true,
      data: {
        expiredCount: expiryResult.data?.expiredCount || 0,
        expiringCount: expiryResult.data?.expiringCount || 0,
        recentItems,
        subscription: {
          alertEnabled: settings?.alertEnabled !== false,
          wxSubscribed: !!settings?.wxSubscribed,
          lastAlertTime: settings?.lastAlertTime || '',
          lastSubscribeTime: settings?.lastSubscribeTime || ''
        }
      }
    }
  } catch (error) {
    console.error('getEnterpriseExpiryDashboard failed:', error)
    return {
      success: false,
      error: error.message || '获取企业到期看板失败'
    }
  }
}

async function getEnterpriseExpiring(enterpriseName, days) {
  try {
    const now = new Date()
    const expiryThreshold = new Date()
    expiryThreshold.setDate(now.getDate() + days)
    
    const nowStr = formatDate(now)
    const thresholdStr = formatDate(expiryThreshold)
    
    debugLog(`查询企业 ${enterpriseName} 的临期记录，当前日期: ${nowStr}, 阈值日期: ${thresholdStr}`)
    
    const recordsResult = await db.collection('pressure_records')
      .where({ enterpriseName, isDeleted: false })
      .orderBy('verificationDate', 'desc')
      .limit(1000)
      .get()
    const latestRecords = pickLatestGaugeRecords(recordsResult.data || [])
    const { expired, expiring } = classifyExpiryRecords(latestRecords, nowStr, thresholdStr)
    const expiredCount = expired.length
    const expiringCount = expiring.length
    
    return {
      success: true,
      data: {
        expired: expired.slice(0, 20),
        expiring: expiring.slice(0, 20),
        expiredCount,
        expiringCount,
        totalCount: expiredCount + expiringCount
      }
    }
  } catch (err) {
    console.error('查询企业临期记录失败:', err)
    return { success: false, error: err.message }
  }
}

async function syncDeletedDeviceRecords(district = '') {
  try {
    const deviceWhere = {
      isDeleted: true
    }
    if (district) {
      deviceWhere.district = district
    }

    const deletedDevicesRes = await db.collection('devices')
      .where(deviceWhere)
      .limit(1000)
      .get()

    const deletedDeviceIds = (deletedDevicesRes.data || [])
      .map((item) => item._id)
      .filter(Boolean)

    if (!deletedDeviceIds.length) {
      return {
        success: true,
        updated: 0
      }
    }

    const updateRes = await db.collection('pressure_records')
      .where({
        deviceId: _.in(deletedDeviceIds),
        isDeleted: false
      })
      .update({
        data: {
          isDeleted: true,
          deletedAt: formatDateTime(new Date()),
          deletedBy: '系统同步',
          updateTime: formatDateTime(new Date())
        }
      })

    return {
      success: true,
      updated: updateRes.stats && updateRes.stats.updated ? updateRes.stats.updated : 0
    }
  } catch (error) {
    console.error('sync deleted device records failed:', error)
    return {
      success: false,
      error: error.message || '同步删除记录失败'
    }
  }
}

async function getAllExpiring(days, district) {
  try {
    const now = new Date()
    const expiryThreshold = new Date()
    expiryThreshold.setDate(now.getDate() + days)
    
    const nowStr = formatDate(now)
    const thresholdStr = formatDate(expiryThreshold)
    
    debugLog('查询到期记录，当前日期:', nowStr, '阈值日期:', thresholdStr)
    debugLog('辖区过滤:', district || '全部')
    
    let baseCondition = {}
    if (district) {
      baseCondition.district = district
    }
    
    const recordsResult = await db.collection('pressure_records')
      .where({ ...baseCondition, isDeleted: false })
      .orderBy('verificationDate', 'desc')
      .limit(1000)
      .get()
    const latestRecords = pickLatestGaugeRecords(recordsResult.data || [])
    const { expired, expiring } = classifyExpiryRecords(latestRecords, nowStr, thresholdStr)
    
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
    
    processRecords(expired, 'expired')
    processRecords(expiring, 'expiring')
    
    return {
      success: true,
      data: {
        records: {
          expired,
          expiring
        },
        enterpriseStats: Object.values(enterpriseStats),
        summary: {
          expiredCount: expired.length,
          expiringCount: expiring.length,
          enterpriseCount: Object.keys(enterpriseStats).length
        }
      }
    }
  } catch (err) {
    console.error('查询全部临期记录失败:', err)
    return { success: false, error: err.message }
  }
}

async function getExpiringSummary(days, district) {
  try {
    const result = await getAllExpiring(days, district)
    if (!result.success) return result
    
    const { enterpriseStats, summary } = result.data
    
    const enterpriseNames = enterpriseStats.map(e => e.enterpriseName).filter(name => name !== '未知企业')
    let enterpriseContacts = {}
    
    if (enterpriseNames.length > 0) {
      const enterpriseResults = await Promise.all(
        chunkList(enterpriseNames, 20).map((names) => db.collection('enterprises')
          .where({ companyName: _.in(names) })
          .field({ companyName: true, phone: true, legalPerson: true })
          .get())
      )

      enterpriseResults.flatMap((item) => item.data || []).forEach(e => {
        enterpriseContacts[e.companyName] = {
          phone: e.phone || '',
          legalPerson: e.legalPerson || ''
        }
      })
    }
    
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

async function sendSmsReminder(event) {
  const { phones, content, records } = event
  
  
  debugLog('sms reminder api called')
  debugLog('接收号码:', phones)
  debugLog('提醒内容:', content)
  debugLog('相关记录:', records?.length || 0, '条')
  
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
      smsResult: null
    }
  }
}

async function sendWxSubscribeMessage(event) {
  const { touser, templateId, page, data } = event
  
  debugLog('send wx subscribe message')
  debugLog('接收用户:', touser)
  debugLog('模板ID:', templateId)
  
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: touser,
      templateId: templateId || 'TEMPLATE_ID_PLACEHOLDER',
      page: page || 'pages/archive/archive',
      data: data || {
        thing1: { value: '压力表到期提醒' },
        date2: { value: formatDate(new Date()) },
        thing8: { value: '您的压力表即将到期，请及时安排检定。' }
      },
      miniprogramState: 'formal'
    })
    
    debugLog('订阅消息发送成功', result)
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

async function batchSendReminder(event) {
  const { users, templateId, message } = event
  
  debugLog('batch send reminder')
  debugLog('user count:', users && users.length ? users.length : 0)
  
  const results = {
    wxSuccess: 0,
    wxFail: 0,
    smsSuccess: 0,
    smsFail: 0,
    details: []
  }
  
  for (const user of (users || [])) {
  if (user.openid) {
    const wxResult = await sendWxSubscribeMessage({
      touser: user.openid,
      templateId: templateId,
      page: 'pages/archive/archive',
      data: {
        thing1: { value: '压力表到期提醒' },
        date2: { value: formatDate(new Date()) },
        thing8: { value: user.message || message || '您的压力表即将到期，请及时安排检定。' }
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

async function autoScanAndAlert() {
  debugLog('start auto expiry scan and alert')
  try {
    const now = new Date()
    const expiryThreshold = new Date()
    expiryThreshold.setDate(now.getDate() + 30)
    
    const nowStr = formatDate(now)
    const thresholdStr = formatDate(expiryThreshold)

    const expiringResult = await db.collection('pressure_records')
      .where({
        expiryDate: _.gte(nowStr).and(_.lte(thresholdStr)),
        isDeleted: false
      }).get()

    const expiredResult = await db.collection('pressure_records')
      .where({
        expiryDate: _.lt(nowStr),
        isDeleted: false
      }).get()

    const allAlertRecords = [...expiringResult.data, ...expiredResult.data]
    debugLog(`扫描完成，发现 ${expiringResult.data.length} 条临期，${expiredResult.data.length} 条逾期。`)

    if (allAlertRecords.length === 0) {
      return { success: true, message: '当前无预警设备' }
    }

    const alertTasks = []
    
    for (const record of allAlertRecords) {
      const isExpired = record.expiryDate < nowStr
      
      const entRes = await db.collection('enterprises').where({
        companyName: record.enterpriseName
      }).get()

      if (entRes.data.length > 0 && entRes.data[0]._openid) {
        const adminOpenId = entRes.data[0]._openid
        
        if (!DEVICE_EXPIRY_TEMPLATE_ID) {
          continue
        }
        const wxTask = sendWxSubscribeMessage({
          touser: adminOpenId,
          templateId: DEVICE_EXPIRY_TEMPLATE_ID,
          page: `/pages/device-detail/device-detail?id=${record.deviceId || record._id}`,
          data: {
            thing1: { value: (record.deviceName || '压力表').substring(0, 20) },
            date2: { value: record.expiryDate },
            thing8: { value: isExpired ? '压力表已逾期，请立即停用送检' : '压力表即将到期，请及时安排检定' }
          }
        })
        alertTasks.push(wxTask)
      }
    }

    const results = await Promise.allSettled(alertTasks)
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length

    debugLog(`预警推送完成，共触发 ${alertTasks.length} 次，成功 ${successCount} 次。`)
    return { success: true, total: alertTasks.length, successCount }

  } catch (err) {
    console.error('自动扫描任务异常:', err)
    return { success: false, error: err.message }
  }
}

async function saveAlertSettings(payload, openid) {
  try {
    const {
      enterpriseId = '',
      enterpriseName = '',
      alertEnabled = true,
      channels = {},
      strategy = {}
    } = payload || {}

    const resolvedEnterprise = await resolveEnterpriseProfile({ enterpriseId, enterpriseName })
    if (!resolvedEnterprise.enterpriseName) {
      return { success: false, error: '未找到企业信息' }
    }

    const collection = db.collection('enterprise_alert_settings')
    const existing = await getEnterpriseAlertSettings({
      enterpriseId: resolvedEnterprise.enterpriseId,
      enterpriseName: resolvedEnterprise.enterpriseName,
      includeRaw: true
    })

    const now = new Date().toISOString()
    const data = {
      enterpriseId: resolvedEnterprise.enterpriseId,
      enterpriseName: resolvedEnterprise.enterpriseName,
      district: resolvedEnterprise.district || '',
      openid: openid || resolvedEnterprise.openid || '',
      alertEnabled: alertEnabled !== false,
      channels: {
        wxSubscribe: channels.wxSubscribe !== false,
        inApp: channels.inApp !== false,
        sms: !!channels.sms
      },
      strategy: {
        dailyDigestEnabled: strategy.dailyDigestEnabled !== false,
        expiredEnabled: strategy.expiredEnabled !== false,
        expiringDays: Array.isArray(strategy.expiringDays) && strategy.expiringDays.length
          ? strategy.expiringDays
          : [30]
      },
      updatedAt: now
    }

    if (existing && existing._id) {
      await collection.doc(existing._id).update({
        data
      })
    } else {
      await collection.add({
        data: {
          ...data,
          wxSubscribed: false,
          wxTemplateId: '',
          lastSubscribeTime: '',
          lastAlertTime: '',
          createdAt: now
        }
      })
    }

    return { success: true }
  } catch (error) {
    console.error('saveAlertSettings failed:', error)
    return { success: false, error: error.message || '保存提醒设置失败' }
  }
}

async function confirmWxSubscription(payload, openid) {
  try {
    const { enterpriseId = '', enterpriseName = '', templateId = '' } = payload || {}
    const resolvedEnterprise = await resolveEnterpriseProfile({ enterpriseId, enterpriseName })
    if (!resolvedEnterprise.enterpriseName) {
      return { success: false, error: '未找到企业信息' }
    }

    const collection = db.collection('enterprise_alert_settings')
    const existing = await getEnterpriseAlertSettings({
      enterpriseId: resolvedEnterprise.enterpriseId,
      enterpriseName: resolvedEnterprise.enterpriseName,
      includeRaw: true
    })

    const now = new Date().toISOString()
    const mergedChannels = {
      wxSubscribe: true,
      inApp: true,
      sms: !!existing?.channels?.sms
    }
    const data = {
      enterpriseId: resolvedEnterprise.enterpriseId,
      enterpriseName: resolvedEnterprise.enterpriseName,
      district: resolvedEnterprise.district || '',
      openid: openid || resolvedEnterprise.openid || '',
      alertEnabled: true,
      wxSubscribed: true,
      wxTemplateId: templateId || existing?.wxTemplateId || '',
      channels: mergedChannels,
      lastSubscribeTime: now,
      updatedAt: now
    }

    if (existing && existing._id) {
      await collection.doc(existing._id).update({
        data
      })
    } else {
      await collection.add({
        data: {
          enterpriseId: resolvedEnterprise.enterpriseId,
          enterpriseName: resolvedEnterprise.enterpriseName,
          district: resolvedEnterprise.district || '',
          openid: openid || resolvedEnterprise.openid || '',
          alertEnabled: true,
          wxSubscribed: true,
          wxTemplateId: templateId || '',
          channels: {
            wxSubscribe: true,
            inApp: true,
            sms: false
          },
          strategy: {
            dailyDigestEnabled: true,
            expiredEnabled: true,
            expiringDays: [30]
          },
          lastSubscribeTime: now,
          lastAlertTime: '',
          createdAt: now,
          updatedAt: now
        }
      })
    }

    return { success: true }
  } catch (error) {
    console.error('confirmWxSubscription failed:', error)
    return { success: false, error: error.message || '保存订阅状态失败' }
  }
}

async function resolveEnterpriseProfile({ enterpriseId = '', enterpriseName = '' }) {
  if (!enterpriseId && !enterpriseName) {
    return {}
  }

  const query = enterpriseId
    ? db.collection('enterprises').doc(enterpriseId).get().then((res) => res.data || null).catch(() => null)
    : db.collection('enterprises').where({ companyName: enterpriseName }).limit(1).get().then((res) => res.data?.[0] || null)

  const enterprise = await query
  if (!enterprise) {
    return {
      enterpriseId,
      enterpriseName
    }
  }

  return {
    enterpriseId: enterprise._id || enterpriseId,
    enterpriseName: enterprise.companyName || enterpriseName,
    district: enterprise.district || '',
    openid: enterprise._openid || ''
  }
}

async function getEnterpriseAlertSettings({ enterpriseId = '', enterpriseName = '', includeRaw = false }) {
  let result = null
  if (enterpriseId) {
    const res = await db.collection('enterprise_alert_settings')
      .where({ enterpriseId })
      .limit(1)
      .get()
    result = res.data?.[0] || null
  }

  if (!result && enterpriseName) {
    const res = await db.collection('enterprise_alert_settings')
      .where({ enterpriseName })
      .limit(1)
      .get()
    result = res.data?.[0] || null
  }

  if (!includeRaw) return result || null
  return result || null
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function pickLatestGaugeRecords(records = []) {
  const latest = new Map()
  records.forEach((record) => {
    const identity = record.deviceId || [record.enterpriseName, record.factoryNo].filter(Boolean).join(':') || record.certNo || record._id
    if (!identity || latest.has(identity)) return
    latest.set(identity, record)
  })
  return Array.from(latest.values())
}

function classifyExpiryRecords(records, nowStr, thresholdStr) {
  const expired = []
  const expiring = []
  records.forEach((record) => {
    const expiryDate = String(record.expiryDate || '')
    if (!expiryDate) return
    if (expiryDate < nowStr) {
      expired.push(record)
    } else if (expiryDate <= thresholdStr) {
      expiring.push(record)
    }
  })
  expired.sort((a, b) => String(a.expiryDate || '').localeCompare(String(b.expiryDate || '')))
  expiring.sort((a, b) => String(a.expiryDate || '').localeCompare(String(b.expiryDate || '')))
  return { expired, expiring }
}

function chunkList(list, size) {
  const chunks = []
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size))
  }
  return chunks
}

function formatDateTime(date) {
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${formatDate(date)} ${hour}:${minute}:${second}`
}



