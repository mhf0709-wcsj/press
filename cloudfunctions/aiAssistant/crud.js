const STATUS_VALUES = ['在用', '备用', '送检', '停用', '报废']
const CONCLUSION_VALUES = ['合格', '不合格']

function createCrudHandlers({ db, _, formatDateTime }) {
  function buildScopeQuery(permission) {
    const query = {}
    if (!permission) return query

    if (permission.type === 'enterprise' && permission.scope) {
      query.enterpriseName = permission.scope
    }

    if (permission.type === 'district_admin' && permission.scope) {
      query.district = permission.scope
    }

    return query
  }

  function detectOperation(question = '') {
    if (/(删除|移除|作废|删掉|清掉)/.test(question)) return 'delete'
    if (/(修改|改成|改为|更新|变更|调整|设为|设成)/.test(question)) return 'update'
    if (/(新增|创建|录入|添加|新建)/.test(question)) return 'create'
    if (/(查|查询|查找|搜索|找找|看看|看下|看一下|帮我看|列出|找出|有没有)/.test(question)) return 'query'
    return 'query'
  }

  function detectEntity(question = '') {
    if (/(检定记录|记录|证书记录|台账记录)/.test(question)) return 'pressure_record'
    if (/(设备|设备台账|设备档案)/.test(question) && !/(压力表|仪表|表)/.test(question)) return 'equipment'
    if (/(压力表|仪表|表\b)/.test(question)) return 'device'
    return 'pressure_record'
  }

  function extractDate(question = '') {
    const match = question.match(/(20\d{2})[-\/年](\d{1,2})[-\/月](\d{1,2})/)
    if (!match) return ''
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
  }

  function extractTarget(question = '', entity) {
    const target = {
      rawCode: '',
      ambiguousCode: false
    }

    const factoryNoMatch = question.match(/(?:出厂编号|出厂号|表号|表编号)\s*(?:为|是|叫|=|:|：)?\s*([A-Za-z0-9\-_]+)/)
    const certNoMatch = question.match(/(?:证书编号|证书号)\s*(?:为|是|叫|=|:|：)?\s*([A-Za-z0-9\-_]+)/)
    const deviceNoMatch = question.match(/(?:设备编号)\s*(?:为|是|叫|=|:|：)?\s*([A-Za-z0-9\-_]+)/)
    const equipmentNoMatch = question.match(/(?:设备号)\s*(?:为|是|叫|=|:|：)?\s*([A-Za-z0-9\-_]+)/)
    const genericCodeMatch = question.match(/(?:编号|号)\s*(?:为|是|叫|=|:|：)?\s*([A-Za-z0-9\-_]+)/)
    const tailCodeMatch = question.match(/(?:尾号|后几位)\s*(?:为|是|叫|=|:|：)?\s*([A-Za-z0-9\-_]+)/)

    if (factoryNoMatch) target.factoryNo = factoryNoMatch[1]
    if (certNoMatch) target.certNo = certNoMatch[1]
    if (deviceNoMatch) target.deviceNo = deviceNoMatch[1]
    if (equipmentNoMatch) target.equipmentNo = equipmentNoMatch[1]
    if (tailCodeMatch) {
      target.rawCode = tailCodeMatch[1]
      target.tailCode = tailCodeMatch[1]
    }

    if (!target.factoryNo && !target.certNo && !target.deviceNo && !target.equipmentNo && genericCodeMatch) {
      target.rawCode = genericCodeMatch[1]
      target.ambiguousCode = true
    }

    if (entity === 'device') {
      const nameMatch = question.match(/(?:压力表|仪表|表)(?:名称)?(?:为|是|叫)?\s*([^\s，。；,]+)/)
      if (!target.factoryNo && !target.deviceNo && nameMatch) {
        target.deviceName = nameMatch[1]
      }
      if (target.ambiguousCode) {
        target.factoryNo = target.rawCode
      }
    }

    if (entity === 'equipment') {
      const nameMatch = question.match(/(?:设备)(?:名称)?(?:为|是|叫)?\s*([^\s，。；,]+)/)
      if (!target.equipmentNo && nameMatch) {
        target.equipmentName = nameMatch[1]
      }
      if (target.ambiguousCode) {
        target.equipmentNo = target.rawCode
      }
    }

    if (entity === 'pressure_record') {
      if (target.ambiguousCode) {
        target.factoryNo = target.rawCode
      }
    }

    return target
  }

  function extractChanges(question = '', entity) {
    const changes = {}
    const status = STATUS_VALUES.find((item) => question.includes(item))
    const conclusion = CONCLUSION_VALUES.find((item) => question.includes(item))
    const date = extractDate(question)
    const extractValue = (patterns) => {
      for (const pattern of patterns) {
        const match = question.match(pattern)
        if (match && match[1]) return match[1].trim()
      }
      return ''
    }

    const modelSpec = extractValue([
      /(?:型号规格|型号|规格)(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)/,
      /(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)(?:的)?(?:型号规格|型号|规格)?/
    ])
    const instrumentName = extractValue([
      /(?:仪表名称|仪表名|表名|名称)(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)/,
      /(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)(?:的)?(?:仪表名称|仪表名|表名|名称)?/
    ])
    const manufacturer = extractValue([
      /(?:制造单位|厂家|制造厂)(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)/,
      /(?:改成|改为|修改成|修改为|更新为)\s*([^\n，。；,]+)(?:的)?(?:制造单位|厂家|制造厂)?/
    ])

    if (entity === 'device') {
      if (status) changes.status = status
      if (modelSpec) changes.modelSpec = modelSpec
      if (instrumentName) changes.deviceName = instrumentName
      if (manufacturer) changes.manufacturer = manufacturer
      const locationMatch = question.match(/(?:安装位置|位置)(?:改成|改为|更新为)\s*([^\n，。；,]+)/)
      if (locationMatch) changes.installLocation = locationMatch[1].trim()
    }

    if (entity === 'equipment') {
      if (status) changes.status = status
      const locationMatch = question.match(/(?:安装位置|位置)(?:改成|改为|更新为)\s*([^\n，。；,]+)/)
      if (locationMatch) changes.location = locationMatch[1].trim()
      const districtMatch = question.match(/(?:辖区|片区)(?:改成|改为|更新为)\s*([^\n，。；,]+)/)
      if (districtMatch) changes.district = districtMatch[1].trim()
    }

    if (entity === 'pressure_record') {
      if (conclusion) changes.conclusion = conclusion
      if (date) changes.verificationDate = date
      if (modelSpec) changes.modelSpec = modelSpec
      if (instrumentName) changes.instrumentName = instrumentName
      if (manufacturer) changes.manufacturer = manufacturer
      const sendUnitMatch = question.match(/(?:送检单位)(?:改成|改为|更新为)\s*([^\n，。；,]+)/)
      if (sendUnitMatch) changes.sendUnit = sendUnitMatch[1].trim()
    }

    return changes
  }

  function getCollectionName(entity) {
    if (entity === 'device') return 'devices'
    if (entity === 'equipment') return 'equipments'
    return 'pressure_records'
  }

  function getEntityLabel(entity) {
    if (entity === 'device') return '压力表'
    if (entity === 'equipment') return '设备'
    return '检定记录'
  }

  function getMatchModeLabel(mode) {
    if (mode === 'exact') return '精确匹配'
    if (mode === 'tail') return '尾号匹配'
    if (mode === 'name') return '名称匹配'
    if (mode === 'scope') return '范围检索'
    if (mode === 'fuzzy') return '模糊匹配'
    return mode || '未识别'
  }

  function buildQueryCandidates(entity, target, permission) {
    const base = buildScopeQuery(permission)
    const candidates = []
    const pushCandidate = (query, mode = 'exact') => {
      candidates.push({ query: { ...base, ...query }, mode })
    }

    if (target.factoryNo) {
      pushCandidate({ factoryNo: target.factoryNo }, 'exact')
      if (String(target.factoryNo).length <= 6) {
        pushCandidate({ factoryNo: db.RegExp({ regexp: `${escapeRegExp(target.factoryNo)}$`, options: 'i' }) }, 'tail')
        pushCandidate({ factoryNo: db.RegExp({ regexp: escapeRegExp(target.factoryNo), options: 'i' }) }, 'fuzzy')
      }
    }

    if (target.certNo) {
      pushCandidate({ certNo: target.certNo }, 'exact')
      if (String(target.certNo).length <= 6) {
        pushCandidate({ certNo: db.RegExp({ regexp: `${escapeRegExp(target.certNo)}$`, options: 'i' }) }, 'tail')
        pushCandidate({ certNo: db.RegExp({ regexp: escapeRegExp(target.certNo), options: 'i' }) }, 'fuzzy')
      }
    }

    if (target.deviceNo) {
      pushCandidate({ deviceNo: target.deviceNo }, 'exact')
      if (String(target.deviceNo).length <= 6) {
        pushCandidate({ deviceNo: db.RegExp({ regexp: `${escapeRegExp(target.deviceNo)}$`, options: 'i' }) }, 'tail')
      }
    }

    if (target.equipmentNo) {
      pushCandidate({ equipmentNo: target.equipmentNo }, 'exact')
      if (String(target.equipmentNo).length <= 6) {
        pushCandidate({ equipmentNo: db.RegExp({ regexp: `${escapeRegExp(target.equipmentNo)}$`, options: 'i' }) }, 'tail')
      }
    }

    if (target.tailCode && entity !== 'equipment') {
      pushCandidate({ factoryNo: db.RegExp({ regexp: `${escapeRegExp(target.tailCode)}$`, options: 'i' }) }, 'tail')
      pushCandidate({ certNo: db.RegExp({ regexp: `${escapeRegExp(target.tailCode)}$`, options: 'i' }) }, 'tail')
    }

    if (target.deviceName) {
      pushCandidate({ deviceName: db.RegExp({ regexp: escapeRegExp(target.deviceName), options: 'i' }) }, 'name')
    }

    if (target.equipmentName) {
      pushCandidate({ equipmentName: db.RegExp({ regexp: escapeRegExp(target.equipmentName), options: 'i' }) }, 'name')
    }

    if (!candidates.length) {
      pushCandidate({}, 'scope')
    }

    return dedupeCandidates(candidates)
  }

  function dedupeCandidates(candidates) {
    const seen = new Set()
    return candidates.filter((item) => {
      const key = JSON.stringify(item.query)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async function findMatches(entity, target, permission) {
    const collectionName = getCollectionName(entity)
    const candidates = buildQueryCandidates(entity, target, permission)
    const seenIds = new Set()

    for (const candidate of candidates) {
      const res = await db.collection(collectionName).where(candidate.query).limit(5).get()
      const data = (res.data || []).filter((item) => {
        if (seenIds.has(item._id)) return false
        seenIds.add(item._id)
        return true
      })
      if (data.length) {
        return { items: data, matchMode: candidate.mode }
      }
    }

    return { items: [], matchMode: 'none' }
  }

  function summarizeItem(entity, item) {
    if (entity === 'device') {
      return {
        id: item._id,
        title: item.deviceName || '未命名压力表',
        subtitle: item.factoryNo || item.deviceNo || '-'
      }
    }
    if (entity === 'equipment') {
      return {
        id: item._id,
        title: item.equipmentName || '未命名设备',
        subtitle: item.equipmentNo || item.location || '-'
      }
    }
    return {
      id: item._id,
      title: item.factoryNo || item.certNo || '检定记录',
      subtitle: item.deviceName || item.equipmentName || '-'
    }
  }

  function buildConfirmText(operation, entityLabel, matches, changes) {
    if (operation === 'delete') {
      return `我准备删除 1 条${entityLabel}数据：${matches[0].title}，是否确认？`
    }

    const changeText = Object.keys(changes).map((key) => `${key}=${changes[key]}`).join('、')
    return `我准备将${entityLabel}“${matches[0].title}”修改为：${changeText}，是否确认？`
  }

  function buildClarifyText(entity, target) {
    const entityLabel = getEntityLabel(entity)
    if (target.ambiguousCode && target.rawCode) {
      return `我理解到你想查询${entityLabel}，但“编号 ${target.rawCode}”还不够明确。请告诉我是出厂编号、证书编号，还是设备编号。`
    }
    return `我还缺少定位这条${entityLabel}的关键信息。你可以补充出厂编号、证书编号、设备编号，或者更完整的名称。`
  }

  function buildNoMatchText(operation, entityLabel, target, matchMode) {
    if (matchMode === 'tail') {
      return `我按尾号和模糊编号也帮你查过了，还是没有找到符合条件的${entityLabel}。你可以再补充完整编号。`
    }
    if (target.rawCode) {
      return `我没有找到编号为“${target.rawCode}”的${entityLabel}。你可以再告诉我是出厂编号、证书编号还是设备编号。`
    }
    return `我没有找到可以${operation === 'delete' ? '删除' : '修改'}的${entityLabel}。你可以再提供出厂编号、证书编号或设备名称。`
  }

  async function planCrudAction({ question, permission, structuredIntent = null }) {
    const operation = structuredIntent?.operation || detectOperation(question)
    const entity = structuredIntent?.entity || detectEntity(question)
    const entityLabel = getEntityLabel(entity)
    const rewriteDebug = structuredIntent?.debugSummary || ''

    if (structuredIntent?.needClarify && structuredIntent?.clarifyQuestion) {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: structuredIntent.clarifyQuestion,
        interpretation: rewriteDebug,
        queryLog: '命中阶段=澄清追问'
      }
    }

    if (operation === 'create') {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: `我已理解你想新增${entityLabel}。第一期先支持查询、修改、删除；如果你要新增，我建议继续走对话补字段流程。`,
        interpretation: rewriteDebug,
        queryLog: '命中阶段=新增引导'
      }
    }

    const target = {
      ...extractTarget(question, entity),
      ...(structuredIntent?.target || {})
    }
    const changes = {
      ...extractChanges(question, entity),
      ...(structuredIntent?.changes || {})
    }

    if (operation === 'query' && !target.factoryNo && !target.certNo && !target.deviceNo && !target.equipmentNo && !target.deviceName && !target.equipmentName && !target.rawCode) {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: buildClarifyText(entity, target),
        interpretation: rewriteDebug,
        queryLog: '命中阶段=缺少定位信息'
      }
    }

    if (operation !== 'query' && !Object.keys(changes).length && operation === 'update') {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: `我找到了要修改的${entityLabel}范围，但还没识别到你想改哪个字段。你可以像这样说：“把状态改成停用”或“把检定日期改成 2026-04-17”。`,
        interpretation: rewriteDebug,
        queryLog: '命中阶段=缺少修改字段'
      }
    }

    if (operation === 'query' && target.ambiguousCode && entity === 'pressure_record') {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: buildClarifyText(entity, target),
        interpretation: rewriteDebug,
        queryLog: '命中阶段=编号歧义'
      }
    }

    const { items: matches, matchMode } = await findMatches(entity, target, permission)
    const summarized = matches.map((item) => summarizeItem(entity, item))

    if (operation === 'query') {
      if (!matches.length) {
        return {
          success: true,
          mode: 'collect',
          operation,
          entity,
          entityLabel,
          answer: buildNoMatchText(operation, entityLabel, target, matchMode),
          interpretation: rewriteDebug,
          queryLog: `命中阶段=未命中 | 匹配模式=${getMatchModeLabel(matchMode)}`
        }
      }
      const answer = matchMode === 'tail'
        ? `我按尾号或模糊编号找到了 ${matches.length} 条${entityLabel}相关数据。`
        : `我找到了 ${matches.length} 条${entityLabel}相关数据。`
      return {
        success: true,
        mode: 'result',
        operation,
        entity,
        entityLabel,
        answer,
        items: summarized,
        interpretation: rewriteDebug,
        queryLog: `命中阶段=查询成功 | 匹配模式=${getMatchModeLabel(matchMode)}`
      }
    }

    if (!matches.length) {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: buildNoMatchText(operation, entityLabel, target, matchMode),
        interpretation: rewriteDebug,
        queryLog: `命中阶段=未命中 | 匹配模式=${getMatchModeLabel(matchMode)}`
      }
    }

    if (matches.length > 1) {
      return {
        success: true,
        mode: 'select',
        operation,
        entity,
        entityLabel,
        answer: `我找到了 ${matches.length} 条${entityLabel}，请先选定你要操作的那一条。`,
        items: summarized,
        interpretation: rewriteDebug,
        queryLog: `命中阶段=多条候选 | 匹配模式=${getMatchModeLabel(matchMode)}`,
        payloadBase: {
          operation,
          entity,
          changes
        }
      }
    }

    return {
      success: true,
      mode: 'confirm',
      operation,
      entity,
      entityLabel,
      needConfirm: true,
      answer: buildConfirmText(operation, entityLabel, summarized, changes),
      items: summarized,
      interpretation: rewriteDebug,
      queryLog: `命中阶段=确认执行 | 匹配模式=${getMatchModeLabel(matchMode)}`,
      payload: {
        operation,
        entity,
        targetId: matches[0]._id,
        changes
      }
    }
  }

  async function executeCrudAction({ payload, permission }) {
    const { operation, entity, targetId, changes = {} } = payload || {}
    if (!operation || !entity || !targetId) {
      throw new Error('Missing required CRUD payload.')
    }

    const collectionName = getCollectionName(entity)
    const recordRes = await db.collection(collectionName).doc(targetId).get()
    const current = recordRes.data
    if (!current) {
      throw new Error('Target record not found.')
    }

    const scopeQuery = buildScopeQuery(permission)
    if (scopeQuery.enterpriseName && current.enterpriseName !== scopeQuery.enterpriseName) {
      throw new Error('Permission denied for this target.')
    }
    if (scopeQuery.district && current.district !== scopeQuery.district) {
      throw new Error('Permission denied for this target.')
    }

    if (operation === 'delete') {
      await db.collection(collectionName).doc(targetId).remove()
      return {
        success: true,
        answer: `已删除${getEntityLabel(entity)}“${summarizeItem(entity, current).title}”。`
      }
    }

    if (operation === 'update') {
      await db.collection(collectionName).doc(targetId).update({
        data: {
          ...changes,
          updateTime: formatDateTime(new Date())
        }
      })
      return {
        success: true,
        answer: `已更新${getEntityLabel(entity)}“${summarizeItem(entity, current).title}”。`
      }
    }

    throw new Error(`Unsupported CRUD operation: ${operation}`)
  }

  return {
    planCrudAction,
    executeCrudAction
  }
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = {
  createCrudHandlers
}
