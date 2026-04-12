const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { action } = event || {}

  try {
    if (action === 'verifyDevice') return await verifyDevice(event)
    if (action === 'submitEvidence') return await submitEvidence(event)
    if (action === 'listEvidence') return await listEvidence(event)
    return { success: false, error: '未知操作' }
  } catch (e) {
    return { success: false, error: e.message || '服务异常' }
  }
}

async function verifyDevice(event) {
  const { deviceId, qrCode } = event || {}

  let device = null
  if (deviceId) {
    const res = await db.collection('devices').doc(deviceId).get()
    device = res.data || null
  } else if (qrCode) {
    const res = await db.collection('devices').where({ qrCode }).limit(1).get()
    device = res.data && res.data[0] ? res.data[0] : null
  }

  if (!device) return { success: false, error: '未找到设备' }

  const recordRes = await db.collection('pressure_records')
    .where({ deviceId: device._id })
    .orderBy('verificationDate', 'desc')
    .limit(1)
    .get()

  const lastRecord = recordRes.data && recordRes.data[0] ? recordRes.data[0] : null

  const todayStr = formatDate(new Date())
  const expiryDateStr = lastRecord?.expiryDate || ''

  let status = '未建档'
  let daysToExpiry = null
  if (expiryDateStr) {
    const days = diffDays(todayStr, expiryDateStr)
    daysToExpiry = days
    if (days < 0) status = '逾期'
    else if (days <= 30) status = '临期'
    else status = '正常'
  } else if (lastRecord) {
    status = '未知到期'
  }

  return {
    success: true,
    data: {
      device: pickDevice(device),
      lastRecord: lastRecord ? pickRecord(lastRecord) : null,
      verify: {
        status,
        daysToExpiry,
        today: todayStr
      }
    }
  }
}

async function submitEvidence(event) {
  const { deviceId, verifyStatus, remark = '', fileIDs = [], location = null, inspectorName = '' } = event || {}
  if (!deviceId) throw new Error('缺少 deviceId')
  if (!Array.isArray(fileIDs) || fileIDs.length === 0) throw new Error('缺少取证图片')

  const wxContext = cloud.getWXContext()
  const inspectorOpenid = wxContext.OPENID

  const deviceRes = await db.collection('devices').doc(deviceId).get()
  const device = deviceRes.data
  if (!device) throw new Error('设备不存在')

  const latestCaseRes = await db.collection('enforcement_cases')
    .where({ deviceId })
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get()

  const prevHash = latestCaseRes.data && latestCaseRes.data[0] ? (latestCaseRes.data[0].caseHash || '') : ''

  const evidenceItems = []
  for (const fileID of fileIDs) {
    const hash = await sha256OfCloudFile(fileID)
    const item = {
      deviceId,
      fileID,
      sha256: hash,
      createTime: formatDateTime(new Date()),
      timestamp: Date.now()
    }
    const addRes = await db.collection('evidence_items').add({ data: item })
    evidenceItems.push({ ...item, _id: addRes._id })
  }

  const payload = {
    deviceId,
    deviceName: device.deviceName || '',
    deviceNo: device.deviceNo || '',
    factoryNo: device.factoryNo || '',
    verifyStatus: verifyStatus || '',
    remark,
    location,
    inspectorOpenid,
    inspectorName: inspectorName || '',
    evidence: evidenceItems.map(i => ({ fileID: i.fileID, sha256: i.sha256 })),
    prevHash,
    timestamp: Date.now()
  }

  const caseHash = sha256OfString(stableStringify(payload))
  const caseData = {
    ...payload,
    caseHash,
    createTime: formatDateTime(new Date())
  }

  const caseRes = await db.collection('enforcement_cases').add({ data: caseData })

  return { success: true, data: { caseId: caseRes._id, caseHash } }
}

async function listEvidence(event) {
  const { deviceId, limit = 20 } = event || {}
  if (!deviceId) throw new Error('缺少 deviceId')
  const res = await db.collection('enforcement_cases')
    .where({ deviceId })
    .orderBy('timestamp', 'desc')
    .limit(Math.min(50, Math.max(1, limit)))
    .get()
  return { success: true, data: res.data || [] }
}

async function sha256OfCloudFile(fileID) {
  const fileRes = await cloud.downloadFile({ fileID })
  const buf = fileRes.fileContent
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function sha256OfString(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex')
}

function stableStringify(obj) {
  return JSON.stringify(sortKeysDeep(obj))
}

function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep)
  if (v && typeof v === 'object') {
    const out = {}
    Object.keys(v).sort().forEach(k => { out[k] = sortKeysDeep(v[k]) })
    return out
  }
  return v
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateTime(date) {
  const ymd = formatDate(date)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${ymd} ${hh}:${mm}:${ss}`
}

function diffDays(fromYmd, toYmd) {
  const from = new Date(fromYmd + 'T00:00:00')
  const to = new Date(toYmd + 'T00:00:00')
  const ms = to.getTime() - from.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

function pickDevice(d) {
  return {
    _id: d._id,
    deviceName: d.deviceName || '',
    deviceNo: d.deviceNo || '',
    factoryNo: d.factoryNo || '',
    status: d.status || '',
    qrCode: d.qrCode || '',
    qrCodeImage: d.qrCodeImage || ''
  }
}

function pickRecord(r) {
  return {
    _id: r._id,
    enterpriseName: r.enterpriseName || '',
    district: r.district || '',
    conclusion: r.conclusion || '',
    verificationDate: r.verificationDate || '',
    expiryDate: r.expiryDate || '',
    certNo: r.certNo || '',
    factoryNo: r.factoryNo || ''
  }
}

