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

  function detectOperation(question) {
    question = String(question || '')
    if (/(删除|删掉|移除|清掉|作废)/.test(question)) return 'delete'
    if (/(修改|改成|改为|更新|变更|调整|设为|设置为|换成)/.test(question)) return 'update'
    if (/(新增|创建|录入|添加|新建|建档)/.test(question)) return 'create'
    return 'query'
  }

  function detectEntity(question) {
    question = String(question || '')
    if (/(检定记录|证书记录|证书|检定数据|记录)/.test(question)) return 'pressure_record'
    if (/(设备|所属设备|设备档案)/.test(question) && !/(压力表|仪表|表)/.test(question)) return 'equipment'
    if (/(压力表|仪表|表)/.test(question)) return 'device'
    return 'device'
  }

  function extractDate(question) {
    question = String(question || '')
    const match = question.match(/(20\d{2})[-/年.](\d{1,2})[-/月.](\d{1,2})/)
    if (!match) return ''
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
  }

  function extractTarget(question, entity) {
    question = String(question || '')
    const target = {
      rawCode: '',
      ambiguousCode: false
    }

    const factoryNo = pickFirst(question, [
      /(?:出厂编号|出厂号|表编号|表号)\s*(?:是|为|=|:|：)?\s*([A-Za-z0-9\-_]+)/,
      /(?:出厂编号|出厂号|表编号|表号)[^\dA-Za-z]*([A-Za-z0-9\-_]+)/
    ])
    const certNo = pickFirst(question, [
      /(?:证书编号|证书号)\s*(?:是|为|=|:|：)?\s*([A-Za-z0-9\-_]+)/,
      /(?:证书编号|证书号)[^\dA-Za-z]*([A-Za-z0-9\-_]+)/
    ])
    const deviceNo = pickFirst(question, [
      /(?:压力表编号|仪表编号|设备编号)\s*(?:是|为|=|:|：)?\s*([A-Za-z0-9\-_]+)/
    ])
    const equipmentNo = pickFirst(question, [
      /(?:所属设备编号|设备号)\s*(?:是|为|=|:|：)?\s*([A-Za-z0-9\-_]+)/
    ])
    const tailCode = pickFirst(question, [
      /(?:尾号|后几位)\s*(?:是|为|=|:|：)?\s*([A-Za-z0-9\-_]+)/
    ])
    const genericCode = pickFirst(question, [
      /(?:编号|号码|号)\s*(?:是|为|=|:|：)?\s*([A-Za-z0-9\-_]+)/
    ])

    if (factoryNo) target.factoryNo = factoryNo
    if (certNo) target.certNo = certNo
    if (deviceNo) target.deviceNo = deviceNo
    if (equipmentNo) target.equipmentNo = equipmentNo
    if (tailCode) {
      target.rawCode = tailCode
      target.tailCode = tailCode
    }

    if (!target.factoryNo && !target.certNo && !target.deviceNo && !target.equipmentNo && genericCode) {
      target.rawCode = genericCode
      target.ambiguousCode = true
    }

    if (entity === 'device') {
      const name = pickFirst(question, [
        /(?:压力表|仪表|表)(?:名称|名字)?\s*(?:是|为|叫|=|:|：)?\s*([^\s，。；,]+)/,
        /(?:查|查询|看看|帮我看|找)\s*(?:一下|下)?\s*([^\s，。；,]+)(?:压力表|仪表|表)/
      ])
      if (!target.factoryNo && !target.deviceNo && name) target.deviceName = name
    }

    if (entity === 'equipment') {
      const name = pickFirst(question, [
        /(?:设备)(?:名称|名字)?\s*(?:是|为|叫|=|:|：)?\s*([^\s，。；,]+)/
      ])
      if (!target.equipmentNo && name) target.equipmentName = name
    }

    return target
  }

  function extractChanges(question, entity) {
    question = String(question || '')
    const changes = {}
    const status = STATUS_VALUES.find((item) => question.indexOf(item) >= 0)
    const conclusion = CONCLUSION_VALUES.find((item) => question.indexOf(item) >= 0)
    const date = extractDate(question)

    const modelSpec = pickFirst(question, [
      /(?:型号规格|规格型号|型号|规格)\s*(?:修改为|修改成|改成|改为|更新为|设为|设置为|换成)\s*([^\n，。；,]+)/,
      /(?:改成|改为|换成)\s*([^\n，。；,]+)\s*(?:这个|该|这块)?(?:型号规格|规格型号|型号|规格)/
    ])
    const instrumentName = pickFirst(question, [
      /(?:仪表名称|压力表名称|表名|名称)\s*(?:修改为|修改成|改成|改为|更新为|设为|设置为|换成)\s*([^\n，。；,]+)/,
      /(?:改成|改为|换成)\s*([^\n，。；,]+)\s*(?:这个|该|这块)?(?:仪表名称|压力表名称|表名|名称)/
    ])
    const manufacturer = pickFirst(question, [
      /(?:制造单位|厂家|制造厂)\s*(?:修改为|修改成|改成|改为|更新为|设为|设置为|换成)\s*([^\n，。；,]+)/
    ])
    const location = pickFirst(question, [
      /(?:安装位置|位置)\s*(?:修改为|修改成|改成|改为|更新为|设为|设置为|换成)\s*([^\n，。；,]+)/
    ])
    const district = pickFirst(question, [
      /(?:辖区|片区)\s*(?:修改为|修改成|改成|改为|更新为|设为|设置为|换成)\s*([^\n，。；,]+)/
    ])
    const sendUnit = pickFirst(question, [
      /(?:送检单位)\s*(?:修改为|修改成|改成|改为|更新为|设为|设置为|换成)\s*([^\n，。；,]+)/
    ])
    const equipmentName = pickFirst(question, [
      /(?:所属设备|绑定设备|设备)\s*(?:修改为|修改成|改成|改为|更新为|换成|绑定到|换绑到)\s*([^\n，。；,]+)/
    ])

    if (entity === 'device') {
      if (status) changes.status = status
      if (modelSpec) changes.modelSpec = modelSpec
      if (instrumentName) changes.deviceName = instrumentName
      if (manufacturer) changes.manufacturer = manufacturer
      if (location) changes.installLocation = location
      if (equipmentName) changes.equipmentName = equipmentName
    }

    if (entity === 'equipment') {
      if (location) changes.location = location
      if (district) changes.district = district
    }

    if (entity === 'pressure_record') {
      if (conclusion) changes.conclusion = conclusion
      if (date) changes.verificationDate = date
      if (modelSpec) changes.modelSpec = modelSpec
      if (instrumentName) changes.instrumentName = instrumentName
      if (manufacturer) changes.manufacturer = manufacturer
      if (sendUnit) changes.sendUnit = sendUnit
    }

    return changes
  }

  function mergeStructuredIntent(question, operation, entity, structuredIntent) {
    const target = extractTarget(question, entity)
    const changes = extractChanges(question, entity)
    const intentTarget = structuredIntent && structuredIntent.target ? structuredIntent.target : {}
    const intentChanges = structuredIntent && structuredIntent.changes ? structuredIntent.changes : {}

    Object.keys(intentTarget).forEach((key) => {
      if (intentTarget[key] !== undefined && intentTarget[key] !== null && intentTarget[key] !== '') target[key] = intentTarget[key]
    })
    Object.keys(intentChanges).forEach((key) => {
      if (intentChanges[key] !== undefined && intentChanges[key] !== null && intentChanges[key] !== '') changes[key] = intentChanges[key]
    })

    if (entity === 'device' && changes.instrumentName && !changes.deviceName) {
      changes.deviceName = changes.instrumentName
      delete changes.instrumentName
    }

    return { target, changes }
  }

  function getCollectionName(entity) {
    if (entity === 'equipment') return 'equipments'
    if (entity === 'pressure_record') return 'pressure_records'
    return 'devices'
  }

  function getEntityLabel(entity) {
    if (entity === 'equipment') return '设备'
    if (entity === 'pressure_record') return '检定记录'
    return '压力表'
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
    const pushCandidate = (query, mode) => {
      candidates.push({ query: Object.assign({}, base, query), mode })
    }
    const pushCodeCandidates = (field, value) => {
      if (!value) return
      pushCandidate({ [field]: value }, 'exact')
      pushCandidate({ [field]: db.RegExp({ regexp: escapeRegExp(value), options: 'i' }) }, 'fuzzy')
      if (String(value).length <= 8) {
        pushCandidate({ [field]: db.RegExp({ regexp: `${escapeRegExp(value)}$`, options: 'i' }) }, 'tail')
      }
    }

    const activeFilter = { isDeleted: _.neq(true) }
    if (entity === 'device' || entity === 'equipment' || entity === 'pressure_record') {
      base.isDeleted = _.neq(true)
    }

    if (entity === 'device') {
      pushCodeCandidates('factoryNo', target.factoryNo || target.rawCode)
      pushCodeCandidates('deviceNo', target.deviceNo || target.rawCode)
      if (target.certNo) pushCodeCandidates('certNo', target.certNo)
      if (target.deviceName) {
        pushCandidate({ deviceName: db.RegExp({ regexp: escapeRegExp(target.deviceName), options: 'i' }) }, 'name')
      }
      if (target.equipmentName) {
        pushCandidate({ equipmentName: db.RegExp({ regexp: escapeRegExp(target.equipmentName), options: 'i' }) }, 'name')
      }
    } else if (entity === 'equipment') {
      pushCodeCandidates('equipmentNo', target.equipmentNo || target.rawCode)
      if (target.equipmentName) {
        pushCandidate({ equipmentName: db.RegExp({ regexp: escapeRegExp(target.equipmentName), options: 'i' }) }, 'name')
      }
    } else {
      pushCodeCandidates('factoryNo', target.factoryNo || target.rawCode)
      pushCodeCandidates('certNo', target.certNo || target.rawCode)
      pushCodeCandidates('deviceNo', target.deviceNo)
      if (target.deviceName) {
        pushCandidate({ instrumentName: db.RegExp({ regexp: escapeRegExp(target.deviceName), options: 'i' }) }, 'name')
      }
      if (target.equipmentName) {
        pushCandidate({ equipmentName: db.RegExp({ regexp: escapeRegExp(target.equipmentName), options: 'i' }) }, 'name')
      }
    }

    if (!candidates.length) {
      pushCandidate(activeFilter, 'scope')
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

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i]
      const res = await db.collection(collectionName).where(candidate.query).limit(5).get()
      const data = res.data || []
      if (data.length) {
        return { items: data, matchMode: candidate.mode, query: candidate.query }
      }
    }

    return { items: [], matchMode: 'none', query: {} }
  }

  function summarizeItem(entity, item) {
    if (entity === 'device') {
      return {
        id: item._id,
        title: item.deviceName || '未命名压力表',
        subtitle: [
          item.factoryNo ? `出厂编号 ${item.factoryNo}` : '',
          item.deviceNo ? `压力表编号 ${item.deviceNo}` : '',
          item.equipmentName ? `所属设备 ${item.equipmentName}` : '',
          item.status ? `状态 ${item.status}` : ''
        ].filter(Boolean).join(' / ')
      }
    }
    if (entity === 'equipment') {
      return {
        id: item._id,
        title: item.equipmentName || '未命名设备',
        subtitle: [
          item.equipmentNo ? `设备编号 ${item.equipmentNo}` : '',
          item.location ? `位置 ${item.location}` : '',
          item.gaugeCount !== undefined ? `压力表 ${item.gaugeCount} 块` : ''
        ].filter(Boolean).join(' / ')
      }
    }
    return {
      id: item._id,
      title: item.factoryNo || item.certNo || '检定记录',
      subtitle: [
        item.certNo ? `证书 ${item.certNo}` : '',
        item.instrumentName ? `仪表 ${item.instrumentName}` : '',
        item.equipmentName ? `所属设备 ${item.equipmentName}` : '',
        item.conclusion ? `结论 ${item.conclusion}` : ''
      ].filter(Boolean).join(' / ')
    }
  }

  function buildConfirmText(operation, entityLabel, matches, changes) {
    const title = matches[0] && matches[0].title ? matches[0].title : entityLabel
    if (operation === 'delete') {
      return `我准备删除 1 条${entityLabel}数据：“${title}”。删除后管理端会保留留痕，是否确认？`
    }

    const changeText = Object.keys(changes)
      .map((key) => `${getFieldLabel(key)}：${changes[key]}`)
      .join('；')
    return `我准备将${entityLabel}“${title}”修改为：${changeText}。是否确认？`
  }

  function buildClarifyText(entity, target) {
    const entityLabel = getEntityLabel(entity)
    if (target && target.ambiguousCode && target.rawCode) {
      return `我理解你要查${entityLabel}，但“编号 ${target.rawCode}”还不够明确。我会优先按出厂编号、压力表编号和证书编号查找；如果仍未命中，请补充完整编号或名称。`
    }
    return `我还缺少定位这条${entityLabel}的关键信息。可以补充出厂编号、证书编号、压力表编号，或者更完整的名称。`
  }

  function buildNoMatchText(entityLabel, target, matchMode) {
    if (target && target.rawCode) {
      return `我没有找到编号为“${target.rawCode}”的${entityLabel}。我已经尝试精确、尾号和模糊匹配；请再补充出厂编号、证书编号或完整名称。`
    }
    return `我没有找到符合条件的${entityLabel}。请补充出厂编号、证书编号、压力表编号或名称。`
  }

  async function planCrudAction({ question, permission, structuredIntent }) {
    structuredIntent = structuredIntent || {}
    const operation = structuredIntent.operation || detectOperation(question)
    const entity = structuredIntent.entity || detectEntity(question)
    const entityLabel = getEntityLabel(entity)
    const rewriteDebug = structuredIntent.debugSummary || ''

    if (structuredIntent.needClarify && structuredIntent.clarifyQuestion) {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: structuredIntent.clarifyQuestion,
        interpretation: rewriteDebug,
        queryLog: 'AI 理解结果需要继续补充信息'
      }
    }

    if (operation === 'create') {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: `我理解你要新增${entityLabel}。目前新增建档建议继续使用“上传照片”或“手动建档”，这样字段校验更完整。`,
        interpretation: rewriteDebug,
        queryLog: '新增操作已引导到建档流程'
      }
    }

    const merged = mergeStructuredIntent(question, operation, entity, structuredIntent)
    const target = merged.target
    const changes = normalizeChanges(entity, merged.changes)

    if (operation !== 'query' && operation === 'update' && !Object.keys(changes).length) {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: `我还没有识别到要修改的字段。你可以说“把型号改成 XXX”“把状态改成停用”“把所属设备改成洗衣机”。`,
        interpretation: rewriteDebug,
        queryLog: '缺少修改字段'
      }
    }

    if (!hasTarget(target) && operation === 'query') {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: buildClarifyText(entity, target),
        interpretation: rewriteDebug,
        queryLog: '缺少定位信息'
      }
    }

    const found = await findMatches(entity, target, permission)
    const matches = found.items
    const summarized = matches.map((item) => summarizeItem(entity, item))

    if (!matches.length) {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: buildNoMatchText(entityLabel, target, found.matchMode),
        interpretation: rewriteDebug || buildLocalInterpretation(operation, entity, target, changes),
        queryLog: `查询未命中 | 匹配方式=${getMatchModeLabel(found.matchMode)}`
      }
    }

    if (operation === 'query') {
      return {
        success: true,
        mode: 'result',
        operation,
        entity,
        entityLabel,
        answer: `我找到了 ${matches.length} 条${entityLabel}相关数据。`,
        items: summarized,
        interpretation: rewriteDebug || buildLocalInterpretation(operation, entity, target, changes),
        queryLog: `查询成功 | 匹配方式=${getMatchModeLabel(found.matchMode)}`
      }
    }

    if (matches.length > 1) {
      return {
        success: true,
        mode: 'select',
        operation,
        entity,
        entityLabel,
        answer: `我找到了 ${matches.length} 条${entityLabel}，请先选定要操作的那一条。`,
        items: summarized,
        interpretation: rewriteDebug || buildLocalInterpretation(operation, entity, target, changes),
        queryLog: `多条候选 | 匹配方式=${getMatchModeLabel(found.matchMode)}`,
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
      interpretation: rewriteDebug || buildLocalInterpretation(operation, entity, target, changes),
      queryLog: `待确认执行 | 匹配方式=${getMatchModeLabel(found.matchMode)}`,
      payload: {
        operation,
        entity,
        targetId: matches[0]._id,
        changes
      }
    }
  }

  async function executeCrudAction({ payload, permission }) {
    const operation = payload && payload.operation
    const entity = payload && payload.entity
    const targetId = payload && payload.targetId
    const changes = payload && payload.changes ? payload.changes : {}

    if (!operation || !entity || !targetId) {
      throw new Error('缺少可执行的操作信息。')
    }

    const collectionName = getCollectionName(entity)
    const recordRes = await db.collection(collectionName).doc(targetId).get()
    const current = recordRes.data
    if (!current) {
      throw new Error('没有找到要操作的数据。')
    }

    assertPermission(current, permission)

    if (operation === 'delete') {
      await softDeleteRecord(collectionName, entity, targetId, current, permission)
      return {
        success: true,
        answer: `已删除${getEntityLabel(entity)}“${summarizeItem(entity, current).title}”，管理端已保留删除留痕。`
      }
    }

    if (operation === 'update') {
      const updateData = normalizeChanges(entity, changes)
      if (!Object.keys(updateData).length) {
        throw new Error('没有识别到可修改字段。')
      }

      if (entity === 'device' && updateData.equipmentName) {
        const binding = await resolveEquipmentBinding(updateData.equipmentName, current, permission)
        updateData.equipmentId = binding.equipmentId
        updateData.equipmentName = binding.equipmentName
      }

      await db.collection(collectionName).doc(targetId).update({
        data: Object.assign({}, updateData, {
          updateTime: formatDateTime(new Date())
        })
      })

      if (entity === 'device' && updateData.equipmentId && updateData.equipmentId !== current.equipmentId) {
        await Promise.all([
          current.equipmentId ? updateEquipmentGaugeCount(current.equipmentId) : Promise.resolve(),
          updateEquipmentGaugeCount(updateData.equipmentId)
        ])
      }

      return {
        success: true,
        answer: `好的，已修改${getEntityLabel(entity)}“${summarizeItem(entity, current).title}”。`
      }
    }

    throw new Error(`暂不支持该操作：${operation}`)
  }

  async function softDeleteRecord(collectionName, entity, targetId, current, permission) {
    const deleteTime = formatDateTime(new Date())
    const operatorName = current.enterpriseName || (permission && permission.scope) || 'AI管家'
    let relatedRecordCount = 0

    await db.collection(collectionName).doc(targetId).update({
      data: {
        isDeleted: true,
        deletedAt: deleteTime,
        deletedBy: operatorName,
        updateTime: deleteTime
      }
    })

    if (entity === 'device') {
      const countRes = await db.collection('pressure_records').where({
        deviceId: targetId,
        isDeleted: _.neq(true)
      }).count()
      relatedRecordCount = Number(countRes.total || 0)

      if (relatedRecordCount > 0) {
        await db.collection('pressure_records').where({
          deviceId: targetId,
          isDeleted: _.neq(true)
        }).update({
          data: {
            isDeleted: true,
            deletedAt: deleteTime,
            deletedBy: operatorName,
            updateTime: deleteTime
          }
        })
      }

      if (current.equipmentId) {
        await updateEquipmentGaugeCount(current.equipmentId)
      }
    }

    try {
      await db.collection('deletion_logs').add({
        data: {
          entityType: entity,
          entityId: targetId,
          entityName: summarizeItem(entity, current).title,
          enterpriseName: current.enterpriseName || operatorName,
          district: current.district || '',
          equipmentId: current.equipmentId || '',
          equipmentName: current.equipmentName || '',
          factoryNo: current.factoryNo || '',
          deviceNo: current.deviceNo || '',
          certNo: current.certNo || '',
          relatedRecordCount,
          deletedAt: deleteTime,
          deletedBy: operatorName,
          deletedById: '',
          snapshot: current,
          createTime: deleteTime
        }
      })
    } catch (error) {}
  }

  function assertPermission(current, permission) {
    const scopeQuery = buildScopeQuery(permission)
    if (scopeQuery.enterpriseName && current.enterpriseName !== scopeQuery.enterpriseName) {
      throw new Error('没有权限操作该企业的数据。')
    }
    if (scopeQuery.district && current.district !== scopeQuery.district) {
      throw new Error('没有权限操作该辖区的数据。')
    }
  }

  async function resolveEquipmentBinding(equipmentName, current, permission) {
    const base = buildScopeQuery(permission)
    base.isDeleted = _.neq(true)
    base.equipmentName = db.RegExp({
      regexp: escapeRegExp(equipmentName),
      options: 'i'
    })

    const res = await db.collection('equipments').where(base).limit(2).get()
    const items = res.data || []
    if (!items.length) {
      throw new Error(`没有找到名称包含“${equipmentName}”的设备，请先在设备中心建好设备。`)
    }
    if (items.length > 1) {
      throw new Error(`找到多个名称包含“${equipmentName}”的设备，请输入更完整的设备名称。`)
    }

    return {
      equipmentId: items[0]._id,
      equipmentName: items[0].equipmentName || equipmentName
    }
  }

  async function updateEquipmentGaugeCount(equipmentId) {
    const countRes = await db.collection('devices').where({
      equipmentId,
      isDeleted: _.neq(true)
    }).count()

    await db.collection('equipments').doc(equipmentId).update({
      data: {
        gaugeCount: countRes.total || 0,
        updateTime: formatDateTime(new Date())
      }
    })
  }

  return {
    planCrudAction,
    executeCrudAction
  }
}

function normalizeChanges(entity, changes) {
  const allowed = {
    device: ['status', 'modelSpec', 'deviceName', 'manufacturer', 'installLocation', 'equipmentName'],
    equipment: ['location', 'district'],
    pressure_record: ['conclusion', 'verificationDate', 'modelSpec', 'instrumentName', 'manufacturer', 'sendUnit']
  }
  const result = {}
  const keys = allowed[entity] || []
  Object.keys(changes || {}).forEach((key) => {
    let nextKey = key
    if (entity === 'device' && key === 'instrumentName') nextKey = 'deviceName'
    if (keys.indexOf(nextKey) < 0) return
    const value = changes[key]
    if (value === undefined || value === null || value === '') return
    result[nextKey] = value
  })
  return result
}

function hasTarget(target) {
  if (!target) return false
  return !!(
    target.factoryNo ||
    target.certNo ||
    target.deviceNo ||
    target.equipmentNo ||
    target.deviceName ||
    target.equipmentName ||
    target.rawCode ||
    target.tailCode
  )
}

function buildLocalInterpretation(operation, entity, target, changes) {
  const parts = [
    `操作：${getOperationLabel(operation)}`,
    `对象：${getEntityLabelForDebug(entity)}`
  ]
  if (hasTarget(target)) parts.push(`定位：${formatDebugFields(target)}`)
  if (Object.keys(changes || {}).length) parts.push(`修改：${formatDebugFields(changes)}`)
  return parts.join(' | ')
}

function getOperationLabel(operation) {
  const map = { query: '查询', update: '修改', delete: '删除', create: '新增' }
  return map[operation] || operation || '-'
}

function getEntityLabelForDebug(entity) {
  const map = { device: '压力表', equipment: '设备', pressure_record: '检定记录' }
  return map[entity] || entity || '-'
}

function getFieldLabel(key) {
  const map = {
    factoryNo: '出厂编号',
    certNo: '证书编号',
    deviceNo: '压力表编号',
    equipmentNo: '设备编号',
    deviceName: '压力表名称',
    equipmentName: '所属设备',
    status: '状态',
    conclusion: '检定结论',
    verificationDate: '检定日期',
    modelSpec: '型号规格',
    instrumentName: '仪表名称',
    manufacturer: '制造单位',
    sendUnit: '送检单位',
    location: '位置',
    district: '辖区',
    installLocation: '安装位置',
    rawCode: '编号',
    tailCode: '尾号'
  }
  return map[key] || key
}

function formatDebugFields(source) {
  return Object.keys(source || {})
    .filter((key) => source[key] !== undefined && source[key] !== null && source[key] !== '')
    .map((key) => `${getFieldLabel(key)}=${source[key]}`)
    .join('，')
}

function pickFirst(text, patterns) {
  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i])
    if (match && match[1]) return String(match[1]).trim()
  }
  return ''
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = {
  createCrudHandlers
}
