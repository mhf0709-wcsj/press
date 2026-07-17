
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const {
  normalizeTaskStatus,
  canSubmitRectification,
  resolveReviewDecision
} = require('./rectification-policy')
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
        return await getExpiringSummary(days, scopedDistrict, actor)

      case 'getAdminWorkspaceSummary':
        assertAdmin(actor)
        return await getAdminWorkspaceSummary(days, scopedDistrict, actor)
    
      case 'sendWxSubscribeMessage':
      case 'sendSmsReminder':
      case 'batchSendReminder':
        assertAdmin(actor)
        if (action === 'sendWxSubscribeMessage') return await sendWxSubscribeMessage(event)
        if (action === 'sendSmsReminder') return await sendSmsReminder(event)
        return await batchSendReminder(event)

      case 'sendEnterpriseNotice':
        assertAdmin(actor)
        return await sendEnterpriseNotice(event.payload || {}, actor)

      case 'listAdminNotices':
        assertAdmin(actor)
        return await listAdminNotices(event.payload || {}, actor)

      case 'getEnterpriseNotices':
        if (actor.type !== 'enterprise') throw new Error('仅企业账号可查看企业提醒')
        return await getEnterpriseNotices(actor, event.payload || {})

      case 'updateEnterpriseNoticeStatus':
        if (actor.type !== 'enterprise') throw new Error('仅企业账号可处理企业提醒')
        return await updateEnterpriseNoticeStatus(event.payload || {}, actor)

      case 'getRectificationTask':
        return await getRectificationTask(event.payload || {}, actor)

      case 'submitRectification':
        if (actor.type !== 'enterprise') throw new Error('仅企业账号可提交整改材料')
        return await submitRectification(event.payload || {}, actor)

      case 'reviewRectification':
        assertAdmin(actor)
        return await reviewRectification(event.payload || {}, actor)
    
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
    if (enterprise.approvalStatus === 'pending') throw new Error('企业账号正在审核中')
    if (enterprise.approvalStatus === 'rejected') throw new Error('企业账号审核未通过')
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
    return {
      type: 'district_admin',
      district: session.district,
      adminId: session.adminId || '',
      username: session.username || ''
    }
  }
  return {
    type: 'super_admin',
    district: '',
    adminId: session.adminId || '',
    username: session.username || ''
  }
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
    
    const records = await fetchAllPressureRecords({ enterpriseName, isDeleted: false })
    const latestRecords = pickLatestGaugeRecords(records)
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
    
    const records = await fetchAllPressureRecords({ ...baseCondition, isDeleted: _.neq(true) })
    const latestRecords = pickLatestGaugeRecords(records)
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
          totalRecords: records.length,
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

async function getExpiringSummary(days, district, actor) {
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
        summary: {
          ...summary,
          version: await getLatestOperationVersion(actor)
        },
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

    const [expiringRecords, expiredRecords] = await Promise.all([
      fetchAllPressureRecords({
        expiryDate: _.gte(nowStr).and(_.lte(thresholdStr)),
        isDeleted: false
      }),
      fetchAllPressureRecords({
        expiryDate: _.lt(nowStr),
        isDeleted: false
      })
    ])

    const allAlertRecords = [...expiringRecords, ...expiredRecords]
    debugLog(`扫描完成，发现 ${expiringRecords.length} 条临期，${expiredRecords.length} 条逾期。`)

    if (allAlertRecords.length === 0) {
      return { success: true, message: '当前无预警设备' }
    }

    const alertTasks = []
    
    for (const record of allAlertRecords) {
      const isExpired = record.expiryDate < nowStr
      
      const entRes = await db.collection('enterprises').where({
        companyName: record.enterpriseName
      }).get()

      if (entRes.data.length > 0 && (entRes.data[0].openid || entRes.data[0]._openid)) {
        const adminOpenId = entRes.data[0].openid || entRes.data[0]._openid
        
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

async function getAdminWorkspaceSummary(days, district, actor) {
  const scopedDistrict = actor.type === 'district_admin' ? actor.district : district || ''
  await ensureCollection('enterprise_notifications')

  const enterpriseWhere = { approvalStatus: 'pending' }
  const noticeWhere = {}
  if (scopedDistrict) {
    enterpriseWhere.district = scopedDistrict
    noticeWhere.district = scopedDistrict
  }

  const equipmentTask = actor.type === 'super_admin'
    ? fetchAllCollection('equipments', { isDeleted: false }, {
      fields: { district: true },
      maxRecords: 20000
    })
    : Promise.resolve([])

  const [riskResult, pendingEnterpriseResult, notices, equipments] = await Promise.all([
    getExpiringSummary(days, scopedDistrict, actor),
    db.collection('enterprises').where(enterpriseWhere).count(),
    fetchAllCollection('enterprise_notifications', noticeWhere, {
      fields: { taskStatus: true, status: true, dueDate: true },
      maxRecords: 10000
    }),
    equipmentTask
  ])

  if (!riskResult?.success) return riskResult

  const today = formatDate(new Date())
  const activeStatuses = new Set(['pending', 'rectifying', 'pending_review', 'returned'])
  const taskSummary = notices.reduce((result, item) => {
    const status = normalizeTaskStatus(item.taskStatus, item.status)
    if (activeStatuses.has(status)) result.openCount += 1
    if (status === 'pending_review') result.pendingReviewCount += 1
    if (status === 'returned') result.returnedCount += 1
    if (activeStatuses.has(status) && item.dueDate && String(item.dueDate) < today) {
      result.overdueCount += 1
    }
    return result
  }, { openCount: 0, pendingReviewCount: 0, returnedCount: 0, overdueCount: 0 })

  const districtMap = equipments.reduce((result, item) => {
    const name = cleanText(item.district, 30) || '未设置'
    result[name] = (result[name] || 0) + 1
    return result
  }, {})
  const districtStats = Object.entries(districtMap)
    .map(([name, count]) => ({ district: name, count }))
    .sort((a, b) => b.count - a.count || a.district.localeCompare(b.district))

  const riskData = riskResult.data || {}
  return {
    success: true,
    data: {
      summary: riskData.summary || {},
      enterpriseStats: riskData.enterpriseStats || [],
      pendingEnterpriseCount: Number(pendingEnterpriseResult.total || 0),
      taskSummary,
      districtStats,
      totalDistrictEquipments: equipments.length,
      version: Number(riskData.summary?.version || 0)
    }
  }
}

async function getLatestOperationVersion(actor = {}) {
  try {
    let query = db.collection('operation_logs')
    if (actor.type === 'enterprise') {
      query = query.where({ enterpriseName: actor.companyName || '' })
    } else if (actor.type === 'district_admin' && actor.district) {
      query = query.where({ district: actor.district })
    }
    const result = await query.orderBy('timestamp', 'desc').limit(1).field({ timestamp: true }).get()
    return Number(result.data?.[0]?.timestamp || 0)
  } catch (error) {
    return 0
  }
}

function sanitizeNotice(item = {}) {
  return {
    _id: item._id || '',
    enterpriseId: item.enterpriseId || '',
    enterpriseName: item.enterpriseName || '',
    district: item.district || '',
    type: item.type || 'general',
    priority: item.priority || 'normal',
    title: item.title || '监管提醒',
    content: item.content || '',
    status: item.status || 'unread',
    taskStatus: normalizeTaskStatus(item.taskStatus, item.status),
    dueDate: item.dueDate || '',
    rectificationResponse: item.rectificationResponse || '',
    evidenceFileIds: Array.isArray(item.evidenceFileIds) ? item.evidenceFileIds.slice(0, 6) : [],
    submittedAt: item.submittedAt || '',
    reviewDecision: item.reviewDecision || '',
    reviewComment: item.reviewComment || '',
    reviewedAt: item.reviewedAt || '',
    reviewedBy: item.reviewedBy || '',
    createdBy: item.createdBy || '',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
    readAt: item.readAt || '',
    deferredAt: item.deferredAt || '',
    deferredUntil: item.deferredUntil || ''
  }
}

function noticePriorityRank(priority) {
  return { urgent: 3, important: 2, normal: 1 }[priority] || 1
}

function cleanText(value, maxLength = 300) {
  return String(value || '').trim().slice(0, maxLength)
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    const missingCollection = /collection.*not exist|COLLECTION_NOT_EXIST|集合不存在|DATABASE_COLLECTION_NOT_EXIST/i.test(error.message || '')
    if (!missingCollection || typeof db.createCollection !== 'function') throw error
    try {
      await db.createCollection(name)
    } catch (createError) {
      const alreadyExists = /already exist|已存在/i.test(createError.message || '')
      if (!alreadyExists) throw createError
    }
  }
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function sendEnterpriseNotice(payload, actor) {
  const enterpriseId = cleanText(payload.enterpriseId, 64)
  const title = cleanText(payload.title, 30)
  const content = cleanText(payload.content, 300)
  const type = ['expiry', 'material', 'inspection', 'general'].includes(payload.type)
    ? payload.type
    : 'general'
  const priority = ['normal', 'important', 'urgent'].includes(payload.priority)
    ? payload.priority
    : 'normal'
  const dueDate = normalizeDueDate(payload.dueDate) || defaultDueDate(priority)

  if (!enterpriseId) throw new Error('请选择提醒企业')
  if (!title) throw new Error('请输入提醒标题')
  if (!content) throw new Error('请输入提醒内容')

  const enterpriseRes = await db.collection('enterprises').doc(enterpriseId).get().catch(() => null)
  const enterprise = enterpriseRes?.data
  if (!enterprise || enterprise.isDeleted === true) throw new Error('企业不存在或已停用')
  if (enterprise.approvalStatus && enterprise.approvalStatus !== 'approved') {
    throw new Error('只能向已审核企业发送提醒')
  }
  if (actor.type === 'district_admin' && cleanText(enterprise.district, 30) !== cleanText(actor.district, 30)) {
    throw new Error('无权提醒其他辖区企业')
  }

  await ensureCollection('enterprise_notifications')
  await ensureCollection('operation_logs')
  const now = new Date().toISOString()
  const result = await db.collection('enterprise_notifications').add({
    data: {
      enterpriseId: enterprise._id,
      enterpriseName: cleanText(enterprise.companyName, 80),
      district: cleanText(enterprise.district, 30),
      type,
      priority,
      title,
      content,
      status: 'unread',
      taskStatus: 'pending',
      dueDate,
      createdById: actor.adminId || '',
      createdBy: actor.username || (actor.type === 'district_admin' ? `${actor.district}管理员` : '总管理员'),
      createdAt: now,
      updatedAt: now,
      readAt: '',
      deferredAt: '',
      deferredUntil: '',
      rectificationResponse: '',
      evidenceFileIds: [],
      submittedAt: '',
      reviewDecision: '',
      reviewComment: '',
      reviewedAt: '',
      reviewedBy: ''
    }
  })
  await writeReminderOperationLog({
    operation: 'create_task',
    actor,
    notice: {
      _id: result._id,
      enterpriseId: enterprise._id,
      enterpriseName: enterprise.companyName,
      district: enterprise.district,
      type,
      priority,
      title,
      content,
      taskStatus: 'pending',
      dueDate
    },
    before: null,
    after: { taskStatus: 'pending', dueDate, title, content }
  })

  return {
    success: true,
    data: {
      noticeId: result._id,
      enterpriseName: enterprise.companyName || '',
      status: 'unread',
      taskStatus: 'pending',
      dueDate
    }
  }
}

async function getEnterpriseNotices(actor, payload = {}) {
  await ensureCollection('enterprise_notifications')
  const where = actor.enterpriseId
    ? { enterpriseId: actor.enterpriseId }
    : { enterpriseName: actor.companyName }
  const res = await db.collection('enterprise_notifications')
    .where(where)
    .limit(100)
    .get()
  const now = Date.now()
  const allNotices = (res.data || [])
    .map(sanitizeNotice)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))

  if (payload.includeAll) {
    const status = cleanText(payload.status, 30)
    const notices = status ? allNotices.filter((item) => item.taskStatus === status) : allNotices
    return { success: true, data: { notices, total: notices.length } }
  }

  const notices = allNotices
    .filter((item) => ['unread', 'deferred'].includes(item.status))
    .filter((item) => item.status !== 'deferred' || !item.deferredUntil || new Date(item.deferredUntil).getTime() <= now)
    .sort((a, b) => {
      const priorityDiff = noticePriorityRank(b.priority) - noticePriorityRank(a.priority)
      if (priorityDiff) return priorityDiff
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    })
    .slice(0, 10)

  return { success: true, data: { notices, unreadCount: notices.length } }
}

async function updateEnterpriseNoticeStatus(payload, actor) {
  const noticeId = cleanText(payload.noticeId, 64)
  const status = payload.status === 'deferred' ? 'deferred' : 'read'
  if (!noticeId) throw new Error('缺少提醒编号')

  await ensureCollection('enterprise_notifications')
  const noticeRes = await db.collection('enterprise_notifications').doc(noticeId).get().catch(() => null)
  const notice = noticeRes?.data
  if (!notice) throw new Error('提醒不存在')
  const belongsToEnterprise = actor.enterpriseId
    ? notice.enterpriseId === actor.enterpriseId
    : notice.enterpriseName === actor.companyName
  if (!belongsToEnterprise) throw new Error('无权处理该提醒')

  const now = new Date()
  const data = {
    status,
    updatedAt: now.toISOString()
  }
  if (status === 'read') {
    data.readAt = now.toISOString()
    data.deferredUntil = ''
    if (!notice.taskStatus || notice.taskStatus === 'pending') data.taskStatus = 'rectifying'
  } else {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    data.deferredAt = now.toISOString()
    data.deferredUntil = tomorrow.toISOString()
  }

  await db.collection('enterprise_notifications').doc(noticeId).update({ data })
  return { success: true, data: { noticeId, status, deferredUntil: data.deferredUntil || '' } }
}

async function listAdminNotices(payload, actor) {
  await ensureCollection('enterprise_notifications')
  const where = {}
  if (actor.type === 'district_admin') where.district = actor.district

  const limit = Math.min(Math.max(Number(payload.limit) || 100, 1), 200)
  const rawNotices = await fetchAllCollection('enterprise_notifications', where, { maxRecords: 10000 })
  const allNotices = rawNotices
    .map(sanitizeNotice)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  const today = formatDate(new Date())
  const activeStatuses = new Set(['pending', 'rectifying', 'pending_review', 'returned'])
  const isOverdue = (item) => activeStatuses.has(item.taskStatus) && item.dueDate && String(item.dueDate) < today
  const summary = allNotices.reduce((result, item) => {
    result.total += 1
    result[item.taskStatus] = (result[item.taskStatus] || 0) + 1
    if (isOverdue(item)) result.overdue += 1
    return result
  }, { total: 0, pending: 0, rectifying: 0, pending_review: 0, returned: 0, closed: 0, acknowledged: 0, overdue: 0 })
  let notices = allNotices
  if (payload.status === 'overdue') notices = allNotices.filter(isOverdue)
  else if (['pending', 'rectifying', 'pending_review', 'returned', 'closed', 'acknowledged'].includes(payload.status)) {
    notices = allNotices.filter((item) => item.taskStatus === payload.status)
  }
  notices = notices.slice(0, limit)

  return { success: true, data: { notices, summary } }
}

async function getRectificationTask(payload, actor) {
  const notice = await requireScopedNotice(payload.noticeId, actor)
  return { success: true, data: { task: sanitizeNotice(notice) } }
}

async function submitRectification(payload, actor) {
  const notice = await requireScopedNotice(payload.noticeId, actor)
  const taskStatus = normalizeTaskStatus(notice.taskStatus, notice.status)
  if (!canSubmitRectification(notice.taskStatus, notice.status)) {
    throw new Error(taskStatus === 'pending_review' ? '整改材料已提交，请等待复核' : '该任务当前不可提交')
  }

  const response = cleanText(payload.response, 500)
  const evidenceFileIds = Array.isArray(payload.evidenceFileIds)
    ? payload.evidenceFileIds.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 6)
    : []
  if (!response) throw new Error('请填写整改说明')

  const now = new Date().toISOString()
  const data = {
    taskStatus: 'pending_review',
    status: 'read',
    readAt: notice.readAt || now,
    rectificationResponse: response,
    evidenceFileIds,
    submittedAt: now,
    reviewDecision: '',
    reviewComment: '',
    reviewedAt: '',
    reviewedBy: '',
    updatedAt: now
  }
  await ensureCollection('operation_logs')
  await db.collection('enterprise_notifications').doc(notice._id).update({ data })
  await writeReminderOperationLog({
    operation: 'submit_rectification',
    actor,
    notice,
    before: notice,
    after: { ...notice, ...data },
    metadata: { evidenceCount: evidenceFileIds.length }
  })
  return { success: true, data: { task: sanitizeNotice({ ...notice, ...data }) } }
}

async function reviewRectification(payload, actor) {
  const notice = await requireScopedNotice(payload.noticeId, actor)
  if ((notice.taskStatus || 'pending') !== 'pending_review') throw new Error('该任务不在待复核状态')

  const review = resolveReviewDecision(payload.decision)
  const decision = review.decision
  const comment = cleanText(payload.comment, 300)
  if (decision === 'returned' && !comment) throw new Error('退回时请填写复核意见')

  const now = new Date().toISOString()
  const data = {
    taskStatus: review.nextStatus,
    status: review.noticeStatus,
    reviewDecision: decision,
    reviewComment: comment,
    reviewedAt: now,
    reviewedBy: actor.username || (actor.type === 'district_admin' ? `${actor.district}管理员` : '总管理员'),
    deferredUntil: '',
    updatedAt: now
  }
  await ensureCollection('operation_logs')
  await db.collection('enterprise_notifications').doc(notice._id).update({ data })
  await writeReminderOperationLog({
    operation: decision === 'approved' ? 'close_task' : 'return_task',
    actor,
    notice,
    before: notice,
    after: { ...notice, ...data },
    metadata: { comment }
  })
  return { success: true, data: { task: sanitizeNotice({ ...notice, ...data }) } }
}

async function requireScopedNotice(noticeId, actor) {
  const id = cleanText(noticeId, 64)
  if (!id) throw new Error('缺少整改任务编号')
  await ensureCollection('enterprise_notifications')
  const res = await db.collection('enterprise_notifications').doc(id).get().catch(() => null)
  const notice = res?.data
  if (!notice) throw new Error('整改任务不存在')

  if (actor.type === 'enterprise') {
    const matched = actor.enterpriseId
      ? notice.enterpriseId === actor.enterpriseId
      : notice.enterpriseName === actor.companyName
    if (!matched) throw new Error('无权查看该整改任务')
  } else {
    assertAdmin(actor)
    if (actor.type === 'district_admin' && notice.district !== actor.district) {
      throw new Error('无权处理其他辖区整改任务')
    }
  }
  return notice
}

function defaultDueDate(priority) {
  const date = new Date()
  date.setDate(date.getDate() + (priority === 'urgent' ? 3 : priority === 'important' ? 7 : 14))
  return formatDate(date)
}

function normalizeDueDate(value) {
  const text = cleanText(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '' : text
}

async function writeReminderOperationLog({ operation, actor, notice, before, after, metadata = {} }) {
  const now = new Date()
  await db.collection('operation_logs').add({
    data: {
      requestId: crypto.randomBytes(12).toString('hex'),
      source: 'reminder',
      operation,
      entityType: 'rectification_task',
      entityId: notice._id || '',
      enterpriseName: notice.enterpriseName || actor.companyName || '',
      district: notice.district || actor.district || '',
      operatorType: actor.type,
      operatorId: actor.adminId || actor.enterpriseId || '',
      operatorName: actor.username || actor.companyName || '',
      before: sanitizeReminderAudit(before),
      after: sanitizeReminderAudit(after),
      metadata: sanitizeReminderAudit(metadata),
      createdAt: now,
      timestamp: now.getTime()
    }
  })
}

function sanitizeReminderAudit(input) {
  if (!input || typeof input !== 'object') return input || null
  const blocked = new Set(['_openid', 'openid', 'evidenceFileIds'])
  const output = {}
  Object.keys(input).slice(0, 60).forEach((key) => {
    if (blocked.has(key)) return
    const value = input[key]
    if (value && typeof value === 'object' && !(value instanceof Date)) output[key] = sanitizeReminderAudit(value)
    else if (typeof value === 'string') output[key] = value.slice(0, 500)
    else output[key] = value
  })
  return output
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

async function fetchAllPressureRecords(condition, maxRecords = 20000) {
  const batchSize = 1000
  const records = []

  while (records.length < maxRecords) {
    const res = await db.collection('pressure_records')
      .where(condition)
      .orderBy('verificationDate', 'desc')
      .skip(records.length)
      .limit(batchSize)
      .get()
    const batch = res.data || []
    records.push(...batch)
    if (batch.length < batchSize) break
  }

  if (records.length >= maxRecords) throw new Error('到期统计数据量超过安全上限，请联系管理员处理')
  return records
}

async function fetchAllCollection(collectionName, condition = {}, options = {}) {
  const batchSize = 1000
  const maxRecords = Math.max(batchSize, Number(options.maxRecords || 10000))
  const records = []

  while (records.length < maxRecords) {
    let query = db.collection(collectionName)
    if (Object.keys(condition).length) query = query.where(condition)
    query = query.skip(records.length).limit(batchSize)
    if (options.fields) query = query.field(options.fields)
    const res = await query.get()
    const batch = res.data || []
    records.push(...batch)
    if (batch.length < batchSize) break
  }

  if (records.length >= maxRecords) throw new Error('监管统计数据量超过安全上限，请联系管理员处理')
  return records
}

function formatDateTime(date) {
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${formatDate(date)} ${hour}:${minute}:${second}`
}



