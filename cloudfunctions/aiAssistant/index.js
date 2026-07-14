const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')
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
 * AI 智能管家云函数
 * 支持知识问答、OCR 识别、对话式查询和对话式修改。
 */
exports.main = async (event, context) => {
  const { action, question } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const conversationContext = normalizeConversationContext(event.conversationContext)

  try {
    const permission = await resolvePermission(event, openid)

    if (action === 'extractRecordFromImage') {
      return await handleImageExtraction(event)
    }

    if (action === 'kbInit') {
      if (!permission.canQueryAll) throw new Error('仅总管理员可以初始化知识库')
      await seedKbIfNeeded()
      return { success: true, answer: '知识库初始化完成' }
    }

    if (action === 'crudPlan') {
      const structuredIntent = await rewriteCrudIntent(String(question || ''), permission, conversationContext)
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
    
    // 检测问题意图
    const intent = detectIntent(question)
    
    // 根据意图分发处理
    let answer = ''
    
    if (intent.type === 'data_query') {
      answer = await tryModelAnswer(question, intent, permission, conversationContext) || await handleDataQuery(intent, permission)
    } else if (intent.type === 'rag') {
      answer = await tryModelAnswer(question, intent, permission, conversationContext) || await handleRagQuery(question, permission)
    } else if (intent.type === 'knowledge') {
      answer = await tryModelAnswer(question, intent, permission, conversationContext) || handleKnowledgeQuery(question, intent)
    } else {
      answer = await tryModelAnswer(question, intent, permission, conversationContext) || handleGeneralQuery(question, permission)
    }

    return {
      success: true,
      answer
    }
  } catch (error) {
    console.error('AI 处理错误:', error)
    return {
      success: false,
      answer: '抱歉，处理您的问题时出现错误，请稍后再试。'
    }
  }
}

async function tryModelAnswer(question, intent, permission, conversationContext) {
  if (!DASHSCOPE_API_KEY) return ''
  if (!question) return ''

  try {
    const references = await collectModelReferences(question, intent, permission, conversationContext)
    const contextText = buildConversationContextText(conversationContext)
    const systemPrompt = [
      '\u4f60\u662f\u538b\u529b\u8868\u68c0\u5b9a AI \u667a\u80fd\u7ba1\u5bb6\u3002',
      '\u8bf7\u4f18\u5148\u6839\u636e\u7ed9\u5b9a\u8d44\u6599\u56de\u7b54\uff0c\u4e0d\u8981\u7f16\u9020\u6cd5\u89c4\u3001\u6807\u51c6\u6216\u4e1a\u52a1\u6570\u636e\u3002',
      '\u5982\u679c\u8d44\u6599\u4e0d\u8db3\uff0c\u8bf7\u660e\u786e\u8bf4\u660e\u6839\u636e\u73b0\u6709\u8d44\u6599\u6682\u65e0\u6cd5\u786e\u5b9a\uff0c\u5e76\u5efa\u8bae\u7528\u6237\u67e5\u770b\u6b63\u5f0f\u89c4\u7a0b\u6216\u8865\u5145\u6761\u4ef6\u3002',
      '\u56de\u7b54\u8bf7\u4f7f\u7528\u7b80\u4f53\u4e2d\u6587\uff0c\u98ce\u683c\u4e13\u4e1a\u3001\u76f4\u63a5\u3001\u6613\u6267\u884c\u3002',
      '\u5982\u679c\u95ee\u9898\u5728\u67e5\u8be2\u5177\u4f53\u53f0\u8d26\uff0c\u4f18\u5148\u6839\u636e\u547d\u4e2d\u8bb0\u5f55\u7ed9\u51fa\u76f4\u63a5\u7ed3\u8bba\u3002',
      `\u5f53\u524d\u7528\u6237\u6743\u9650\u8303\u56f4\uff1a${buildPermissionLabel(permission)}\u3002`
    ].join('\n')

    const userPrompt = [
      `\u7528\u6237\u95ee\u9898\uff1a${question}`,
      contextText ? `\u6700\u8fd1\u5bf9\u8bdd\u4e0a\u4e0b\u6587\uff1a\n${contextText}` : '',
      references
        ? `\u53ef\u7528\u8d44\u6599\uff1a\n${references}`
        : '\u53ef\u7528\u8d44\u6599\uff1a\u6682\u65e0\u989d\u5916\u8d44\u6599\uff0c\u8bf7\u8c28\u614e\u56de\u7b54\u3002'
    ].filter(Boolean).join('\n\n')

    return await callDashScopeChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])
  } catch (error) {
    console.error('DashScope model answer failed:', error)
    return ''
  }
}

async function rewriteCrudIntent(question, permission, conversationContext) {
  if (!DASHSCOPE_API_KEY || !question) return null

  try {
    const contextText = buildConversationContextText(conversationContext)
    const systemPrompt = [
      '你是压力表检定系统的意图改写器。',
      '请把用户自然语言改写成结构化 CRUD 意图。',
      '只返回 JSON，不要返回解释、Markdown 或代码块。',
      'operation 只能是 query、update、delete、create。',
      'entity 只能是 device、equipment、pressure_record。',
      'target 允许字段：factoryNo、certNo、deviceNo、equipmentNo、deviceName、equipmentName、rawCode、tailCode、ambiguousCode。',
      'changes 允许字段：status、conclusion、verificationDate、modelSpec、instrumentName、manufacturer、sendUnit、location、district。',
      '如果用户说“刚才那条”“上一条”“这条记录”，优先结合最近上下文推断对象。',
      '如果用户只给了编号尾号，比如“编号为2”，尽量写入 target.rawCode 或 target.tailCode，而不是直接放弃。',
      '如果编号太模糊、对象不明确或关键信息不足，请返回 needClarify=true，并给出 clarifyQuestion。',
      `当前用户权限范围：${buildPermissionLabel(permission)}。`
    ].join('\n')

    const userPrompt = [
      `用户原话：${question}`,
      contextText ? `最近上下文：\n${contextText}` : '',
      '请输出 JSON，例如：',
      '{"operation":"query","entity":"device","target":{"factoryNo":"24013931"},"changes":{},"needClarify":false,"clarifyQuestion":""}'
    ].filter(Boolean).join('\n')

    const content = await callDashScopeChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    const parsed = parseCrudIntentJson(content)
    if (!parsed) return null
    const sanitized = applyConversationContextToIntent(sanitizeCrudIntent(parsed), conversationContext, question)
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
    deviceNo: '压力表编号',
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

async function collectModelReferences(question, intent, permission, conversationContext) {
  const sections = []
  const contextText = buildConversationContextText(conversationContext)
  if (contextText) {
    sections.push(`最近上下文：\n${contextText}`)
  }

  if (intent.type === 'rag') {
    try {
      await seedKbIfNeeded()
      const qv = buildVector(question)
      const chunkRes = await db.collection('kb_chunks').limit(500).get()
      const chunks = chunkRes.data || []

      const ragText = chunks
        .map((chunk) => ({ content: chunk.content, score: cosine(qv, chunk.vector || []) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .filter((item) => item.score > 0.1)
        .map((item, index) => `\u53c2\u8003${index + 1}\uff1a${item.content}`)
        .join('\n\n')
      if (ragText) sections.push(ragText)
    } catch (error) {
      console.error('collectModelReferences failed:', error)
    }
  } else {
    const knowledge = getRelevantKnowledge(question) || ''
    if (knowledge) sections.push(knowledge)
  }

  const liveReference = await buildLiveDataReference(question, permission, conversationContext)
  if (liveReference) sections.push(liveReference)

  return sections.filter(Boolean).join('\n\n')
}

function normalizeConversationContext(source) {
  if (!source || typeof source !== 'object') return {}

  const recentMessages = Array.isArray(source.recentMessages)
    ? source.recentMessages
      .filter((item) => item && typeof item === 'object')
      .slice(-6)
      .map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        kind: String(item.kind || 'text'),
        content: String(item.content || '').trim()
      }))
      .filter((item) => item.content)
    : []

  const lastCrudContext = source.lastCrudContext && typeof source.lastCrudContext === 'object'
    ? {
      entity: String(source.lastCrudContext.entity || '').trim(),
      targetId: String(source.lastCrudContext.targetId || '').trim(),
      title: String(source.lastCrudContext.title || '').trim(),
      operation: String(source.lastCrudContext.operation || '').trim()
    }
    : null

  const visionDraft = source.visionDraft && typeof source.visionDraft === 'object'
    ? {
      certNo: String(source.visionDraft.certNo || '').trim(),
      factoryNo: String(source.visionDraft.factoryNo || '').trim(),
      instrumentName: String(source.visionDraft.instrumentName || '').trim(),
      modelSpec: String(source.visionDraft.modelSpec || '').trim(),
      manufacturer: String(source.visionDraft.manufacturer || '').trim(),
      sendUnit: String(source.visionDraft.sendUnit || '').trim(),
      verificationDate: String(source.visionDraft.verificationDate || '').trim(),
      conclusion: String(source.visionDraft.conclusion || '').trim(),
      district: String(source.visionDraft.district || '').trim(),
      gaugeStatus: String(source.visionDraft.gaugeStatus || '').trim(),
      selectedEquipmentId: String(source.visionDraft.selectedEquipmentId || '').trim(),
      selectedEquipmentName: String(source.visionDraft.selectedEquipmentName || '').trim()
    }
    : null

  const pendingCrudPlan = source.pendingCrudPlan && typeof source.pendingCrudPlan === 'object'
    ? {
      entityLabel: String(source.pendingCrudPlan.entityLabel || '').trim(),
      answer: String(source.pendingCrudPlan.answer || '').trim(),
      payload: source.pendingCrudPlan.payload && typeof source.pendingCrudPlan.payload === 'object'
        ? {
          operation: String(source.pendingCrudPlan.payload.operation || '').trim(),
          entity: String(source.pendingCrudPlan.payload.entity || '').trim(),
          targetId: String(source.pendingCrudPlan.payload.targetId || '').trim(),
          changes: source.pendingCrudPlan.payload.changes && typeof source.pendingCrudPlan.payload.changes === 'object'
            ? source.pendingCrudPlan.payload.changes
            : {}
        }
        : null
    }
    : null

  return {
    recentMessages,
    lastCrudContext,
    visionDraft,
    pendingCrudPlan
  }
}

function buildConversationContextText(context) {
  if (!context || typeof context !== 'object') return ''
  const parts = []

  const recentText = (context.recentMessages || [])
    .map((item) => `${item.role === 'assistant' ? 'AI' : '用户'}：${item.content}`)
    .join('\n')
  if (recentText) parts.push(recentText)

  if (context.lastCrudContext && (context.lastCrudContext.title || context.lastCrudContext.targetId)) {
    parts.push(`最近操作对象：${context.lastCrudContext.title || '未命名记录'}（${context.lastCrudContext.entity || 'unknown'}）`)
  }

  if (context.pendingCrudPlan?.payload?.targetId) {
    parts.push(`待确认操作：${context.pendingCrudPlan.payload.operation || ''} ${context.pendingCrudPlan.entityLabel || context.pendingCrudPlan.payload.entity || ''}`)
  }

  if (context.visionDraft) {
    const draftParts = [
      context.visionDraft.certNo ? `证书=${context.visionDraft.certNo}` : '',
      context.visionDraft.factoryNo ? `出厂编号=${context.visionDraft.factoryNo}` : '',
      context.visionDraft.instrumentName ? `仪表=${context.visionDraft.instrumentName}` : '',
      context.visionDraft.modelSpec ? `型号=${context.visionDraft.modelSpec}` : '',
      context.visionDraft.selectedEquipmentName ? `所属设备=${context.visionDraft.selectedEquipmentName}` : ''
    ].filter(Boolean)
    if (draftParts.length) {
      parts.push(`当前识别草稿：${draftParts.join('，')}`)
    }
  }

  return parts.join('\n')
}

function applyConversationContextToIntent(intent, conversationContext, question) {
  if (!intent) return null
  const nextIntent = {
    ...intent,
    target: { ...(intent.target || {}) },
    changes: { ...(intent.changes || {}) }
  }

  const isContextRef = /(刚才|上一条|那条|这条|刚刚|这个记录|这块表)/.test(String(question || ''))
  const lastCrudContext = conversationContext && conversationContext.lastCrudContext
  if (isContextRef && lastCrudContext) {
    if (!nextIntent.entity && lastCrudContext.entity) {
      nextIntent.entity = lastCrudContext.entity
    }
    if (!hasAnyTargetValue(nextIntent.target) && lastCrudContext.title) {
      nextIntent.target.deviceName = lastCrudContext.title
    }
  }

  const draft = conversationContext && conversationContext.visionDraft
  if (draft && !hasAnyTargetValue(nextIntent.target)) {
    if (draft.factoryNo && /(出厂编号|表号|编号)/.test(String(question || ''))) {
      nextIntent.target.factoryNo = draft.factoryNo
    } else if (draft.certNo && /(证书|证书编号)/.test(String(question || ''))) {
      nextIntent.target.certNo = draft.certNo
    }
  }

  nextIntent.debugSummary = buildCrudIntentDebugSummary(nextIntent)
  return nextIntent
}

function hasAnyTargetValue(target) {
  return !!target && Object.keys(target).some((key) => !!target[key])
}

async function buildLiveDataReference(question, permission, conversationContext) {
  try {
    const summary = await buildScopeStatsSummary(permission)
    const records = await findRelevantRecords(question, permission, conversationContext)
    const sections = []
    if (summary) sections.push(summary)
    if (records.length) {
      sections.push(`命中记录：\n${records.map((item, index) => formatRecordReference(item, index + 1)).join('\n')}`)
    }
    return sections.join('\n\n')
  } catch (error) {
    console.error('buildLiveDataReference failed:', error)
    return ''
  }
}

async function buildScopeStatsSummary(permission) {
  const baseQuery = Object.assign({}, permission.query || {}, {
    isDeleted: false
  })
  const collection = db.collection('pressure_records')
  const today = new Date()
  const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [total, expiring, qualified] = await Promise.all([
    collection.where(baseQuery).count(),
    collection.where({
      ...baseQuery,
      expiryDate: _.and(_.gte(formatYmd(today)), _.lte(formatYmd(thirtyDaysLater)))
    }).count(),
    collection.where({
      ...baseQuery,
      conclusion: '合格'
    }).count()
  ])

  return `实时统计：范围=${getScopeDescription(permission)}；总记录 ${total.total} 条；30天内到期 ${expiring.total} 条；合格 ${qualified.total} 条；不合格 ${Math.max(total.total - qualified.total, 0)} 条。`
}

async function findRelevantRecords(question, permission, conversationContext) {
  const baseQuery = Object.assign({}, permission.query || {}, {
    isDeleted: false
  })
  const collection = db.collection('pressure_records')
  const directId = conversationContext && conversationContext.lastCrudContext && conversationContext.lastCrudContext.entity === 'pressure_record'
    ? conversationContext.lastCrudContext.targetId
    : ''

  if (directId) {
    const direct = await collection.where({ ...baseQuery, _id: directId }).limit(1).get()
    if (direct.data && direct.data[0]) return [direct.data[0]]
  }

  const pool = await collection.where(baseQuery).limit(100).get()
  const records = pool.data || []
  const normalizedQuestion = String(question || '').trim().toLowerCase()
  const codeHints = extractCodeHints(question, conversationContext)

  return records
    .filter((item) => {
      const certNo = String(item.certNo || '').toLowerCase()
      const factoryNo = String(item.factoryNo || '').toLowerCase()
      const deviceNo = String(item.deviceNo || '').toLowerCase()
      const instrumentName = String(item.instrumentName || '').toLowerCase()

      if (codeHints.some((code) => certNo === code || factoryNo === code || deviceNo === code)) return true
      if (codeHints.some((code) => code.length <= 4 && (certNo.endsWith(code) || factoryNo.endsWith(code) || deviceNo.endsWith(code)))) return true
      if (instrumentName && normalizedQuestion && normalizedQuestion.includes(instrumentName)) return true
      return false
    })
    .slice(0, 3)
}

function extractCodeHints(question, conversationContext) {
  const text = String(question || '')
  const matches = text.match(/[A-Za-z]*\d[A-Za-z0-9\-]*/g) || []
  const hints = matches.map((item) => item.toLowerCase())
  const draft = conversationContext && conversationContext.visionDraft

  if (draft) {
    if (draft.certNo && text.includes('证书')) hints.push(String(draft.certNo).toLowerCase())
    if (draft.factoryNo && /编号|表号|出厂/.test(text)) hints.push(String(draft.factoryNo).toLowerCase())
  }

  return Array.from(new Set(hints.filter(Boolean)))
}

function formatRecordReference(record, index) {
  return `${index}. 压力表=${record.instrumentName || '未命名'}；出厂编号=${record.factoryNo || '-'}；证书编号=${record.certNo || '-'}；所属设备=${record.equipmentName || '-'}；检定结论=${record.conclusion || '-'}；检定日期=${record.verificationDate || '-'}；有效期至=${record.expiryDate || '-'}`
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

  const ruleData = extractRecordFields(rawText)
  let modelData = null

  if (DASHSCOPE_API_KEY) {
    try {
      modelData = await extractRecordFieldsWithModel(rawText, ruleData)
    } catch (error) {
      console.error('AI extraction enhancement failed:', error)
    }
  }

  const merged = mergeExtractedRecordFields(ruleData, modelData, rawText)
  const data = merged.data
  return {
    success: true,
    data: {
      ...data,
      ocrSource: 'ai_extract',
      rawText,
      confidence: estimateConfidence(data, merged.fieldConfidence),
      recognitionMeta: {
        mode: modelData ? 'ai_enhanced' : 'rule_fallback',
        fieldSources: merged.fieldSources,
        fieldConfidence: merged.fieldConfidence,
        lowConfidenceFields: merged.lowConfidenceFields
      }
    }
  }
}

async function extractRecordFieldsWithModel(rawText, ruleData) {
  const content = await callDashScopeChat([
    {
      role: 'system',
      content: [
        '你是压力表检定证书字段提取器。',
        '只能依据 OCR 原文提取，不得猜测或补造。',
        '重点区分“检定日期”和“有效期至”：verificationDate 只能取检定日期。',
        '型号规格优先提取“型号/规格”标签后的完整值；压力范围示例为 (0-1.6) MPa。',
        '只输出一个 JSON 对象，不要输出 Markdown。',
        '字段固定为 certNo、factoryNo、sendUnit、instrumentName、modelSpec、manufacturer、verificationStd、conclusion、verificationDate。',
        '没有依据的字段填写空字符串，verificationDate 格式为 YYYY-MM-DD，conclusion 只能是合格、不合格或空字符串。'
      ].join('\n')
    },
    {
      role: 'user',
      content: `规则初步结果：${JSON.stringify(ruleData)}\n\nOCR 原文：\n${rawText.slice(0, 12000)}`
    }
  ])

  return parseExtractionJson(content)
}

function parseExtractionJson(content) {
  const jsonText = extractFirstJsonObject(String(content || ''))
  if (!jsonText) return null

  try {
    const parsed = JSON.parse(jsonText)
    if (!parsed || typeof parsed !== 'object') return null

    const allowedFields = [
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
    const result = {}
    allowedFields.forEach((field) => {
      const value = parsed[field]
      result[field] = typeof value === 'string' ? value.trim().slice(0, 300) : ''
    })
    return result
  } catch (error) {
    console.error('parseExtractionJson failed:', error)
    return null
  }
}

function mergeExtractedRecordFields(ruleData, modelData, rawText) {
  const model = modelData || {}
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
  const selected = {}
  const fieldSources = {}
  const fieldConfidence = {}

  fields.forEach((field) => {
    const ruleValue = String(ruleData[field] || '').trim()
    const modelValue = String(model[field] || '').trim()
    const modelSupported = modelValue && isValueSupportedByOcr(field, modelValue, rawText)
    const value = modelSupported ? modelValue : ruleValue
    selected[field] = value

    if (!value) {
      fieldSources[field] = '未识别'
      fieldConfidence[field] = 0
    } else if (modelSupported && ruleValue && normalizeEvidence(modelValue) === normalizeEvidence(ruleValue)) {
      fieldSources[field] = '规则与 AI 一致'
      fieldConfidence[field] = 0.98
    } else if (modelSupported) {
      fieldSources[field] = 'AI 校正'
      fieldConfidence[field] = 0.86
    } else {
      fieldSources[field] = '规则提取'
      fieldConfidence[field] = 0.78
    }
  })

  const conclusion = ['合格', '不合格'].includes(selected.conclusion)
    ? selected.conclusion
    : ruleData.conclusion
  const data = {
    certNo: selected.certNo,
    factoryNo: selected.factoryNo,
    sendUnit: cleanupLineValue(selected.sendUnit),
    instrumentName: cleanupLineValue(selected.instrumentName),
    modelSpec: normalizeModelSpec(selected.modelSpec, rawText),
    manufacturer: cleanupLineValue(selected.manufacturer),
    verificationStd: normalizeStd(selected.verificationStd),
    conclusion: conclusion || '',
    verificationDate: normalizeDateValue(selected.verificationDate) || ruleData.verificationDate || ''
  }

  const lowConfidenceFields = fields.filter((field) => !data[field] || fieldConfidence[field] < 0.8)
  return { data, fieldSources, fieldConfidence, lowConfidenceFields }
}

function isValueSupportedByOcr(field, value, rawText) {
  const source = String(rawText || '')
  if (!value || !source) return false

  if (field === 'verificationDate') {
    const normalized = normalizeDateValue(value)
    if (!normalized) return false
    const [year, month, day] = normalized.split('-').map(Number)
    const pattern = new RegExp(`${year}\\s*(?:年|[.\\-/])\\s*0?${month}\\s*(?:月|[.\\-/])\\s*0?${day}`)
    return pattern.test(source)
  }

  return normalizeEvidence(source).includes(normalizeEvidence(value))
}

function normalizeEvidence(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
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
    /(?:证书编号|证书号|NO|No)[:：\s]*([A-Za-z0-9\-]{5,})/i
  ])

  result.factoryNo = firstMatch(normalized, [
    /(?:出厂编号|出厂号|器号|表号)[:：\s]*([A-Za-z0-9\-\/]{3,})/i
  ])

  result.sendUnit = cleanupLineValue(firstMatch(normalized, [
    /(?:送检单位|委托单位|使用单位)[:：\s]*([^\n]+)/i
  ]))

  result.instrumentName = cleanupLineValue(firstMatch(normalized, [
    /(?:器具名称|仪表名称|名称)[:：\s]*([^\n]+)/i
  ]))

  if (!result.instrumentName && /压力表/.test(normalized)) {
    result.instrumentName = '\u538b\u529b\u8868'
  }

  result.modelSpec = cleanupLineValue(firstMatch(normalized, [
    /(?:型号规格|规格型号|型号|规格)[:：\s]*([^\n]+)/i,
    getPressureRangePattern()
  ]))
  result.modelSpec = normalizeModelSpec(result.modelSpec, normalized)

  result.manufacturer = cleanupLineValue(firstMatch(normalized, [
    /(?:制造单位|生产厂家|制造厂|厂家)[:：\s]*([^\n]+)/i
  ]))

  result.verificationStd = normalizeStd(firstMatch(normalized, [
    /(JJG\s*[\d\-]+)/i
  ]))

  result.conclusion = extractConclusion(normalized)
  result.verificationDate = extractDate(normalized)

  return result
}

function normalizeExtractText(text) {
  let normalized = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/：/g, ':')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[ \t]+/g, ' ')

  for (let i = 0; i < 4; i += 1) {
    normalized = normalized.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1')
  }

  return normalized
    .replace(/([\u4e00-\u9fa5])\s*\/\s*([\u4e00-\u9fa5])/g, '$1/$2')
    .replace(/([\u4e00-\u9fa5])\s*:\s*/g, '$1:')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
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
  const cleaned = String(value)
    .split(/\n/)[0]
    .split(/(?:证书编号|出厂编号|型号规格|规格型号|制造单位|检定依据|检定结论|检定日期|有效期至)/)[0]
    .trim()
  if (isOnlyFieldLabel(cleaned)) return ''
  return cleaned
}

function isOnlyFieldLabel(value) {
  const text = String(value || '').replace(/\s+/g, '').replace(/[/:：/／]+/g, '')
  return !text || ['型号', '规格', '型号规格', '规格型号'].includes(text)
}

function normalizeModelSpec(value, fullText) {
  const cleaned = cleanupLineValue(value)
  if (cleaned && !isOnlyFieldLabel(cleaned)) {
    const pressure = extractPressureRange(cleaned)
    return pressure || cleaned
  }

  return extractPressureRange(fullText)
}

function getPressureRangePattern() {
  return /([\(（]?\s*\d+(?:\.\d+)?\s*(?:-|~|－|—|–|一|至|到)\s*\d+(?:\.\d+)?\s*[\)）]?\s*(?:k|M|G)?\s*P\s*a)/i
}

function extractPressureRange(text) {
  const pressure = firstMatch(text, [getPressureRangePattern()])
  if (!pressure) return ''
  return pressure
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[－—–一到至~]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/([kMG])\s*P\s*a/i, (match, prefix) => `${prefix.toUpperCase()}Pa`)
    .replace(/P\s*a/i, 'Pa')
    .trim()
}

function normalizeStd(value) {
  if (!value) return ''
  return String(value).replace(/\s+/g, '').replace(/^JJG/i, 'JJG')
}

function extractConclusion(text) {
  if (/不合格/.test(text)) return '\u4e0d\u5408\u683c'
  if (/该压力表合格/.test(text)) return '\u5408\u683c'
  if (/合格|符合/.test(text)) return '\u5408\u683c'
  return ''
}

function extractDate(text) {
  const normalized = String(text || '').replace(/\r/g, '\n')
  const labelMatch = normalized.match(/(?:检定日期|检定日|校准日期)[:：\s]*([^\n]{0,40})/)
  if (labelMatch) {
    const fromLabel = normalizeDateValue(labelMatch[1])
    if (fromLabel) return fromLabel
  }

  const lines = normalized.split('\n').filter((line) => !/(有效期|到期|有效至)/.test(line))
  for (const line of lines) {
    const matches = line.matchAll(/(\d{4})\s*(?:年|[.\-/])\s*(\d{1,2})\s*(?:月|[.\-/])\s*(\d{1,2})\s*(?:日)?/g)
    for (const match of matches) {
      const date = buildValidDate(match[1], match[2], match[3])
      if (date) return date
    }
  }
  return ''
}

function normalizeDateValue(value) {
  const text = String(value || '')
  const match = text.match(/(\d{4})\s*(?:年|[.\-/])\s*(\d{1,2})\s*(?:月|[.\-/])\s*(\d{1,2})\s*(?:日)?/)
  if (!match) return ''
  return buildValidDate(match[1], match[2], match[3])
}

function buildValidDate(year, month, day) {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return ''
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return ''
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function formatYmd(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function estimateConfidence(data, fieldConfidence = {}) {
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
  const populated = fields.filter((key) => data[key])
  const completeness = populated.length / fields.length
  const evidenceScore = populated.length
    ? populated.reduce((sum, key) => sum + Number(fieldConfidence[key] || 0.72), 0) / populated.length
    : 0
  return Number((completeness * 0.4 + evidenceScore * 0.6).toFixed(2))
}

async function resolvePermission(event, openid) {
  if (event.adminToken) {
    const tokenHash = crypto.createHash('sha256').update(String(event.adminToken)).digest('hex')
    const sessionRes = await db.collection('auth_sessions').where({ tokenHash }).limit(1).get()
    const session = sessionRes.data?.[0]
    const expiresAt = session?.expiresAt ? new Date(session.expiresAt) : null
    if (!session || !expiresAt || expiresAt.getTime() <= Date.now()) throw new Error('管理端登录已失效')
    if (session.role === 'district' && session.district) {
      return {
        type: 'district_admin',
        scope: session.district,
        query: { district: session.district },
        canQueryAll: false
      }
    }
    return { type: 'super_admin', scope: '全部辖区', query: {}, canQueryAll: true }
  }

  if (!openid) throw new Error('请先登录')
  const enterpriseRes = await db.collection('enterprises').where({ openid }).limit(1).get()
  const enterprise = enterpriseRes.data?.[0]
  if (!enterprise) throw new Error('企业账号尚未绑定')
  return {
    type: 'enterprise',
    scope: enterprise.companyName || '本企业',
    query: { enterpriseName: enterprise.companyName || '' },
    canQueryAll: false
  }
}

function detectIntent(question) {
  const q = question.toLowerCase()
  
  const dataQueryKeywords = {
    expiring: ['到期', '即将到期', '快到期', '过期', '有效期'],
    count: ['多少', '几个', '几台', '数量', '统计'],
    unverified: ['没有检定', '未检定', '没检定', '待检定'],
    monthly: ['本月', '这个月', '当月'],
    yearly: ['今年', '本年', '年度'],
    qualified: ['合格', '不合格', '通过', '未通过'],
    list: ['列表', '清单', '明细', '哪些', '看一下', '看下', '帮我看', '帮我查', '详情', '状态']
  }

  const knowledgeKeywords = ['周期', '规程', '标准', '要求', '规定', '怎么', '如何', '什么是', '为什么']
  const ragKeywords = ['法规', '法律', '执法', '处罚', '依据', '条款', '计量法', 'jjg', '规程依据', '合规']

  let intent = { type: 'general', subType: null }

  for (const [subType, keywords] of Object.entries(dataQueryKeywords)) {
    if (keywords.some(k => q.includes(k))) {
      intent = { type: 'data_query', subType }
      break
    }
  }

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
      title: '压力表检定专业知识库',
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
    return fallback
      ? `参考信息：\n${fallback}\n\n提示：如需启用可溯源的知识库检索，请先在云数据库创建 kb_docs 和 kb_chunks 集合。`
      : '知识库暂不可用，请稍后再试。'
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
    .map((s, i) => `【参考${i + 1}】${s.c.content}`)
    .join('\n\n')

  if (!excerpts) {
    const fallback = getRelevantKnowledge(question) || ''
    return fallback ? `参考信息：\n${fallback}` : '未检索到足够相关的合规依据，建议补充问题关键词。'
  }

  return `合规参考：\n\n${excerpts}\n\n如需更精准的判断，请补充场景、设备用途、检定结论与到期日期。`
}

async function handleDataQuery(intent, permission) {
  const collection = db.collection('pressure_records')
  const query = Object.assign({}, permission.query || {}, {
    isDeleted: false
  })
  const scopeDesc = getScopeDescription(permission)

  const today = new Date()
  const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  try {
    switch (intent.subType) {
      case 'expiring': {
        const result = await collection.where({
          ...query,
          expiryDate: _.lte(formatYmd(thirtyDaysLater))
        }).count()
        return `${scopeDesc}\n\n目前有 ${result.total} 块压力表将在 30 天内到期。`
      }
      
      case 'count':
      case 'unverified': {
        const result = await collection.where(query).count()
        return `${scopeDesc}\n\n共有 ${result.total} 条压力表检定记录。`
      }
      
      case 'monthly': {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        const result = await collection.where({
          ...query,
          verificationDate: _.gte(formatYmd(startOfMonth))
        }).count()
        return `${scopeDesc}\n\n本月已完成 ${result.total} 条压力表检定记录。`
      }
      
      case 'yearly': {
        const startOfYear = new Date(today.getFullYear(), 0, 1)
        const result = await collection.where({
          ...query,
          verificationDate: _.gte(formatYmd(startOfYear))
        }).count()
        return `${scopeDesc}\n\n今年已完成 ${result.total} 条压力表检定记录。`
      }
      
      case 'qualified': {
        const total = await collection.where(query).count()
        const qualified = await collection.where({
          ...query,
          conclusion: '合格'
        }).count()
        const unqualified = total.total - qualified.total
        
        if (total.total === 0) {
          return `${scopeDesc}\n\n暂无检定记录数据。`
        }
        
        const rate = ((qualified.total / total.total) * 100).toFixed(1)
        return `${scopeDesc}\n\n检定合格率：${rate}%\n总计：${total.total} 条\n合格：${qualified.total} 条\n不合格：${unqualified} 条`
      }
      
      case 'list': {
        const total = await collection.where(query).count()
        const expiring = await collection.where({
          ...query,
          expiryDate: _.lte(formatYmd(thirtyDaysLater))
        }).count()
        return `${scopeDesc}\n\n数据概览：\n总记录数：${total.total} 条\n30天内到期：${expiring.total} 条`
      }
      
      default: {
        const result = await collection.where(query).count()
        return `${scopeDesc}\n\n共有 ${result.total} 条检定记录。`
      }
    }
  } catch (error) {
    console.error('数据查询错误:', error)
    return '查询数据时出现问题，请稍后再试。'
  }
}

function getScopeDescription(permission) {
  switch (permission.type) {
    case 'enterprise':
      return `【${permission.scope}】数据查询结果`
    case 'district_admin':
      return `【${permission.scope}辖区】数据查询结果`
    case 'super_admin':
      return '【全平台】数据查询结果'
    default:
      return '数据查询结果'
  }
}

function handleKnowledgeQuery(question, intent) {
  const q = String(question || '').toLowerCase()

  if (q.includes('周期') || q.includes('多久') || q.includes('频率')) {
    return `根据 JJG52-2013《弹性元件式一般压力表检定规程》，一般压力表检定周期通常为 6 个月。

需要检定的常见情况：
1. 新购置压力表首次使用前
2. 维修后重新使用前
3. 长期停用后重新使用前
4. 到期周期检定

用于安全防护、贸易结算等场景的压力表，应按要求及时送检。`
  }

  if (q.includes('不合格') || q.includes('判定')) {
    return `压力表检定不合格的常见判定包括：

1. 示值误差超过允许误差
2. 回程误差超过允许误差
3. 轻敲位移超出要求
4. 指针不能回零或零点误差超差
5. 外观缺陷影响正常读数
6. 密封性、稳定性不符合要求

发现不合格后，建议停用并安排维修、更换或重新检定。`
  }

  if (q.includes('更换') || q.includes('报废')) {
    return `压力表建议更换或报废的情况包括：

1. 指针弯曲、松动或不能正常回零
2. 表盘玻璃破损
3. 刻度模糊、读数困难
4. 接头螺纹损坏
5. 连续检定不合格
6. 已不适合当前工况或安全要求

更换后应重新建档，并保留原压力表的历史记录。`
  }

  if (q.includes('准确度') || q.includes('等级') || q.includes('精度')) {
    return `压力表常见准确度等级包括 1.0、1.6、2.5、4.0 级。

一般原则：
1. 精密测量场景选择较高准确度等级
2. 普通工况可按使用要求选择
3. 压力容器等安全相关场景应按规范和设备要求选择
4. 选型时同时考虑量程、介质、环境温度和振动情况。`
  }

  if (q.includes('选型') || q.includes('量程') || q.includes('怎么选')) {
    return `压力表选型建议：

1. 量程上限通常按工作压力的 1.5 到 3 倍选择
2. 常用工作压力宜落在量程的 1/3 到 2/3 区间
3. 根据介质选择普通型、耐腐型、耐震型等
4. 根据现场环境选择合适表盘直径和安装方式
5. 安全相关设备应优先按规范要求选型。`
  }

  if (q.includes('安装') || q.includes('怎么装')) {
    return `压力表安装要点：

1. 应安装在便于观察、维护和拆装的位置
2. 避免强振动、高温、腐蚀等不利环境
3. 接头连接应可靠，必要时配置缓冲装置或冷凝弯
4. 安装后应确认指针回零、无泄漏、读数清晰
5. 投用前应完成必要的检定或校准。`
  }

  return getRelevantKnowledge(question) || `我可以回答压力表检定周期、不合格判定、选型、安装、更换和台账管理相关问题。请把问题说得更具体一些。`
}
function handleGeneralQuery(question, permission) {
  const q = String(question || '').toLowerCase()

  if (q.includes('你好') || q.includes('您好') || q.includes('hi') || q.includes('hello')) {
    return getWelcomeMessage(permission)
  }

  if (q.includes('谢谢') || q.includes('感谢') || q.includes('thanks')) {
    return '不客气。我会继续帮你处理压力表识别、建档、查询和专业问答。'
  }

  return getGeneralKnowledgeAnswer(question, permission)
}

function getWelcomeMessage(permission = {}) {
  let scopeInfo = '当前身份：访客'
  let dataQueryHint = '登录后可查询检定数据'

  switch (permission.type) {
    case 'enterprise':
      scopeInfo = `当前身份：${permission.scope || '本企业'} 企业用户`
      dataQueryHint = '查询本企业的压力表检定数据'
      break
    case 'district_admin':
      scopeInfo = `当前身份：${permission.scope || '辖区'} 管理员`
      dataQueryHint = '查询本辖区的压力表检定数据'
      break
    case 'super_admin':
      scopeInfo = '当前身份：总管理员'
      dataQueryHint = '查询全平台的压力表检定数据'
      break
  }

  return `您好，我是 AI 智能管家。

${scopeInfo}

我可以帮你：
1. 解答压力表检定、选型、安装和报废问题
2. ${dataQueryHint}
3. 识别压力表证书并协助建档
4. 通过对话修改、查询或整理压力表记录

你可以直接告诉我想处理什么。`
}

function getGeneralKnowledgeAnswer(question, permission) {
  const knowledge = getRelevantKnowledge(question)
  if (knowledge) return knowledge

  const scopeText = getScopeDescription(permission || {})
  return `我已经收到你的问题。${scopeText}。

你可以这样问我：
1. 帮我查一下编号为 2 的压力表
2. 把刚才那条记录的型号改成 XXX
3. 哪些压力表已经停用或报废
4. 压力表多久需要检定一次
5. 上传证书照片，让 AI 管家帮我识别建档`
}
