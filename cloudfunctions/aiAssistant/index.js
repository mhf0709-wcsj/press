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
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || 'sk-251b049bb72449b787ea51fac48cf2b5'
const DASHSCOPE_MODEL = process.env.DASHSCOPE_MODEL || 'qwen3.5-flash'
const DASHSCOPE_ENDPOINT = process.env.DASHSCOPE_ENDPOINT || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

/**
 * AI智能管家云函数
 * 功能：
 * 1. 专业知识问答
 * 2. 企业数据智能查询
 * 
 * 权限分离：
 * - 企业端：只能查询本企业数据
 * - 辖区管理员：只能查询本辖区数据
 * - 总管理员：可查询所有数据
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
      return { success: true, answer: '知识库初始化完成' }
    }

    // 解析用户权限
    const permission = parsePermission(userType, userInfo, openid)

    if (action === 'crudPlan') {
      return await planCrudAction({
        question: String(question || ''),
        permission
      })
    }

    if (action === 'crudExecute') {
      return await executeCrudAction({
        payload: event.payload || {},
        permission
      })
    }
    
    // 1. 检测问题意图
    const intent = detectIntent(question)
    
    // 2. 根据意图处理
    let answer = ''
    
    if (intent.type === 'data_query') {
      // 数据查询类问题
      answer = await handleDataQuery(intent, permission)
    } else if (intent.type === 'rag') {
      answer = await tryModelAnswer(question, intent, permission) || await handleRagQuery(question, permission)
    } else if (intent.type === 'knowledge') {
      // 专业知识类问题
      answer = await tryModelAnswer(question, intent, permission) || handleKnowledgeQuery(question, intent)
    } else {
      // 通用问答
      answer = await tryModelAnswer(question, intent, permission) || handleGeneralQuery(question, permission)
    }

    return {
      success: true,
      answer
    }
  } catch (error) {
    console.error('AI处理错误:', error)
    return {
      success: false,
      answer: '抱歉，处理您的问题时出现了错误，请稍后再试。'
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
    /(?:证书编号|证书号|编号|NO|No)[:：\s]*([A-Za-z0-9\-]{5,})/i
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
    /([\(（]?\d+(?:\.\d+)?\s*(?:-|~|～)\s*\d+(?:\.\d+)?[)）]?\s*(?:k|M|G)?Pa)/i
  ]))

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
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[：]/g, ':')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
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
    .split(/(?:证书编号|出厂编号|型号规格|制造单位|检定依据|检定结论|检定日期)/)[0]
    .trim()
}

function normalizeStd(value) {
  if (!value) return ''
  return String(value).replace(/\s+/g, '').replace(/^JJG/i, 'JJG')
}

function extractConclusion(text) {
  if (/不合格/.test(text)) return '\u4e0d\u5408\u683c'
  if (/合格|符合/.test(text)) return '\u5408\u683c'
  return ''
}

function extractDate(text) {
  const match = text.match(/(\d{4})[.\-/年]\s*(\d{1,2})[.\-/月]\s*(\d{1,2})/)
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
 * 解析用户权限
 */
function parsePermission(userType, userInfo, openid) {
  const permission = {
    type: 'guest',
    scope: '未登录',
    query: {},
    canQueryAll: false
  }

  if (userType === 'enterprise' && userInfo) {
    // 企业端用户 - 只能查看本企业数据
    permission.type = 'enterprise'
    permission.scope = userInfo.companyName || '本企业'
    permission.query = { 
      _openid: openid  // 企业用户按openid限制
    }
    // 如果有企业名称，也可以按企业名查询
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
      // 总管理员 - 可查看所有数据
      permission.type = 'super_admin'
      permission.scope = '全部辖区'
      permission.query = {}  // 无限制
      permission.canQueryAll = true
    } else if (userInfo.district) {
      // 辖区管理员 - 只能查看本辖区数据
      permission.type = 'district_admin'
      permission.scope = userInfo.district
      permission.query = { district: userInfo.district }
    }
  }

  return permission
}

/**
 * 检测问题意图
 */
function detectIntent(question) {
  const q = question.toLowerCase()
  
  // 数据查询意图关键词
  const dataQueryKeywords = {
    expiring: ['到期', '即将到期', '快到期', '过期', '有效期'],
    count: ['多少', '几个', '几台', '数量', '统计'],
    unverified: ['没有检定', '未检定', '没检定', '待检定'],
    monthly: ['本月', '这个月', '当月'],
    yearly: ['今年', '本年', '年度'],
    qualified: ['合格', '不合格', '通过', '未通过'],
    list: ['列表', '清单', '明细', '哪些']
  }

  // 知识问答意图关键词
  const knowledgeKeywords = ['周期', '规程', '标准', '要求', '规定', '怎么', '如何', '什么是', '为什么']
  const ragKeywords = ['法规', '法律', '执法', '处罚', '依据', '条款', '计量法', 'jjg', '规程依据', '合规']

  // 判断意图
  let intent = { type: 'general', subType: null }

  // 检查是否为数据查询
  for (const [subType, keywords] of Object.entries(dataQueryKeywords)) {
    if (keywords.some(k => q.includes(k))) {
      intent = { type: 'data_query', subType }
      break
    }
  }

  // 如果不是数据查询，检查是否为知识问答
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
    return fallback ? `参考信息：\n${fallback}\n\n提示：如需启用可溯源的知识库检索，请先在云数据库创建 kb_docs 与 kb_chunks 集合。` : '知识库暂不可用，请稍后再试。'
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
    return fallback ? `参考信息：\n${fallback}` : '未检索到足够相关的合规依据。建议补充问题关键词（如：检定周期/强制检定/不合格判定）。'
  }

  return `合规参考（可追溯引用）：\n\n${excerpts}\n\n如需我给出更精准的执法口径，请补充：场景（企业自用/强检范围/压力容器配套）、设备用途、检定结论与到期日期。`
}

/**
 * 处理数据查询
 */
async function handleDataQuery(intent, permission) {
  const collection = db.collection('pressure_records')
  
  // 根据权限构建查询条件
  const query = permission.query
  const scopeDesc = getScopeDescription(permission)

  const today = new Date()
  const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)

  try {
    switch (intent.subType) {
      case 'expiring': {
        // 查询即将到期的设备
        const result = await collection.where({
          ...query,
          nextVerificationDate: _.lte(thirtyDaysLater)
        }).count()
        
        return `📊 ${scopeDesc}

目前有 **${result.total} 台**压力表将在30天内到期，需要安排检定。

建议尽快联系检定机构进行检定，避免超期使用。`
      }
      
      case 'count':
      case 'unverified': {
        // 查询总数
        const result = await collection.where(query).count()
        return `📊 ${scopeDesc}

共有 **${result.total} 条**压力表检定记录。

如需了解更详细的信息，可以在"我的存档"中查看完整列表。`
      }
      
      case 'monthly': {
        // 本月检定统计
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        const result = await collection.where({
          ...query,
          verificationDate: _.gte(startOfMonth)
        }).count()
        
        return `📊 ${scopeDesc}

本月（${today.getMonth() + 1}月）已完成 **${result.total} 台**压力表的检定记录。`
      }
      
      case 'yearly': {
        // 本年检定统计
        const startOfYear = new Date(today.getFullYear(), 0, 1)
        const result = await collection.where({
          ...query,
          verificationDate: _.gte(startOfYear)
        }).count()
        
        return `📊 ${scopeDesc}

今年已完成 **${result.total} 台**压力表的检定记录。`
      }
      
      case 'qualified': {
        // 合格率统计
        const total = await collection.where(query).count()
        const qualified = await collection.where({
          ...query,
          conclusion: '合格'
        }).count()
        const unqualified = total.total - qualified.total
        
        if (total.total === 0) {
          return `📊 ${scopeDesc}

暂无检定记录数据。`
        }
        
        const rate = ((qualified.total / total.total) * 100).toFixed(1)
        return `📊 ${scopeDesc}

检定合格率：**${rate}%**

• 总计：${total.total} 台
• 合格：${qualified.total} 台 ✅
• 不合格：${unqualified} 台 ❌`
      }
      
      case 'list': {
        // 查询列表概览
        const total = await collection.where(query).count()
        const expiring = await collection.where({
          ...query,
          nextVerificationDate: _.lte(thirtyDaysLater)
        }).count()
        
        return `📊 ${scopeDesc}

数据概览：
• 总记录数：${total.total} 条
• 即将到期：${expiring.total} 台

详细列表请在"我的存档"或"管理端"中查看。`
      }
      
      default: {
        const result = await collection.where(query).count()
        return `📊 ${scopeDesc}

共有 **${result.total} 条**检定记录。

您可以问我更具体的问题，比如：
• "有多少设备即将到期？"
• "本月检定了多少台？"
• "检定合格率是多少？"`
      }
    }
  } catch (error) {
    console.error('数据查询错误:', error)
    return '查询数据时出现问题，请稍后再试。'
  }
}

/**
 * 获取权限范围描述
 */
function getScopeDescription(permission) {
  switch (permission.type) {
    case 'enterprise':
      return `【${permission.scope}】数据查询结果`
    case 'district_admin':
      return `【${permission.scope}辖区】数据查询结果`
    case 'super_admin':
      return `【全平台】数据查询结果`
    default:
      return `数据查询结果`
  }
}

/**
 * 处理知识问答
 */
function handleKnowledgeQuery(question, intent) {
  const q = question.toLowerCase()
  
  // 检定周期
  if (q.includes('周期') || q.includes('多久') || q.includes('频率')) {
    return `根据JJG52-2013《弹性元件式一般压力表检定规程》规定：

📅 **检定周期：6个月（半年）**

以下情况需要检定：
1. 新购置的压力表首次使用前
2. 修理后的压力表
3. 长期停用后重新使用前
4. 定期周期检定（每6个月）

💡 提示：用于安全防护、贸易结算的压力表属于强制检定，必须按期送检。`
  }
  
  // 不合格标准
  if (q.includes('不合格') || q.includes('判定')) {
    return `压力表检定不合格的判定标准：

❌ **不合格情形：**
1. 示值误差超过允许误差
2. 回程误差超过允许误差
3. 轻敲位移超过允许误差的1/2
4. 指针不能回零或零点误差超标
5. 外观缺陷影响正常读数

📊 **准确度等级与允许误差：**
• 1.0级：±1.0%
• 1.6级：±1.6%
• 2.5级：±2.5%
• 4.0级：±4.0%`
  }
  
  // 更换标准
  if (q.includes('更换') || q.includes('报废')) {
    return `压力表需要更换的情形：

🔄 **必须更换：**
1. 指针弯曲、折断或松动
2. 表盘玻璃破碎
3. 表盘刻度模糊不清
4. 接头螺纹损坏
5. 连续两次检定不合格
6. 超过使用年限（一般5-8年）

⚠️ 使用损坏的压力表可能导致安全事故，请及时更换！`
  }
  
  // 准确度等级
  if (q.includes('准确度') || q.includes('等级') || q.includes('精度')) {
    return `压力表准确度等级说明：

📏 **常见等级与允许误差：**
| 等级 | 允许误差 | 适用场合 |
|------|---------|---------|
| 1.0  | ±1.0%   | 精密测量 |
| 1.6  | ±1.6%   | 一般工业 |
| 2.5  | ±2.5%   | 普通场合 |
| 4.0  | ±4.0%   | 参考指示 |

💡 压力容器用压力表准确度等级应不低于2.5级。`
  }
  
  // 选型
  if (q.includes('选型') || q.includes('量程') || q.includes('怎么选')) {
    return `压力表选型指南：

📐 **量程选择：**
测量上限 = 被测压力 × (1.5~3倍)
推荐选择2倍，使指针在刻度盘2/3位置工作

🎯 **选型要点：**
1. 确定被测介质（气体/液体/腐蚀性）
2. 确定工作压力范围
3. 选择合适的准确度等级
4. 考虑环境温度和振动情况
5. 压力容器用表盘直径≥100mm`
  }
  
  // 安装
  if (q.includes('安装') || q.includes('怎么装')) {
    return `压力表安装要求：

📍 **安装位置：**
• 垂直安装，倾斜角度不超过30°
• 液体测压：取压点在管道下部
• 气体测压：取压点在管道上部

🔧 **安装注意事项：**
1. 使用密封垫片防止泄漏
2. 安装前检查接口螺纹匹配
3. 避免安装在振动大的位置
4. 远离热源
5. 便于观察读数和维护`
  }
  
  // 通用知识回答
  return getGeneralKnowledgeAnswer(question)
}

/**
 * 获取通用知识回答
 */
function getGeneralKnowledgeAnswer(question, permission) {
  const relevantKnowledge = getRelevantKnowledge(question)
  
  if (relevantKnowledge) {
    return `根据压力表检定相关规程：\n\n${relevantKnowledge}\n\n如需了解更详细的信息，请告诉我您具体想了解哪方面的内容。`
  }
  
  // 根据权限类型显示不同的数据查询提示
  let dataQueryExamples = ''
  switch (permission?.type) {
    case 'enterprise':
      dataQueryExamples = `📊 **数据查询（本企业）：**
• 我们还有多少设备即将到期？
• 本月检定了多少台？
• 检定合格率是多少？`
      break
    case 'district_admin':
      dataQueryExamples = `📊 **数据查询（本辖区）：**
• 辖区内有多少设备即将到期？
• 本月检定了多少台？
• 辖区检定合格率是多少？`
      break
    case 'super_admin':
      dataQueryExamples = `📊 **数据查询（全平台）：**
• 平台有多少设备即将到期？
• 本月全平台检定了多少台？
• 平台检定合格率是多少？`
      break
    default:
      dataQueryExamples = `📊 **数据查询：**
• 有多少设备即将到期？
• 本月检定了多少台？
• 检定合格率是多少？`
  }
  
  return `您好！我是AI智能管家，可以为您解答以下问题：

📚 **专业知识：**
• 压力表检定周期是多久？
• 检定不合格的标准是什么？
• 压力表如何选型？
• 什么情况需要更换压力表？

${dataQueryExamples}

请告诉我您想了解什么？`
}

/**
 * 处理通用问答
 */
function handleGeneralQuery(question, permission) {
  const q = question.toLowerCase()
  
  // 问候语
  if (q.includes('你好') || q.includes('您好') || q.includes('hi') || q.includes('hello')) {
    return getWelcomeMessage(permission)
  }
  
  // 感谢
  if (q.includes('谢谢') || q.includes('感谢') || q.includes('thanks')) {
    return '不客气！如有其他问题随时可以问我。祝您工作顺利！'
  }
  
  // 默认回答
  return getGeneralKnowledgeAnswer(question, permission)
}

/**
 * 获取欢迎消息
 */
function getWelcomeMessage(permission) {
  let scopeInfo = ''
  let dataQueryHint = ''
  
  switch (permission.type) {
    case 'enterprise':
      scopeInfo = `当前身份：**${permission.scope}** 企业用户`
      dataQueryHint = '• 查询本企业的检定数据'
      break
    case 'district_admin':
      scopeInfo = `当前身份：**${permission.scope}** 辖区管理员`
      dataQueryHint = '• 查询本辖区的检定数据'
      break
    case 'super_admin':
      scopeInfo = '当前身份：**总管理员**'
      dataQueryHint = '• 查询全平台的检定数据'
      break
    default:
      scopeInfo = '当前身份：访客'
      dataQueryHint = '• 登录后可查询检定数据'
  }

  return `您好！我是压力表检定AI智能管家 🤖

${scopeInfo}

我可以帮您：
1. 📚 解答压力表检定专业问题
2. 📊 ${dataQueryHint.replace('• ', '')}
3. ⏰ 提醒设备检定到期

请问有什么可以帮您的？`
}
