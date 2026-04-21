// 鍒版湡鎻愰啋浜戝嚱鏁?
// 鍔熻兘锛氭煡璇复鏈?宸茶繃鏈熺殑鍘嬪姏琛ㄨ褰曪紝鏀寔浼佷笟鍜岀鐞嗗憳涓ょ妯″紡
// 鏀寔寰俊璁㈤槄娑堟伅鎻愰啋鍜岀煭淇℃彁閱?

const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const DEVICE_EXPIRY_TEMPLATE_ID = process.env.DEVICE_EXPIRY_TEMPLATE_ID || ''
const debugLog = () => {}

exports.main = async (event, context) => {
  const { action, enterpriseName, days = 30, district, openid, templateId, data } = event
  
  debugLog('=== 鍒版湡鎻愰啋浜戝嚱鏁拌皟鐢?===')
  debugLog('action:', action)
  debugLog('district:', district)
  debugLog('days:', days)
  
  switch (action) {
    case 'getEnterpriseExpiryDashboard':
      return await getEnterpriseExpiryDashboard(event.payload || {})

    case 'getEnterpriseExpiring':
      // 鑾峰彇鍗曚釜浼佷笟鐨勪复鏈熻褰?
      return await getEnterpriseExpiring(enterpriseName, days)
    
    case 'getAllExpiring':
      // 鑾峰彇鎵€鏈変紒涓氱殑涓存湡璁板綍锛堢鐞嗗憳鐢級
      return await getAllExpiring(days, district)
    
    case 'getExpiringSummary':
      // 鑾峰彇涓存湡姹囨€荤粺璁★紙绠＄悊鍛樼敤锛?
      return await getExpiringSummary(days, district)
    
    case 'sendWxSubscribeMessage':
      // 鍙戦€佸井淇¤闃呮秷鎭?
      return await sendWxSubscribeMessage(event)
    
    case 'sendSmsReminder':
      // 鍙戦€佺煭淇℃彁閱掞紙棰勭暀鎺ュ彛锛?
      return await sendSmsReminder(event)
    
    case 'batchSendReminder':
      // 鎵归噺鍙戦€佹彁閱掞紙寰俊+鐭俊锛?
      return await batchSendReminder(event)

    case 'saveAlertSettings':
      return await saveAlertSettings(event.payload || {}, openid)

    case 'confirmWxSubscription':
      return await confirmWxSubscription(event.payload || {}, openid)
      
    case 'autoScanAndAlert':
      // 瀹氭椂浠诲姟锛氳嚜鍔ㄦ壂鎻忓叏閲忓彴璐﹀苟鎺ㄩ€侀€炬湡/涓存湡棰勮
      return await autoScanAndAlert()
    
    default:
      return { success: false, error: '鏈煡鎿嶄綔' }
  }
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

/**
 * 鑾峰彇鍗曚釜浼佷笟鐨勪复鏈熻褰?
 * @param {string} enterpriseName - 浼佷笟鍚嶇О
 * @param {number} days - 鎻愬墠澶╂暟锛岄粯璁?0澶?
 */
async function getEnterpriseExpiring(enterpriseName, days) {
  try {
    const now = new Date()
    const expiryThreshold = new Date()
    expiryThreshold.setDate(now.getDate() + days)
    
    // 鏍煎紡鍖栨棩鏈?
    const nowStr = formatDate(now)
    const thresholdStr = formatDate(expiryThreshold)
    
    debugLog(`鏌ヨ浼佷笟 ${enterpriseName} 鐨勪复鏈熻褰曪紝褰撳墠鏃ユ湡: ${nowStr}, 闃堝€兼棩鏈? ${thresholdStr}`)
    
    // 鏌ヨ宸茶繃鏈熷拰鍗冲皢杩囨湡鐨勮褰?
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
    
    // 鏇存柊宸茶繃鏈熻褰曠殑鐘舵€?
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
        expired: expiredResult.data,       // 宸茶繃鏈?
        expiring: expiringResult.data,     // 鍗冲皢杩囨湡
        expiredCount: expiredResult.data.length,
        expiringCount: expiringResult.data.length,
        totalCount: expiredResult.data.length + expiringResult.data.length
      }
    }
  } catch (err) {
    console.error('鏌ヨ浼佷笟涓存湡璁板綍澶辫触:', err)
    return { success: false, error: err.message }
  }
}

/**
 * 鑾峰彇鎵€鏈変紒涓氱殑涓存湡璁板綍锛堢鐞嗗憳鐢級
 * @param {number} days - 鎻愬墠澶╂暟
 * @param {string} district - 杈栧尯锛堝彲閫夛級
 */
async function getAllExpiring(days, district) {
  try {
    const now = new Date()
    const expiryThreshold = new Date()
    expiryThreshold.setDate(now.getDate() + days)
    
    const nowStr = formatDate(now)
    const thresholdStr = formatDate(expiryThreshold)
    
    debugLog('鏌ヨ鍒版湡璁板綍锛屽綋鍓嶆棩鏈?', nowStr, '闃堝€兼棩鏈?', thresholdStr)
    debugLog('杈栧尯杩囨护:', district || '鍏ㄩ儴')
    
    // 鏋勫缓鏌ヨ鏉′欢
    let baseCondition = {}
    if (district) {
      baseCondition.district = district
    }
    
    // 鏌ヨ宸茶繃鏈熻褰?
    const expiredCondition = { ...baseCondition, expiryDate: _.lt(nowStr), status: _.in(['valid', 'expired']) }
    debugLog('宸茶繃鏈熸煡璇㈡潯浠?', JSON.stringify(expiredCondition))
    
    const expiredResult = await db.collection('pressure_records')
      .where(expiredCondition)
      .orderBy('expiryDate', 'asc')
      .limit(1000)
      .get()
    
    debugLog('宸茶繃鏈熻褰曟暟:', expiredResult.data.length)
    
    // 鏌ヨ鍗冲皢杩囨湡璁板綍
    const expiringCondition = { ...baseCondition, expiryDate: _.gte(nowStr).and(_.lte(thresholdStr)), status: 'valid' }
    const expiringResult = await db.collection('pressure_records')
      .where(expiringCondition)
      .orderBy('expiryDate', 'asc')
      .limit(1000)
      .get()
    
    // 鎸変紒涓氬垎缁勭粺璁?
    const enterpriseStats = {}
    const processRecords = (records, type) => {
      records.forEach(record => {
        const name = record.enterpriseName || '鏈煡浼佷笟'
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
    console.error('鏌ヨ鎵€鏈変复鏈熻褰曞け璐?', err)
    return { success: false, error: err.message }
  }
}

/**
 * 鑾峰彇涓存湡姹囨€荤粺璁★紙绠＄悊鍛樼敤锛?
 * @param {number} days - 鎻愬墠澶╂暟
 * @param {string} district - 杈栧尯锛堝彲閫夛級
 */
async function getExpiringSummary(days, district) {
  try {
    const result = await getAllExpiring(days, district)
    if (!result.success) return result
    
    const { enterpriseStats, summary } = result.data
    
    // 鑾峰彇浼佷笟鑱旂郴鏂瑰紡
    const enterpriseNames = enterpriseStats.map(e => e.enterpriseName).filter(name => name !== '鏈煡浼佷笟')
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
    
    // 涓烘瘡涓紒涓氭坊鍔犺仈绯绘柟寮?
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
    console.error('鑾峰彇涓存湡姹囨€诲け璐?', err)
    return { success: false, error: err.message }
  }
}

/**
 * 鍙戦€佺煭淇℃彁閱掞紙棰勭暀鎺ュ彛锛?
 * @param {object} event - 鍖呭惈phones, content绛変俊鎭?
 */
async function sendSmsReminder(event) {
  const { phones, content, records } = event
  
  // TODO: 鎺ュ叆鐭俊鏈嶅姟鍟咥PI
  // 绀轰緥锛氶樋閲屼簯鐭俊銆佽吘璁簯鐭俊绛?
  
  debugLog('=== 鐭俊鎻愰啋鎺ュ彛璋冪敤 ===')
  debugLog('鎺ユ敹鍙风爜:', phones)
  debugLog('鎻愰啋鍐呭:', content)
  debugLog('鐩稿叧璁板綍:', records?.length || 0, '鏉?)
  
  // 棰勭暀鐭俊鍙戦€侀€昏緫
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
    message: '鐭俊鎻愰啋鎺ュ彛宸查鐣欙紝璇锋帴鍏ョ煭淇℃湇鍔″晢',
    data: {
      phones,
      content,
      recordCount: records?.length || 0,
      // 鐭俊鍙戦€佺粨鏋滃皢鍦ㄦ杩斿洖
      smsResult: null
    }
  }
}

/**
 * 鍙戦€佸井淇¤闃呮秷鎭?
 * @param {object} event - 鍖呭惈touser, templateId, data绛変俊鎭?
 */
async function sendWxSubscribeMessage(event) {
  const { touser, templateId, page, data } = event
  
  debugLog('=== 寰俊璁㈤槄娑堟伅鍙戦€?===')
  debugLog('鎺ユ敹鐢ㄦ埛:', touser)
  debugLog('妯℃澘ID:', templateId)
  
  try {
    // 璋冪敤寰俊浜戝紑鍙戠殑璁㈤槄娑堟伅鍙戦€佹帴鍙?
    const result = await cloud.openapi.subscribeMessage.send({
      touser: touser,
      templateId: templateId || 'TEMPLATE_ID_PLACEHOLDER', // 闇€瑕佸湪寰俊鍏紬骞冲彴鐢宠
      page: page || 'pages/archive/archive',
      data: data || {
        thing1: { value: '鏅鸿兘鍘嬪姏琛? },
        date2: { value: formatDate(new Date()) },
        thing8: { value: '鎮ㄧ殑璁惧鍗冲皢鍒版湡锛岃鍙婃椂瀹夋帓妫€瀹? }
      },
      miniprogramState: 'formal' // formal: 姝ｅ紡鐗? developer: 寮€鍙戠増, trial: 浣撻獙鐗?
    })
    
    debugLog('璁㈤槄娑堟伅鍙戦€佹垚鍔?', result)
    return {
      success: true,
      message: '璁㈤槄娑堟伅鍙戦€佹垚鍔?,
      data: result
    }
  } catch (err) {
    console.error('璁㈤槄娑堟伅鍙戦€佸け璐?', err)
    return {
      success: false,
      error: err.message || '鍙戦€佸け璐?,
      errCode: err.errCode
    }
  }
}

/**
 * 鎵归噺鍙戦€佹彁閱掞紙寰俊璁㈤槄娑堟伅 + 鐭俊锛?
 * @param {object} event - 鍖呭惈users鏁扮粍绛変俊鎭?
 */
async function batchSendReminder(event) {
  const { users, templateId, message } = event
  
  debugLog('=== 鎵归噺鍙戦€佹彁閱?===')
  debugLog('鐢ㄦ埛鏁伴噺:', users?.length || 0)
  
  const results = {
    wxSuccess: 0,
    wxFail: 0,
    smsSuccess: 0,
    smsFail: 0,
    details: []
  }
  
  for (const user of (users || [])) {
    // 鍙戦€佸井淇¤闃呮秷鎭?
  if (user.openid) {
    const wxResult = await sendWxSubscribeMessage({
      touser: user.openid,
      templateId: templateId,
      page: 'pages/archive/archive',
      data: {
        thing1: { value: '鏅鸿兘鍘嬪姏琛? },
        date2: { value: formatDate(new Date()) },
        thing8: { value: user.message || message || '鎮ㄧ殑璁惧鍗冲皢鍒版湡锛岃鍙婃椂瀹夋帓妫€瀹? }
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
    
    // 鍙戦€佺煭淇★紙濡傛灉鏈夋墜鏈哄彿锛?
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
    message: '鎵归噺鍙戦€佸畬鎴?,
    data: results
  }
}

/**
 * 鑷姩鎵弿骞舵帹閫佸憡璀?(瀹氭椂浠诲姟鏍稿績鍏ュ彛)
 * 涓氬姟閫昏緫锛?
 * 1. 鏌ヨ30澶╁唴鍗冲皢杩囨湡鍜屽凡缁忚繃鏈熺殑璁惧銆?
 * 2. 鍏宠仈浼佷笟绠＄悊鍛樼殑 openid銆?
 * 3. 鑷姩鍙戦€佸井淇¤闃呮秷鎭€?
 */
async function autoScanAndAlert() {
  debugLog('=== 寮€濮嬫墽琛岃嚜鍔ㄩ€炬湡鎵弿涓庨璀︿换鍔?===')
  try {
    const now = new Date()
    const expiryThreshold = new Date()
    expiryThreshold.setDate(now.getDate() + 30) // 鎻愬墠30澶╅璀?
    
    const nowStr = formatDate(now)
    const thresholdStr = formatDate(expiryThreshold)

    // 鏌ヨ鍗冲皢鍦?0澶╁唴鍒版湡鐨勮澶?
    const expiringResult = await db.collection('pressure_records')
      .where({
        expiryDate: _.gte(nowStr).and(_.lte(thresholdStr)),
        status: 'valid' // 蹇呴』鏄湁鏁堝湪鐢ㄧ殑鐘舵€?
      }).get()

    // 鏌ヨ宸茬粡杩囨湡鐨勮澶囷紙闇€瑕佺揣鎬ュ偓妫€锛?
    const expiredResult = await db.collection('pressure_records')
      .where({
        expiryDate: _.lt(nowStr),
        status: 'valid'
      }).get()

    const allAlertRecords = [...expiringResult.data, ...expiredResult.data]
    debugLog(`鎵弿瀹屾垚锛屽彂鐜?${expiringResult.data.length} 鏉′复鏈燂紝${expiredResult.data.length} 鏉￠€炬湡銆俙)

    if (allAlertRecords.length === 0) {
      return { success: true, message: '褰撳墠鏃犻璀﹁澶? }
    }

    // 鎸変紒涓氬綊绫伙紝浠ヤ究鍚堝苟鍙戦€佹垨鑰呮壘鍒板搴旂殑绠＄悊鍛?
    const alertTasks = []
    
    for (const record of allAlertRecords) {
      const isExpired = record.expiryDate < nowStr
      
      // 鎵惧埌璇ヤ紒涓氬搴旂殑娉ㄥ唽绠＄悊鍛?鎴栬礋璐ｄ汉)鐨刼penid
      const entRes = await db.collection('enterprises').where({
        companyName: record.enterpriseName
      }).get()

      if (entRes.data.length > 0 && entRes.data[0]._openid) {
        const adminOpenId = entRes.data[0]._openid
        
        // 缁勮璁㈤槄娑堟伅鍐呭
        if (!DEVICE_EXPIRY_TEMPLATE_ID) {
          continue
        }
        const wxTask = sendWxSubscribeMessage({
          touser: adminOpenId,
          templateId: DEVICE_EXPIRY_TEMPLATE_ID,
          page: `/pages/device-detail/device-detail?id=${record.deviceId || record._id}`,
          data: {
            thing1: { value: (record.deviceName || '鍘嬪姏琛?).substring(0, 20) }, // 鐗╁搧鍚嶇О
            date2: { value: record.expiryDate }, // 鍒版湡鏃ユ湡
            thing8: { value: isExpired ? '璁惧宸查€炬湡锛岃绔嬪嵆鍋滅敤閫佹' : '璁惧鍗冲皢鍒版湡锛岃鍙婃椂瀹夋帓妫€瀹? } // 娓╅Θ鎻愰啋
          }
        })
        alertTasks.push(wxTask)
      }
    }

    const results = await Promise.allSettled(alertTasks)
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length

    debugLog(`棰勮鎺ㄩ€佸畬鎴愶紝鍏辫Е鍙?${alertTasks.length} 娆★紝鎴愬姛 ${successCount} 娆°€俙)
    return { success: true, total: alertTasks.length, successCount }

  } catch (err) {
    console.error('鑷姩鎵弿浠诲姟寮傚父:', err)
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

/**
 * 鏍煎紡鍖栨棩鏈熶负 YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

