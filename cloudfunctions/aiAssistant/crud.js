const STATUS_VALUES = ['\u5728\u7528', '\u5907\u7528', '\u9001\u68c0', '\u505c\u7528', '\u62a5\u5e9f']
const CONCLUSION_VALUES = ['\u5408\u683c', '\u4e0d\u5408\u683c']

function createCrudHandlers({ db, _, formatDateTime }) {
  function buildScopeQuery(entity, permission) {
    const query = {}
    if (!permission) return query

    if (permission.type === 'enterprise') {
      const companyName = permission.scope || ''
      if (companyName) {
        query.enterpriseName = companyName
      }
      return query
    }

    if (permission.type === 'district_admin') {
      const district = permission.scope || ''
      if (district) {
        query.district = district
      }
      return query
    }

    return query
  }

  function detectOperation(question) {
    if (/(删除|移除|作废|删掉)/.test(question)) return 'delete'
    if (/(修改|改成|改为|更新|变更)/.test(question)) return 'update'
    if (/(新增|创建|录入|添加)/.test(question)) return 'create'
    if (/(查询|查找|查一下|查一查|看看|列出|搜索|找出|找到)/.test(question)) return 'query'
    return 'query'
  }

  function detectEntity(question) {
    if (/(检定记录|记录|台账记录|证书记录)/.test(question)) return 'pressure_record'
    if (/(设备|设备台账)/.test(question) && !/(压力表|仪表)/.test(question)) return 'equipment'
    if (/(压力表|仪表)/.test(question)) return 'device'
    return 'pressure_record'
  }

  function extractDate(question) {
    const match = question.match(/(20\d{2})[-\/年](\d{1,2})[-\/月](\d{1,2})/)
    if (!match) return ''
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
  }

  function extractTarget(question, entity) {
    const target = {}
    const factoryNoMatch = question.match(/(?:出厂编号|表号|编号)\s*[:：]?\s*([A-Za-z0-9\-_]+)/)
    const certNoMatch = question.match(/(?:证书编号|证书号)\s*[:：]?\s*([A-Za-z0-9\-_]+)/)
    const deviceNoMatch = question.match(/(?:设备编号)\s*[:：]?\s*([A-Za-z0-9\-_]+)/)
    const equipmentNoMatch = question.match(/(?:设备号)\s*[:：]?\s*([A-Za-z0-9\-_]+)/)

    if (factoryNoMatch) target.factoryNo = factoryNoMatch[1]
    if (certNoMatch) target.certNo = certNoMatch[1]
    if (deviceNoMatch) target.deviceNo = deviceNoMatch[1]
    if (equipmentNoMatch) target.equipmentNo = equipmentNoMatch[1]

    if (entity === 'device') {
      const nameMatch = question.match(/(?:压力表|仪表)(?:名称)?(?:为|叫|是)?\s*([^\s，。；,]+)(?:的|这块|那块)?/)
      if (!target.factoryNo && !target.deviceNo && nameMatch) {
        target.deviceName = nameMatch[1]
      }
    }

    if (entity === 'equipment') {
      const nameMatch = question.match(/(?:设备)(?:名称)?(?:为|叫|是)?\s*([^\s，。；,]+)(?:的|这台|那台)?/)
      if (!target.equipmentNo && nameMatch) {
        target.equipmentName = nameMatch[1]
      }
    }

    return target
  }

  function extractChanges(question, entity) {
    const changes = {}
    const status = STATUS_VALUES.find((item) => question.includes(item))
    const conclusion = CONCLUSION_VALUES.find((item) => question.includes(item))
    const date = extractDate(question)

    if (entity === 'device') {
      if (status) changes.status = status
      const locationMatch = question.match(/(?:安装位置|位置)(?:改成|改为|更新为)?\s*([^\n，。；,]+)/)
      if (locationMatch) changes.installLocation = locationMatch[1].trim()
    }

    if (entity === 'equipment') {
      if (status) changes.status = status
      const locationMatch = question.match(/(?:安装位置|位置)(?:改成|改为|更新为)?\s*([^\n，。；,]+)/)
      if (locationMatch) changes.location = locationMatch[1].trim()
      const districtMatch = question.match(/(?:辖区)(?:改成|改为|更新为)?\s*([^\n，。；,]+)/)
      if (districtMatch) changes.district = districtMatch[1].trim()
    }

    if (entity === 'pressure_record') {
      if (conclusion) changes.conclusion = conclusion
      if (date) changes.verificationDate = date
      const sendUnitMatch = question.match(/(?:送检单位)(?:改成|改为|更新为)?\s*([^\n，。；,]+)/)
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
    if (entity === 'device') return '\u538b\u529b\u8868'
    if (entity === 'equipment') return '\u8bbe\u5907'
    return '\u68c0\u5b9a\u8bb0\u5f55'
  }

  function buildMatchQuery(entity, target, permission) {
    const query = buildScopeQuery(entity, permission)
    if (target.factoryNo) query.factoryNo = target.factoryNo
    if (target.certNo) query.certNo = target.certNo
    if (target.deviceNo) query.deviceNo = target.deviceNo
    if (target.equipmentNo) query.equipmentNo = target.equipmentNo
    if (target.deviceName) {
      query.deviceName = db.RegExp({ regexp: target.deviceName, options: 'i' })
    }
    if (target.equipmentName) {
      query.equipmentName = db.RegExp({ regexp: target.equipmentName, options: 'i' })
    }
    return query
  }

  async function findMatches(entity, target, permission) {
    const collectionName = getCollectionName(entity)
    const query = buildMatchQuery(entity, target, permission)
    const res = await db.collection(collectionName).where(query).limit(5).get()
    return res.data || []
  }

  function summarizeItem(entity, item) {
    if (entity === 'device') {
      return {
        id: item._id,
        title: item.deviceName || '\u672a\u547d\u540d\u538b\u529b\u8868',
        subtitle: item.factoryNo || item.deviceNo || '-'
      }
    }
    if (entity === 'equipment') {
      return {
        id: item._id,
        title: item.equipmentName || '\u672a\u547d\u540d\u8bbe\u5907',
        subtitle: item.equipmentNo || item.location || '-'
      }
    }
    return {
      id: item._id,
      title: item.factoryNo || item.certNo || '\u68c0\u5b9a\u8bb0\u5f55',
      subtitle: item.deviceName || item.equipmentName || '-'
    }
  }

  function buildConfirmText(operation, entityLabel, matches, changes) {
    if (operation === 'delete') {
      return `\u6211\u51c6\u5907\u5220\u9664 1 \u6761${entityLabel}\u6570\u636e\uff1a${matches[0].title}\uff0c\u662f\u5426\u786e\u8ba4\uff1f`
    }

    const changeText = Object.keys(changes).map((key) => `${key}=${changes[key]}`).join('\u3001')
    return `\u6211\u51c6\u5907\u5c06${entityLabel}\u300c${matches[0].title}\u300d\u4fee\u6539\u4e3a\uff1a${changeText}\uff0c\u662f\u5426\u786e\u8ba4\uff1f`
  }

  async function planCrudAction({ question, permission }) {
    const operation = detectOperation(question)
    const entity = detectEntity(question)
    const entityLabel = getEntityLabel(entity)

    if (operation === 'create') {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: `\u6211\u5df2\u7406\u89e3\u4f60\u60f3\u65b0\u589e${entityLabel}\u3002\u7b2c\u4e00\u671f\u5148\u652f\u6301\u67e5\u8be2\u3001\u4fee\u6539\u3001\u5220\u9664\uff0c\u65b0\u589e\u6211\u5efa\u8bae\u5148\u8d70\u5bf9\u8bdd\u8865\u5b57\u6bb5\u6d41\uff0c\u6211\u4e0b\u4e00\u6b65\u53ef\u4ee5\u7ee7\u7eed\u5e2e\u4f60\u63a5\u4e0a\u3002`
      }
    }

    const target = extractTarget(question, entity)
    const changes = extractChanges(question, entity)
    const matches = await findMatches(entity, target, permission)
    const summarized = matches.map((item) => summarizeItem(entity, item))

    if (operation === 'query') {
      return {
        success: true,
        mode: 'result',
        operation,
        entity,
        entityLabel,
        answer: matches.length
          ? `\u6211\u627e\u5230\u4e86 ${matches.length} \u6761${entityLabel}\u76f8\u5173\u6570\u636e\u3002`
          : `\u6ca1\u6709\u627e\u5230\u7b26\u5408\u6761\u4ef6\u7684${entityLabel}\u3002`,
        items: summarized
      }
    }

    if (!matches.length) {
      return {
        success: true,
        mode: 'result',
        operation,
        entity,
        entityLabel,
        answer: `\u6211\u6ca1\u6709\u627e\u5230\u53ef\u4ee5${operation === 'delete' ? '\u5220\u9664' : '\u4fee\u6539'}\u7684${entityLabel}\u3002\u4f60\u53ef\u4ee5\u518d\u63d0\u4f9b\u51fa\u5382\u7f16\u53f7\u3001\u8bc1\u4e66\u7f16\u53f7\u6216\u8bbe\u5907\u540d\u79f0\u3002`,
        items: []
      }
    }

    if (matches.length > 1) {
      return {
        success: true,
        mode: 'select',
        operation,
        entity,
        entityLabel,
        answer: `\u6211\u627e\u5230\u4e86 ${matches.length} \u6761${entityLabel}\uff0c\u8bf7\u5148\u9009\u5b9a\u4f60\u8981\u64cd\u4f5c\u7684\u90a3\u4e00\u6761\u3002`,
        items: summarized,
        payloadBase: {
          operation,
          entity,
          changes
        }
      }
    }

    if (operation === 'update' && !Object.keys(changes).length) {
      return {
        success: true,
        mode: 'collect',
        operation,
        entity,
        entityLabel,
        answer: `\u6211\u627e\u5230\u4e86\u8981\u4fee\u6539\u7684${entityLabel}\uff0c\u4f46\u8fd8\u6ca1\u8bc6\u522b\u5230\u4f60\u60f3\u6539\u7684\u5b57\u6bb5\u3002\u4f60\u53ef\u4ee5\u50cf\u8fd9\u6837\u8bf4\uff1a\u201c\u628a\u72b6\u6001\u6539\u6210\u505c\u7528\u201d\u6216\u201c\u628a\u68c0\u5b9a\u65e5\u671f\u6539\u6210 2026-04-17\u201d\u3002`
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

    const scopeQuery = buildScopeQuery(entity, permission)
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
        answer: `\u5df2\u5220\u9664${getEntityLabel(entity)}\u300c${summarizeItem(entity, current).title}\u300d\u3002`
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
        answer: `\u5df2\u66f4\u65b0${getEntityLabel(entity)}\u300c${summarizeItem(entity, current).title}\u300d\u3002`
      }
    }

    throw new Error(`Unsupported CRUD operation: ${operation}`)
  }

  return {
    planCrudAction,
    executeCrudAction
  }
}

module.exports = {
  createCrudHandlers
}
