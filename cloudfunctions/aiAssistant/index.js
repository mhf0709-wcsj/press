const cloud = require('wx-server-sdk')
const https = require('https')
const { getKnowledgeBase, getRelevantKnowledge } = require('./knowledge')
const { buildVector, cosine, chunkText, formatDateTime } = require('./rag')
const { createCrudHandlers } = require('./crud')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const { planCrudAction, executeCrudAction } = createCrudHandlers({ db, _, formatDateTime })
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || ''
const DASHSCOPE_MODEL = process.env.DASHSCOPE_MODEL || 'qwen3.5-flash'
const DASHSCOPE_ENDPOINT = process.env.DASHSCOPE_ENDPOINT || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

/**
 * AI鏅鸿兘绠″浜戝嚱鏁?
 * 鍔熻兘锛?
 * 1. 涓撲笟鐭ヨ瘑闂瓟
 * 2. 浼佷笟鏁版嵁鏅鸿兘鏌ヨ
 * 
 * 鏉冮檺鍒嗙锛?
 * - 浼佷笟绔細鍙兘鏌ヨ鏈紒涓氭暟鎹?
 * - 杈栧尯绠＄悊鍛橈細鍙兘鏌ヨ鏈緰鍖烘暟鎹?
 * - 鎬荤鐞嗗憳锛氬彲鏌ヨ鎵€鏈夋暟鎹?
 */
exports.main = async (event, context) => {
  const { action, question, userType, userInfo } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    if (action === 'extractRecordFromImage') {
      return await handleImageExtraction(event)
    }

    if (action === 'kbInit') {
      await seedKbIfNeeded()
      return { success: true, answer: '鐭ヨ瘑搴撳垵濮嬪寲瀹屾垚' }
    }

    // 瑙ｆ瀽鐢ㄦ埛鏉冮檺
    const permission = parsePermission(userType, userInfo, openid)

    if (action === 'crudPlan') {
      const structuredIntent = await rewriteCrudIntent(String(question || ''), permission)
      return await planCrudAction({
        question: String(question || ''),
        permission,
        structuredIntent
      })
    }

    if (action === 'crudExecute') {
      return await executeCrudAction({
        payload: event.payload || {},
        permission
      })
    }
    
    // 1. 妫€娴嬮棶棰樻剰鍥?
    const intent = detectIntent(question)
    
    // 2. 鏍规嵁鎰忓浘澶勭悊
    let answer = ''
    
    if (intent.type === 'data_query') {
      // 鏁版嵁鏌ヨ绫婚棶棰?
      answer = await handleDataQuery(intent, permission)
    } else if (intent.type === 'rag') {
      answer = await tryModelAnswer(question, intent, permission) || await handleRagQuery(question, permission)
    } else if (intent.type === 'knowledge') {
      // 涓撲笟鐭ヨ瘑绫婚棶棰?
      answer = await tryModelAnswer(question, intent, permission) || handleKnowledgeQuery(question, intent)
    } else {
      // 閫氱敤闂瓟
      answer = await tryModelAnswer(question, intent, permission) || handleGeneralQuery(question, permission)
    }

    return {
      success: true,
      answer
    }
  } catch (error) {
    console.error('AI澶勭悊閿欒:', error)
    return {
      success: false,
      answer: '鎶辨瓑锛屽鐞嗘偍鐨勯棶棰樻椂鍑虹幇浜嗛敊璇紝璇风◢鍚庡啀璇曘€?
    }
  }
}

async function tryModelAnswer(question, intent, permission) {
  if (!DASHSCOPE_API_KEY) return ''
  if (!question) return ''

  try {
    const references = await collectModelReferences(question, intent)
    const systemPrompt = [
      '\u4f60\u662f\u538b\u529b\u8868\u68c0\u5b9a AI \u667a\u80fd\u7ba1\u5bb6\u3002',
      '\u8bf7\u4f18\u5148\u6839\u636e\u7ed9\u5b9a\u8d44\u6599\u56de\u7b54\uff0c\u4e0d\u8981\u7f16\u9020\u6cd5\u89c4\u3001\u6807\u51c6\u6216\u4e1a\u52a1\u6570\u636e\u3002',
      '\u5982\u679c\u8d44\u6599\u4e0d\u8db3\uff0c\u8bf7\u660e\u786e\u8bf4\u660e\u6839\u636e\u73b0\u6709\u8d44\u6599\u6682\u65e0\u6cd5\u786e\u5b9a\uff0c\u5e76\u5efa\u8bae\u7528\u6237\u67e5\u770b\u6b63\u5f0f\u89c4\u7a0b\u6216\u8865\u5145\u6761\u4ef6\u3002',
      '\u56de\u7b54\u8bf7\u4f7f\u7528\u7b80\u4f53\u4e2d\u6587\uff0c\u98ce\u683c\u4e13\u4e1a\u3001\u76f4\u63a5\u3001\u6613\u6267\u884c\u3002',
      `\u5f53\u524d\u7528\u6237\u6743\u9650\u8303\u56f4\uff1a${buildPermissionLabel(permission)}\u3002`
    ].join('\n')

    const userPrompt = [
      `\u7528\u6237\u95ee\u9898\uff1a${question}`,
      references
        ? `\u53ef\u7528\u8d44\u6599\uff1a\n${references}`
        : '\u53ef\u7528\u8d44\u6599\uff1a\u6682\u65e0\u989d\u5916\u8d44\u6599\uff0c\u8bf7\u8c28\u614e\u56de\u7b54\u3002'
    ].join('\n\n')

    return await callDashScopeChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])
  } catch (error) {
    console.error('DashScope model answer failed:', error)
    return ''
  }
}

async function rewriteCrudIntent(question, permission) {
  if (!DASHSCOPE_API_KEY || !question) return null

  try {
    const systemPrompt = [
      '你是压力表检定系统的意图改写器。',
      '请把用户自然语言改写成结构化 CRUD 意图。',
      '只返回 JSON，不要返回解释、Markdown 或代码块。',
      'operation 只能是 query、update、delete、create。',
      'entity 只能是 device、equipment、pressure_record。',
      'target 允许字段：factoryNo、certNo、deviceNo、equipmentNo、deviceName、equipmentName、rawCode、tailCode、ambiguousCode。',
      'changes 允许字段：status、conclusion、verificationDate、modelSpec、instrumentName、manufacturer、sendUnit、location、district。',
      '如果编号太模糊、对象不明确或关键信息不足，请返回 needClarify=true，并给出 clarifyQuestion。',
      `当前用户权限范围：${buildPermissionLabel(permission)}。`
    ].join('\n')

    const userPrompt = [
      `用户原话：${question}`,
      '请输出 JSON，例如：',
      '{"operation":"query","entity":"device","target":{"factoryNo":"24013931"},"changes":{},"needClarify":false,"clarifyQuestion":""}'
    ].join('\n')

    const content = await callDashScopeChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    const parsed = parseCrudIntentJson(content)
    if (!parsed) return null
    const sanitized = sanitizeCrudIntent(parsed)
    console.log('CRUD rewrite log:', JSON.stringify({
      question,
      permission: buildPermissionLabel(permission),
      raw: content,
      sanitized
    }))
    return sanitized
  } catch (error) {
    console.error('rewriteCrudIntent failed:', error)
    return null
  }
}

function sanitizeCrudIntent(intent) {
  const allowedOperations = ['query', 'update', 'delete', 'create']
  const allowedEntities = ['device', 'equipment', 'pressure_record']
  const allowedTargetKeys = ['factoryNo', 'certNo', 'deviceNo', 'equipmentNo', 'deviceName', 'equipmentName', 'rawCode', 'tailCode', 'ambiguousCode']
  const allowedChangeKeys = ['status', 'conclusion', 'verificationDate', 'modelSpec', 'instrumentName', 'manufacturer', 'sendUnit', 'location', 'district']

  const operation = allowedOperations.includes(intent.operation) ? intent.operation : ''
  const entity = allowedEntities.includes(intent.entity) ? intent.entity : ''
  const target = pickAllowedKeys(intent.target, allowedTargetKeys)
  const changes = pickAllowedKeys(intent.changes, allowedChangeKeys)
  const needClarify = !!intent.needClarify
  const clarifyQuestion = typeof intent.clarifyQuestion === 'string' ? intent.clarifyQuestion.trim() : ''

  return {
    operation,
    entity,
    target,
    changes,
    needClarify,
    clarifyQuestion,
    debugSummary: buildCrudIntentDebugSummary({ operation, entity, target, changes, needClarify, clarifyQuestion })
  }
}

function pickAllowedKeys(source, allowedKeys) {
  const result = {}
  if (!source || typeof source !== 'object') return result
  allowedKeys.forEach((key) => {
    if (source[key] === undefined || source[key] === null || source[key] === '') return
    result[key] = source[key]
  })
  return result
}

function buildCrudIntentDebugSummary(intent) {
  const operationLabelMap = {
    query: '查询',
    update: '修改',
    delete: '删除',
    create: '新增'
  }
  const entityLabelMap = {
    device: '压力表',
    equipment: '设备',
    pressure_record: '检定记录'
  }
  const fieldLabelMap = {
    factoryNo: '出厂编号',
    certNo: '证书编号',
    deviceNo: '设备编号',
    equipmentNo: '所属设备编号',
    deviceName: '压力表名称',
    equipmentName: '设备名称',
    rawCode: '原始编号',
    tailCode: '编号尾号',
    ambiguousCode: '待确认编号',
    status: '压力表状态',
    conclusion: '检定结论',
    verificationDate: '检定日期',
    modelSpec: '型号规格',
    instrumentName: '仪表名称',
    manufacturer: '制造单位',
    sendUnit: '送检单位',
    location: '位置',
    district: '辖区'
  }
  const parts = []
  if (intent.operation) parts.push(`操作：${operationLabelMap[intent.operation] || intent.operation}`)
  if (intent.entity) parts.push(`对象：${entityLabelMap[intent.entity] || intent.entity}`)
  if (Object.keys(intent.target || {}).length) parts.push(`定位：${formatDebugFields(intent.target, fieldLabelMap)}`)
  if (Object.keys(intent.changes || {}).length) parts.push(`修改：${formatDebugFields(intent.changes, fieldLabelMap)}`)
  if (intent.needClarify && intent.clarifyQuestion) parts.push(`追问：${intent.clarifyQuestion}`)
  return parts.join(' | ')
}

function formatDebugFields(source, labelMap) {
  return Object.keys(source || {})
    .map((key) => `${labelMap[key] || key}=${source[key]}`)
    .join('，')
}
function parseCrudIntentJson(content) {
  if (!content) return null
  const trimmed = String(content).trim()
  const jsonText = extractFirstJsonObject(trimmed)
  if (!jsonText) return null

  try {
    const parsed = JSON.parse(jsonText)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      operation: parsed.operation || '',
      entity: parsed.entity || '',
      target: parsed.target && typeof parsed.target === 'object' ? parsed.target : {},
      changes: parsed.changes && typeof parsed.changes === 'object' ? parsed.changes : {},
      needClarify: !!parsed.needClarify,
      clarifyQuestion: parsed.clarifyQuestion || ''
    }
  } catch (error) {
    console.error('parseCrudIntentJson failed:', error)
    return null
  }
}

function extractFirstJsonObject(text) {
  const firstBrace = text.indexOf('{')
  if (firstBrace < 0) return ''

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = firstBrace; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return text.slice(firstBrace, i + 1)
      }
    }
  }

  return ''
}

async function collectModelReferences(question, intent) {
  if (intent.type === 'rag') {
    try {
      await seedKbIfNeeded()
      const qv = buildVector(question)
      const chunkRes = await db.collection('kb_chunks').limit(500).get()
      const chunks = chunkRes.data || []

      return chunks
        .map((chunk) => ({ content: chunk.content, score: cosine(qv, chunk.vector || []) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .filter((item) => item.score > 0.1)
        .map((item, index) => `\u53c2\u8003${index + 1}\uff1a${item.content}`)
        .join('\n\n')
    } catch (error) {
      console.error('collectModelReferences failed:', error)
    }
  }

  return getRelevantKnowledge(question) || ''
}

function buildPermissionLabel(permission) {
  if (!permission) return '\u8bbf\u5ba2'
  if (permission.type === 'enterprise') return `${permission.scope || ''} \u4f01\u4e1a\u7528\u6237`.trim()
  if (permission.type === 'district_admin') return `${permission.scope || ''} \u8f96\u533a\u7ba1\u7406\u5458`.trim()
  if (permission.type === 'super_admin') return '\u603b\u7ba1\u7406\u5458'
  return '\u8bbf\u5ba2'
}

async function callDashScopeChat(messages) {
  const payload = JSON.stringify({
    model: DASHSCOPE_MODEL,
    messages,
    temperature: 0.2
  })

  return new Promise((resolve, reject) => {
    const request = https.request(DASHSCOPE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (response) => {
      let body = ''

      response.on('data', (chunk) => {
        body += chunk
      })

      response.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}')
          const statusCode = response.statusCode || 0
          const content = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message
            ? parsed.choices[0].message.content
            : ''

          if (statusCode >= 200 && statusCode < 300 && content) {
            resolve(String(content).trim())
            return
          }

          console.error('DashScope response error:', {
            statusCode,
            body: body ? String(body).slice(0, 500) : ''
          })
          reject(new Error((parsed && parsed.error && parsed.error.message) || parsed.message || `DashScope request failed with status ${statusCode}`))
        } catch (error) {
          console.error('DashScope response parse error:', {
            statusCode: response.statusCode || 0,
            body: body ? String(body).slice(0, 500) : ''
          })
          reject(error)
        }
      })
    })

    request.on('error', reject)
    request.setTimeout(15000, () => {
      request.destroy(new Error('DashScope request timed out'))
    })
    request.write(payload)
    request.end()
  })
}

async function handleImageExtraction(event) {
  const rawText = String(event.ocrText || '').trim()
  if (!rawText) {
    return {
      success: false,
      error: 'No OCR text available for extraction.'
    }
  }

  const data = extractRecordFields(rawText)
  return {
    success: true,
    data: {
      ...data,
      ocrSource: 'ai_extract',
      rawText,
      confidence: estimateConfidence(data)
    }
  }
}

function extractRecordFields(text) {
  const result = {
    certNo: '',
    factoryNo: '',
    sendUnit: '',
    instrumentName: '',
    modelSpec: '',
    manufacturer: '',
    verificationStd: '',
    conclusion: '',
    verificationDate: ''
  }

  const normalized = normalizeExtractText(text)

  result.certNo = firstMatch(normalized, [
    /(?:璇佷功缂栧彿|璇佷功鍙穦缂栧彿|NO|No)[:锛歕s]*([A-Za-z0-9\-]{5,})/i
  ])

  result.factoryNo = firstMatch(normalized, [
    /(?:鍑哄巶缂栧彿|鍑哄巶鍙穦鍣ㄥ彿|琛ㄥ彿)[:锛歕s]*([A-Za-z0-9\-\/]{3,})/i
  ])

  result.sendUnit = cleanupLineValue(firstMatch(normalized, [
    /(?:閫佹鍗曚綅|濮旀墭鍗曚綅|浣跨敤鍗曚綅)[:锛歕s]*([^\n]+)/i
  ]))

  result.instrumentName = cleanupLineValue(firstMatch(normalized, [
    /(?:鍣ㄥ叿鍚嶇О|浠〃鍚嶇О|鍚嶇О)[:锛歕s]*([^\n]+)/i
  ]))

  if (!result.instrumentName && /鍘嬪姏琛?.test(normalized)) {
    result.instrumentName = '\u538b\u529b\u8868'
  }

  result.modelSpec = cleanupLineValue(firstMatch(normalized, [
    /(?:鍨嬪彿瑙勬牸|瑙勬牸鍨嬪彿|鍨嬪彿|瑙勬牸)[:锛歕s]*([^\n]+)/i,
    /([\(锛圿?\d+(?:\.\d+)?\s*(?:-|~|锝?\s*\d+(?:\.\d+)?[)锛塢?\s*(?:k|M|G)?Pa)/i
  ]))

  result.manufacturer = cleanupLineValue(firstMatch(normalized, [
    /(?:鍒堕€犲崟浣峾鐢熶骇鍘傚|鍒堕€犲巶|鍘傚)[:锛歕s]*([^\n]+)/i
  ]))

  result.verificationStd = normalizeStd(firstMatch(normalized, [
    /(JJG\s*[\d\-]+)/i
  ]))

  result.conclusion = extractConclusion(normalized)
  result.verificationDate = extractDate(normalized)

  return result
}

function normalizeExtractText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[锛歖/g, ':')
    .replace(/[锛圿/g, '(')
    .replace(/[锛塢/g, ')')
    .replace(/[ \t]+/g, ' ')
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) return match[1].trim()
  }
  return ''
}

function cleanupLineValue(value) {
  if (!value) return ''
  return String(value)
    .split(/\n/)[0]
    .split(/(?:璇佷功缂栧彿|鍑哄巶缂栧彿|鍨嬪彿瑙勬牸|鍒堕€犲崟浣峾妫€瀹氫緷鎹畖妫€瀹氱粨璁簗妫€瀹氭棩鏈?/)[0]
    .trim()
}

function normalizeStd(value) {
  if (!value) return ''
  return String(value).replace(/\s+/g, '').replace(/^JJG/i, 'JJG')
}

function extractConclusion(text) {
  if (/涓嶅悎鏍?.test(text)) return '\u4e0d\u5408\u683c'
  if (/鍚堟牸|绗﹀悎/.test(text)) return '\u5408\u683c'
  return ''
}

function extractDate(text) {
  const match = text.match(/(\d{4})[.\-/骞碷\s*(\d{1,2})[.\-/鏈圿\s*(\d{1,2})/)
  if (!match) return ''
  const month = String(match[2]).padStart(2, '0')
  const day = String(match[3]).padStart(2, '0')
  return `${match[1]}-${month}-${day}`
}

function estimateConfidence(data) {
  const fields = [
    'certNo',
    'factoryNo',
    'sendUnit',
    'instrumentName',
    'modelSpec',
    'manufacturer',
    'verificationStd',
    'conclusion',
    'verificationDate'
  ]
  const hitCount = fields.filter((key) => data[key]).length
  return Number((hitCount / fields.length).toFixed(2))
}

/**
 * 瑙ｆ瀽鐢ㄦ埛鏉冮檺
 */
function parsePermission(userType, userInfo, openid) {
  const permission = {
    type: 'guest',
    scope: '鏈櫥褰?,
    query: {},
    canQueryAll: false
  }

  if (userType === 'enterprise' && userInfo) {
    // 浼佷笟绔敤鎴?- 鍙兘鏌ョ湅鏈紒涓氭暟鎹?
    permission.type = 'enterprise'
    permission.scope = userInfo.companyName || '鏈紒涓?
    permission.query = { 
      _openid: openid  // 浼佷笟鐢ㄦ埛鎸塷penid闄愬埗
    }
    // 濡傛灉鏈変紒涓氬悕绉帮紝涔熷彲浠ユ寜浼佷笟鍚嶆煡璇?
    if (userInfo.companyName) {
      permission.query = {
        _: _.or([
          { _openid: openid },
          { enterpriseName: userInfo.companyName },
          { companyName: userInfo.companyName }
        ])
      }
    }
  } else if (userType === 'admin' && userInfo) {
    if (userInfo.role === 'super' || userInfo.role === 'admin' || !userInfo.district) {
      // 鎬荤鐞嗗憳 - 鍙煡鐪嬫墍鏈夋暟鎹?
      permission.type = 'super_admin'
      permission.scope = '鍏ㄩ儴杈栧尯'
      permission.query = {}  // 鏃犻檺鍒?
      permission.canQueryAll = true
    } else if (userInfo.district) {
      // 杈栧尯绠＄悊鍛?- 鍙兘鏌ョ湅鏈緰鍖烘暟鎹?
      permission.type = 'district_admin'
      permission.scope = userInfo.district
      permission.query = { district: userInfo.district }
    }
  }

  return permission
}

/**
 * 妫€娴嬮棶棰樻剰鍥?
 */
function detectIntent(question) {
  const q = question.toLowerCase()
  
  // 鏁版嵁鏌ヨ鎰忓浘鍏抽敭璇?
  const dataQueryKeywords = {
    expiring: ['鍒版湡', '鍗冲皢鍒版湡', '蹇埌鏈?, '杩囨湡', '鏈夋晥鏈?],
    count: ['澶氬皯', '鍑犱釜', '鍑犲彴', '鏁伴噺', '缁熻'],
    unverified: ['娌℃湁妫€瀹?, '鏈瀹?, '娌℃瀹?, '寰呮瀹?],
    monthly: ['鏈湀', '杩欎釜鏈?, '褰撴湀'],
    yearly: ['浠婂勾', '鏈勾', '骞村害'],
    qualified: ['鍚堟牸', '涓嶅悎鏍?, '閫氳繃', '鏈€氳繃'],
    list: ['鍒楄〃', '娓呭崟', '鏄庣粏', '鍝簺']
  }

  // 鐭ヨ瘑闂瓟鎰忓浘鍏抽敭璇?
  const knowledgeKeywords = ['鍛ㄦ湡', '瑙勭▼', '鏍囧噯', '瑕佹眰', '瑙勫畾', '鎬庝箞', '濡備綍', '浠€涔堟槸', '涓轰粈涔?]
  const ragKeywords = ['娉曡', '娉曞緥', '鎵ф硶', '澶勭綒', '渚濇嵁', '鏉℃', '璁￠噺娉?, 'jjg', '瑙勭▼渚濇嵁', '鍚堣']

  // 鍒ゆ柇鎰忓浘
  let intent = { type: 'general', subType: null }

  // 妫€鏌ユ槸鍚︿负鏁版嵁鏌ヨ
  for (const [subType, keywords] of Object.entries(dataQueryKeywords)) {
    if (keywords.some(k => q.includes(k))) {
      intent = { type: 'data_query', subType }
      break
    }
  }

  // 濡傛灉涓嶆槸鏁版嵁鏌ヨ锛屾鏌ユ槸鍚︿负鐭ヨ瘑闂瓟
  if (intent.type === 'general') {
    if (ragKeywords.some(k => q.includes(k))) {
      intent = { type: 'rag', subType: null }
    }
  }

  if (intent.type === 'general') {
    if (knowledgeKeywords.some(k => q.includes(k))) {
      intent = { type: 'knowledge', subType: null }
    }
  }

  return intent
}

async function seedKbIfNeeded() {
  const probe = await db.collection('kb_chunks').limit(1).get()
  const has = probe.data && probe.data.length > 0
  if (has) return

  const kb = getKnowledgeBase()
  const docRes = await db.collection('kb_docs').add({
    data: {
      title: '鍘嬪姏琛ㄦ瀹氫笓涓氱煡璇嗗簱',
      source: 'built_in',
      createTime: formatDateTime(new Date()),
      timestamp: Date.now()
    }
  })
  const docId = docRes._id
  const chunks = chunkText(kb, 360)
  const writes = chunks.map((content, idx) => {
    const vector = buildVector(content)
    return db.collection('kb_chunks').add({
      data: {
        docId,
        chunkIndex: idx,
        content,
        vector,
        createTime: formatDateTime(new Date()),
        timestamp: Date.now()
      }
    })
  })
  await Promise.all(writes)
}

async function handleRagQuery(question, permission) {
  try {
    await seedKbIfNeeded()
  } catch (e) {
    const fallback = getRelevantKnowledge(question) || ''
    return fallback ? `鍙傝€冧俊鎭細\n${fallback}\n\n鎻愮ず锛氬闇€鍚敤鍙函婧愮殑鐭ヨ瘑搴撴绱紝璇峰厛鍦ㄤ簯鏁版嵁搴撳垱寤?kb_docs 涓?kb_chunks 闆嗗悎銆俙 : '鐭ヨ瘑搴撴殏涓嶅彲鐢紝璇风◢鍚庡啀璇曘€?
  }

  const qv = buildVector(question)
  const chunkRes = await db.collection('kb_chunks').limit(500).get()
  const chunks = chunkRes.data || []
  const scored = chunks
    .map(c => ({ c, score: cosine(qv, c.vector || []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const excerpts = scored
    .filter(s => s.score > 0.1)
    .map((s, i) => `銆愬弬鑰?{i + 1}銆?{s.c.content}`)
    .join('\n\n')

  if (!excerpts) {
    const fallback = getRelevantKnowledge(question) || ''
    return fallback ? `鍙傝€冧俊鎭細\n${fallback}` : '鏈绱㈠埌瓒冲鐩稿叧鐨勫悎瑙勪緷鎹€傚缓璁ˉ鍏呴棶棰樺叧閿瘝锛堝锛氭瀹氬懆鏈?寮哄埗妫€瀹?涓嶅悎鏍煎垽瀹氾級銆?
  }

  return `鍚堣鍙傝€冿紙鍙拷婧紩鐢級锛歕n\n${excerpts}\n\n濡傞渶鎴戠粰鍑烘洿绮惧噯鐨勬墽娉曞彛寰勶紝璇疯ˉ鍏咃細鍦烘櫙锛堜紒涓氳嚜鐢?寮烘鑼冨洿/鍘嬪姏瀹瑰櫒閰嶅锛夈€佽澶囩敤閫斻€佹瀹氱粨璁轰笌鍒版湡鏃ユ湡銆俙
}

/**
 * 澶勭悊鏁版嵁鏌ヨ
 */
async function handleDataQuery(intent, permission) {
  const collection = db.collection('pressure_records')
  
  // 鏍规嵁鏉冮檺鏋勫缓鏌ヨ鏉′欢
  const query = permission.query
  const scopeDesc = getScopeDescription(permission)

  const today = new Date()
  const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  try {
    switch (intent.subType) {
      case 'expiring': {
        // 鏌ヨ鍗冲皢鍒版湡鐨勮澶?
        const result = await collection.where({
          ...query,
          nextVerificationDate: _.lte(thirtyDaysLater)
        }).count()
        
        return `馃搳 ${scopeDesc}

鐩墠鏈?**${result.total} 鍙?*鍘嬪姏琛ㄥ皢鍦?0澶╁唴鍒版湡锛岄渶瑕佸畨鎺掓瀹氥€?

寤鸿灏藉揩鑱旂郴妫€瀹氭満鏋勮繘琛屾瀹氾紝閬垮厤瓒呮湡浣跨敤銆俙
      }
      
      case 'count':
      case 'unverified': {
        // 鏌ヨ鎬绘暟
        const result = await collection.where(query).count()
        return `馃搳 ${scopeDesc}

鍏辨湁 **${result.total} 鏉?*鍘嬪姏琛ㄦ瀹氳褰曘€?

濡傞渶浜嗚В鏇磋缁嗙殑淇℃伅锛屽彲浠ュ湪"鎴戠殑瀛樻。"涓煡鐪嬪畬鏁村垪琛ㄣ€俙
      }
      
      case 'monthly': {
        // 鏈湀妫€瀹氱粺璁?
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        const result = await collection.where({
          ...query,
          verificationDate: _.gte(startOfMonth)
        }).count()
        
        return `馃搳 ${scopeDesc}

鏈湀锛?{today.getMonth() + 1}鏈堬級宸插畬鎴?**${result.total} 鍙?*鍘嬪姏琛ㄧ殑妫€瀹氳褰曘€俙
      }
      
      case 'yearly': {
        // 鏈勾妫€瀹氱粺璁?
        const startOfYear = new Date(today.getFullYear(), 0, 1)
        const result = await collection.where({
          ...query,
          verificationDate: _.gte(startOfYear)
        }).count()
        
        return `馃搳 ${scopeDesc}

浠婂勾宸插畬鎴?**${result.total} 鍙?*鍘嬪姏琛ㄧ殑妫€瀹氳褰曘€俙
      }
      
      case 'qualified': {
        // 鍚堟牸鐜囩粺璁?
        const total = await collection.where(query).count()
        const qualified = await collection.where({
          ...query,
          conclusion: '鍚堟牸'
        }).count()
        const unqualified = total.total - qualified.total
        
        if (total.total === 0) {
          return `馃搳 ${scopeDesc}

鏆傛棤妫€瀹氳褰曟暟鎹€俙
        }
        
        const rate = ((qualified.total / total.total) * 100).toFixed(1)
        return `馃搳 ${scopeDesc}

妫€瀹氬悎鏍肩巼锛?*${rate}%**

鈥?鎬昏锛?{total.total} 鍙?
鈥?鍚堟牸锛?{qualified.total} 鍙?鉁?
鈥?涓嶅悎鏍硷細${unqualified} 鍙?鉂宍
      }
      
      case 'list': {
        // 鏌ヨ鍒楄〃姒傝
        const total = await collection.where(query).count()
        const expiring = await collection.where({
          ...query,
          nextVerificationDate: _.lte(thirtyDaysLater)
        }).count()
        
        return `馃搳 ${scopeDesc}

鏁版嵁姒傝锛?
鈥?鎬昏褰曟暟锛?{total.total} 鏉?
鈥?鍗冲皢鍒版湡锛?{expiring.total} 鍙?

璇︾粏鍒楄〃璇峰湪"鎴戠殑瀛樻。"鎴?绠＄悊绔?涓煡鐪嬨€俙
      }
      
      default: {
        const result = await collection.where(query).count()
        return `馃搳 ${scopeDesc}

鍏辨湁 **${result.total} 鏉?*妫€瀹氳褰曘€?

鎮ㄥ彲浠ラ棶鎴戞洿鍏蜂綋鐨勯棶棰橈紝姣斿锛?
鈥?"鏈夊灏戣澶囧嵆灏嗗埌鏈燂紵"
鈥?"鏈湀妫€瀹氫簡澶氬皯鍙帮紵"
鈥?"妫€瀹氬悎鏍肩巼鏄灏戯紵"`
      }
    }
  } catch (error) {
    console.error('鏁版嵁鏌ヨ閿欒:', error)
    return '鏌ヨ鏁版嵁鏃跺嚭鐜伴棶棰橈紝璇风◢鍚庡啀璇曘€?
  }
}

/**
 * 鑾峰彇鏉冮檺鑼冨洿鎻忚堪
 */
function getScopeDescription(permission) {
  switch (permission.type) {
    case 'enterprise':
      return `銆?{permission.scope}銆戞暟鎹煡璇㈢粨鏋渀
    case 'district_admin':
      return `銆?{permission.scope}杈栧尯銆戞暟鎹煡璇㈢粨鏋渀
    case 'super_admin':
      return `銆愬叏骞冲彴銆戞暟鎹煡璇㈢粨鏋渀
    default:
      return `鏁版嵁鏌ヨ缁撴灉`
  }
}

/**
 * 澶勭悊鐭ヨ瘑闂瓟
 */
function handleKnowledgeQuery(question, intent) {
  const q = question.toLowerCase()
  
  // 妫€瀹氬懆鏈?
  if (q.includes('鍛ㄦ湡') || q.includes('澶氫箙') || q.includes('棰戠巼')) {
    return `鏍规嵁JJG52-2013銆婂脊鎬у厓浠跺紡涓€鑸帇鍔涜〃妫€瀹氳绋嬨€嬭瀹氾細

馃搮 **妫€瀹氬懆鏈燂細6涓湀锛堝崐骞达級**

浠ヤ笅鎯呭喌闇€瑕佹瀹氾細
1. 鏂拌喘缃殑鍘嬪姏琛ㄩ娆′娇鐢ㄥ墠
2. 淇悊鍚庣殑鍘嬪姏琛?
3. 闀挎湡鍋滅敤鍚庨噸鏂颁娇鐢ㄥ墠
4. 瀹氭湡鍛ㄦ湡妫€瀹氾紙姣?涓湀锛?

馃挕 鎻愮ず锛氱敤浜庡畨鍏ㄩ槻鎶ゃ€佽锤鏄撶粨绠楃殑鍘嬪姏琛ㄥ睘浜庡己鍒舵瀹氾紝蹇呴』鎸夋湡閫佹銆俙
  }
  
  // 涓嶅悎鏍兼爣鍑?
  if (q.includes('涓嶅悎鏍?) || q.includes('鍒ゅ畾')) {
    return `鍘嬪姏琛ㄦ瀹氫笉鍚堟牸鐨勫垽瀹氭爣鍑嗭細

鉂?**涓嶅悎鏍兼儏褰細**
1. 绀哄€艰宸秴杩囧厑璁歌宸?
2. 鍥炵▼璇樊瓒呰繃鍏佽璇樊
3. 杞绘暡浣嶇Щ瓒呰繃鍏佽璇樊鐨?/2
4. 鎸囬拡涓嶈兘鍥為浂鎴栭浂鐐硅宸秴鏍?
5. 澶栬缂洪櫡褰卞搷姝ｅ父璇绘暟

馃搳 **鍑嗙‘搴︾瓑绾т笌鍏佽璇樊锛?*
鈥?1.0绾э細卤1.0%
鈥?1.6绾э細卤1.6%
鈥?2.5绾э細卤2.5%
鈥?4.0绾э細卤4.0%`
  }
  
  // 鏇存崲鏍囧噯
  if (q.includes('鏇存崲') || q.includes('鎶ュ簾')) {
    return `鍘嬪姏琛ㄩ渶瑕佹洿鎹㈢殑鎯呭舰锛?

馃攧 **蹇呴』鏇存崲锛?*
1. 鎸囬拡寮洸銆佹姌鏂垨鏉惧姩
2. 琛ㄧ洏鐜荤拑鐮寸
3. 琛ㄧ洏鍒诲害妯＄硦涓嶆竻
4. 鎺ュご铻虹汗鎹熷潖
5. 杩炵画涓ゆ妫€瀹氫笉鍚堟牸
6. 瓒呰繃浣跨敤骞撮檺锛堜竴鑸?-8骞达級

鈿狅笍 浣跨敤鎹熷潖鐨勫帇鍔涜〃鍙兘瀵艰嚧瀹夊叏浜嬫晠锛岃鍙婃椂鏇存崲锛乣
  }
  
  // 鍑嗙‘搴︾瓑绾?
  if (q.includes('鍑嗙‘搴?) || q.includes('绛夌骇') || q.includes('绮惧害')) {
    return `鍘嬪姏琛ㄥ噯纭害绛夌骇璇存槑锛?

馃搹 **甯歌绛夌骇涓庡厑璁歌宸細**
| 绛夌骇 | 鍏佽璇樊 | 閫傜敤鍦哄悎 |
|------|---------|---------|
| 1.0  | 卤1.0%   | 绮惧瘑娴嬮噺 |
| 1.6  | 卤1.6%   | 涓€鑸伐涓?|
| 2.5  | 卤2.5%   | 鏅€氬満鍚?|
| 4.0  | 卤4.0%   | 鍙傝€冩寚绀?|

馃挕 鍘嬪姏瀹瑰櫒鐢ㄥ帇鍔涜〃鍑嗙‘搴︾瓑绾у簲涓嶄綆浜?.5绾с€俙
  }
  
  // 閫夊瀷
  if (q.includes('閫夊瀷') || q.includes('閲忕▼') || q.includes('鎬庝箞閫?)) {
    return `鍘嬪姏琛ㄩ€夊瀷鎸囧崡锛?

馃搻 **閲忕▼閫夋嫨锛?*
娴嬮噺涓婇檺 = 琚祴鍘嬪姏 脳 (1.5~3鍊?
鎺ㄨ崘閫夋嫨2鍊嶏紝浣挎寚閽堝湪鍒诲害鐩?/3浣嶇疆宸ヤ綔

馃幆 **閫夊瀷瑕佺偣锛?*
1. 纭畾琚祴浠嬭川锛堟皵浣?娑蹭綋/鑵愯殌鎬э級
2. 纭畾宸ヤ綔鍘嬪姏鑼冨洿
3. 閫夋嫨鍚堥€傜殑鍑嗙‘搴︾瓑绾?
4. 鑰冭檻鐜娓╁害鍜屾尟鍔ㄦ儏鍐?
5. 鍘嬪姏瀹瑰櫒鐢ㄨ〃鐩樼洿寰勨墺100mm`
  }
  
  // 瀹夎
  if (q.includes('瀹夎') || q.includes('鎬庝箞瑁?)) {
    return `鍘嬪姏琛ㄥ畨瑁呰姹傦細

馃搷 **瀹夎浣嶇疆锛?*
鈥?鍨傜洿瀹夎锛屽€炬枩瑙掑害涓嶈秴杩?0掳
鈥?娑蹭綋娴嬪帇锛氬彇鍘嬬偣鍦ㄧ閬撲笅閮?
鈥?姘斾綋娴嬪帇锛氬彇鍘嬬偣鍦ㄧ閬撲笂閮?

馃敡 **瀹夎娉ㄦ剰浜嬮」锛?*
1. 浣跨敤瀵嗗皝鍨墖闃叉娉勬紡
2. 瀹夎鍓嶆鏌ユ帴鍙ｈ灪绾瑰尮閰?
3. 閬垮厤瀹夎鍦ㄦ尟鍔ㄥぇ鐨勪綅缃?
4. 杩滅鐑簮
5. 渚夸簬瑙傚療璇绘暟鍜岀淮鎶
  }
  
  // 閫氱敤鐭ヨ瘑鍥炵瓟
  return getGeneralKnowledgeAnswer(question)
}

/**
 * 鑾峰彇閫氱敤鐭ヨ瘑鍥炵瓟
 */
function getGeneralKnowledgeAnswer(question, permission) {
  const relevantKnowledge = getRelevantKnowledge(question)
  
  if (relevantKnowledge) {
    return `鏍规嵁鍘嬪姏琛ㄦ瀹氱浉鍏宠绋嬶細\n\n${relevantKnowledge}\n\n濡傞渶浜嗚В鏇磋缁嗙殑淇℃伅锛岃鍛婅瘔鎴戞偍鍏蜂綋鎯充簡瑙ｅ摢鏂归潰鐨勫唴瀹广€俙
  }
  
  // 鏍规嵁鏉冮檺绫诲瀷鏄剧ず涓嶅悓鐨勬暟鎹煡璇㈡彁绀?
  let dataQueryExamples = ''
  switch (permission?.type) {
    case 'enterprise':
      dataQueryExamples = `馃搳 **鏁版嵁鏌ヨ锛堟湰浼佷笟锛夛細**
鈥?鎴戜滑杩樻湁澶氬皯璁惧鍗冲皢鍒版湡锛?
鈥?鏈湀妫€瀹氫簡澶氬皯鍙帮紵
鈥?妫€瀹氬悎鏍肩巼鏄灏戯紵`
      break
    case 'district_admin':
      dataQueryExamples = `馃搳 **鏁版嵁鏌ヨ锛堟湰杈栧尯锛夛細**
鈥?杈栧尯鍐呮湁澶氬皯璁惧鍗冲皢鍒版湡锛?
鈥?鏈湀妫€瀹氫簡澶氬皯鍙帮紵
鈥?杈栧尯妫€瀹氬悎鏍肩巼鏄灏戯紵`
      break
    case 'super_admin':
      dataQueryExamples = `馃搳 **鏁版嵁鏌ヨ锛堝叏骞冲彴锛夛細**
鈥?骞冲彴鏈夊灏戣澶囧嵆灏嗗埌鏈燂紵
鈥?鏈湀鍏ㄥ钩鍙版瀹氫簡澶氬皯鍙帮紵
鈥?骞冲彴妫€瀹氬悎鏍肩巼鏄灏戯紵`
      break
    default:
      dataQueryExamples = `馃搳 **鏁版嵁鏌ヨ锛?*
鈥?鏈夊灏戣澶囧嵆灏嗗埌鏈燂紵
鈥?鏈湀妫€瀹氫簡澶氬皯鍙帮紵
鈥?妫€瀹氬悎鏍肩巼鏄灏戯紵`
  }
  
  return `鎮ㄥソ锛佹垜鏄疉I鏅鸿兘绠″锛屽彲浠ヤ负鎮ㄨВ绛斾互涓嬮棶棰橈細

馃摎 **涓撲笟鐭ヨ瘑锛?*
鈥?鍘嬪姏琛ㄦ瀹氬懆鏈熸槸澶氫箙锛?
鈥?妫€瀹氫笉鍚堟牸鐨勬爣鍑嗘槸浠€涔堬紵
鈥?鍘嬪姏琛ㄥ浣曢€夊瀷锛?
鈥?浠€涔堟儏鍐甸渶瑕佹洿鎹㈠帇鍔涜〃锛?

${dataQueryExamples}

璇峰憡璇夋垜鎮ㄦ兂浜嗚В浠€涔堬紵`
}

/**
 * 澶勭悊閫氱敤闂瓟
 */
function handleGeneralQuery(question, permission) {
  const q = question.toLowerCase()
  
  // 闂€欒
  if (q.includes('浣犲ソ') || q.includes('鎮ㄥソ') || q.includes('hi') || q.includes('hello')) {
    return getWelcomeMessage(permission)
  }
  
  // 鎰熻阿
  if (q.includes('璋㈣阿') || q.includes('鎰熻阿') || q.includes('thanks')) {
    return '涓嶅姘旓紒濡傛湁鍏朵粬闂闅忔椂鍙互闂垜銆傜鎮ㄥ伐浣滈『鍒╋紒'
  }
  
  // 榛樿鍥炵瓟
  return getGeneralKnowledgeAnswer(question, permission)
}

/**
 * 鑾峰彇娆㈣繋娑堟伅
 */
function getWelcomeMessage(permission) {
  let scopeInfo = ''
  let dataQueryHint = ''
  
  switch (permission.type) {
    case 'enterprise':
      scopeInfo = `褰撳墠韬唤锛?*${permission.scope}** 浼佷笟鐢ㄦ埛`
      dataQueryHint = '鈥?鏌ヨ鏈紒涓氱殑妫€瀹氭暟鎹?
      break
    case 'district_admin':
      scopeInfo = `褰撳墠韬唤锛?*${permission.scope}** 杈栧尯绠＄悊鍛榒
      dataQueryHint = '鈥?鏌ヨ鏈緰鍖虹殑妫€瀹氭暟鎹?
      break
    case 'super_admin':
      scopeInfo = '褰撳墠韬唤锛?*鎬荤鐞嗗憳**'
      dataQueryHint = '鈥?鏌ヨ鍏ㄥ钩鍙扮殑妫€瀹氭暟鎹?
      break
    default:
      scopeInfo = '褰撳墠韬唤锛氳瀹?
      dataQueryHint = '鈥?鐧诲綍鍚庡彲鏌ヨ妫€瀹氭暟鎹?
  }

  return `鎮ㄥソ锛佹垜鏄帇鍔涜〃妫€瀹欰I鏅鸿兘绠″ 馃

${scopeInfo}

鎴戝彲浠ュ府鎮細
1. 馃摎 瑙ｇ瓟鍘嬪姏琛ㄦ瀹氫笓涓氶棶棰?
2. 馃搳 ${dataQueryHint.replace('鈥?', '')}
3. 鈴?鎻愰啋璁惧妫€瀹氬埌鏈?

璇烽棶鏈変粈涔堝彲浠ュ府鎮ㄧ殑锛焋
}


