const ocrService = require('./ocr-service')

const ERRORS = {
  selectImageFirst: '\u8bf7\u5148\u4e0a\u4f20\u4e00\u5f20\u56fe\u7247\u3002',
  preprocessFailed: 'AI\u9884\u5904\u7406\u5931\u8d25',
  preprocessCallFailed: 'AI\u9884\u5904\u7406\u670d\u52a1\u8c03\u7528\u5931\u8d25',
  extractFailed: 'AI\u5206\u6790\u5931\u8d25',
  extractCallFailed: 'AI\u5206\u6790\u670d\u52a1\u8c03\u7528\u5931\u8d25',
  noTextFound: '\u56fe\u7247\u4e2d\u672a\u8bc6\u522b\u5230\u53ef\u7528\u6587\u5b57\uff0c\u8bf7\u4e0a\u4f20\u66f4\u6e05\u6670\u7684\u8bc1\u4e66\u7167\u7247\u3002'
}

class AIExtractService {
  async extractFromImage(imagePath, options = {}) {
    const { userType = 'enterprise', userInfo = null } = options

    if (!imagePath) {
      throw new Error(ERRORS.selectImageFirst)
    }

    const imageInfo = await this.getImageInfo(imagePath)
    const compressedPath = await this.compressForExtraction(imagePath, imageInfo)
    const fileID = await this.uploadImage(compressedPath)
    const ocrResult = await this.callOCR(fileID)

    let extractResult = null
    try {
      extractResult = await this.callAIExtract({
        fileID,
        ocrText: ocrResult.text || '',
        userType,
        userInfo,
        ocrMeta: {
          apiUsed: ocrResult.apiUsed || '',
          total: ocrResult.total || 0
        }
      })
    } catch (error) {
      console.warn('AI extract fallback to local parser:', error)
      extractResult = this.buildFallbackExtract(ocrResult.text || '')
    }

    const normalizedResult = this.normalizeExtractResult(extractResult, ocrResult)

    return {
      ...normalizedResult,
      fileID,
      rawText: ocrResult.text || '',
      lines: ocrResult.lines || []
    }
  }

  async getImageInfo(imagePath) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: imagePath,
        success: resolve,
        fail: reject
      })
    })
  }

  async compressForExtraction(imagePath, imageInfo) {
    const maxSide = 2400
    if (imageInfo.width <= maxSide && imageInfo.height <= maxSide) {
      return imagePath
    }

    const options = { quality: 85 }

    if (imageInfo.width > maxSide || imageInfo.height > maxSide) {
      if (imageInfo.width >= imageInfo.height) {
        options.compressedWidth = maxSide
      } else {
        options.compressedWidth = Math.round(imageInfo.width * (maxSide / imageInfo.height))
      }
    }

    return ocrService.compressImage(imagePath, options)
  }

  async uploadImage(filePath) {
    const cloudPath = `ai-extract/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`

    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: (res) => resolve(res.fileID),
        fail: reject
      })
    })
  }

  async callOCR(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'baiduOcr',
        data: { fileID, adminToken: wx.getStorageSync('adminUser')?.token || '' },
        success: (res) => {
          if (res.result && res.result.success) {
            resolve(res.result)
            return
          }
          reject(new Error(res.result?.error || ERRORS.preprocessFailed))
        },
        fail: (error) => reject(new Error(error.errMsg || ERRORS.preprocessCallFailed))
      })
    })
  }

  async callAIExtract(payload) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'aiAssistant',
        data: {
          action: 'extractRecordFromImage',
          adminToken: wx.getStorageSync('adminUser')?.token || '',
          ...payload
        },
        success: (res) => {
          if (res.result && res.result.success && res.result.data) {
            resolve(res.result.data)
            return
          }
          reject(new Error(res.result?.error || ERRORS.extractFailed))
        },
        fail: (error) => reject(new Error(error.errMsg || ERRORS.extractCallFailed))
      })
    })
  }

  buildFallbackExtract(rawText) {
    if (!rawText) {
      throw new Error(ERRORS.noTextFound)
    }

    const parsed = ocrService.parseOcrText(rawText)
    return {
      ...parsed,
      ocrSource: 'ai_extract',
      confidence: this.estimateConfidence(parsed)
    }
  }

  normalizeExtractResult(extractResult = {}, ocrResult = {}) {
    const rawText = [
      ocrResult.text || '',
      ...(ocrResult.lines || []).map((item) => typeof item === 'string' ? item : (item.words || item.text || ''))
    ].filter(Boolean).join('\n')

    const fallback = rawText ? ocrService.parseOcrText(rawText) : {}
    const merged = {
      certNo: this.selectTrustedValue('certNo', extractResult.certNo, fallback.certNo, rawText),
      factoryNo: this.selectTrustedValue('factoryNo', extractResult.factoryNo, fallback.factoryNo, rawText),
      sendUnit: extractResult.sendUnit || fallback.sendUnit || '',
      instrumentName: extractResult.instrumentName || fallback.instrumentName || '',
      modelSpec: this.selectTrustedValue('modelSpec', extractResult.modelSpec, fallback.modelSpec, rawText),
      manufacturer: extractResult.manufacturer || fallback.manufacturer || '',
      verificationStd: this.selectTrustedValue('verificationStd', extractResult.verificationStd, fallback.verificationStd, rawText),
      conclusion: this.selectTrustedValue('conclusion', extractResult.conclusion, fallback.conclusion, rawText),
      verificationDate: this.selectTrustedValue('verificationDate', extractResult.verificationDate, fallback.verificationDate, rawText)
    }
    const normalized = {
      ...merged,
      modelSpec: this.normalizeModelSpec(merged.modelSpec, rawText),
      verificationDate: this.normalizeDateValue(merged.verificationDate) || this.extractDateFromText(rawText)
    }
    const recognitionMeta = this.reconcileRecognitionMeta(
      extractResult.recognitionMeta,
      normalized,
      extractResult,
      fallback,
      rawText
    )
    return {
      ...extractResult,
      ...normalized,
      confidence: this.estimateConfidence(normalized, recognitionMeta.fieldConfidence),
      recognitionMeta
    }
  }

  selectTrustedValue(field, aiValue, ruleValue, rawText) {
    const ai = String(aiValue || '').trim()
    const rule = String(ruleValue || '').trim()
    if (!ai) return rule
    if (!rule || this.normalizeEvidence(ai) === this.normalizeEvidence(rule)) return ai
    return this.hasStrongRuleEvidence(field, rule, rawText) ? rule : ai
  }

  hasStrongRuleEvidence(field, value, rawText) {
    if (!value) return false
    if (field === 'verificationDate') return this.normalizeDateValue(value) === this.extractDateFromText(rawText)
    if (field === 'modelSpec') return !!this.extractPressureRange(value)
    if (field === 'verificationStd') return /^JJG\s*\d/i.test(value)
    if (field === 'conclusion') return ['合格', '不合格'].includes(value)
    if (field === 'certNo') return /^[A-Za-z0-9][A-Za-z0-9\-/]{4,}$/.test(value)
    if (field === 'factoryNo') return /^[A-Za-z0-9][A-Za-z0-9\-/]{2,}$/.test(value)
    return false
  }

  reconcileRecognitionMeta(meta = {}, data = {}, aiData = {}, ruleData = {}, rawText = '') {
    const fields = [
      'certNo', 'factoryNo', 'sendUnit', 'instrumentName', 'modelSpec',
      'manufacturer', 'verificationStd', 'conclusion', 'verificationDate'
    ]
    const fieldSources = { ...(meta?.fieldSources || {}) }
    const fieldConfidence = { ...(meta?.fieldConfidence || {}) }
    const conflictFields = new Set(meta?.conflictFields || [])
    const fieldIssues = { ...(meta?.fieldIssues || {}) }

    fields.forEach((field) => {
      const value = String(data[field] || '').trim()
      const ai = String(aiData[field] || '').trim()
      const rule = String(ruleData[field] || '').trim()
      const conflict = ai && rule && this.normalizeEvidence(ai) !== this.normalizeEvidence(rule)
      if (conflict) conflictFields.add(field)

      if (!value) {
        fieldSources[field] = fieldSources[field] || '未识别'
        fieldConfidence[field] = 0
        fieldIssues[field] = fieldIssues[field] || '未识别到有效内容'
        return
      }

      if (conflict && this.normalizeEvidence(value) === this.normalizeEvidence(rule)) {
        fieldSources[field] = '规则校正（与 AI 结果冲突）'
        fieldConfidence[field] = Math.max(Number(fieldConfidence[field] || 0), 0.82)
        fieldIssues[field] = 'AI 与证书标签结果不一致，已采用标签附近内容'
      } else if (!fieldSources[field]) {
        fieldSources[field] = rule ? '本地规则补全' : 'AI 提取'
        fieldConfidence[field] = rule ? 0.82 : 0.76
      }

      if (!this.isFieldValueValid(field, value, rawText)) {
        fieldConfidence[field] = Math.min(Number(fieldConfidence[field] || 0.7), 0.55)
        fieldIssues[field] = fieldIssues[field] || '字段格式异常'
      }
    })

    const lowConfidenceFields = fields.filter((field) => (
      !data[field] || Number(fieldConfidence[field] || 0) < 0.8 || conflictFields.has(field)
    ))
    return {
      ...meta,
      mode: meta?.mode || 'rule_fallback',
      fieldSources,
      fieldConfidence,
      conflictFields: Array.from(conflictFields),
      lowConfidenceFields,
      fieldIssues
    }
  }

  isFieldValueValid(field, value, rawText) {
    if (field === 'verificationDate') return !!this.normalizeDateValue(value)
    if (field === 'modelSpec') {
      const compact = String(value).replace(/\s+/g, '').replace(/[/:：/／]+/g, '')
      return !!compact && !['型号', '规格', '型号规格', '规格型号'].includes(compact) && !/^JJG/i.test(compact)
    }
    if (field === 'conclusion') return ['合格', '不合格'].includes(value)
    if (field === 'verificationStd') return /^JJG\s*\d/i.test(value)
    if (field === 'certNo') return /^[A-Za-z0-9][A-Za-z0-9\-/]{4,}$/.test(value)
    if (field === 'factoryNo') return /^[A-Za-z0-9][A-Za-z0-9\-/]{2,}$/.test(value)
    return this.normalizeEvidence(rawText).includes(this.normalizeEvidence(value))
  }

  normalizeEvidence(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
  }

  extractModelSpecFromText(text) {
    const normalized = String(text || '')
      .replace(/\r/g, '\n')
      .replace(/：/g, ':')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/[ \t]+/g, ' ')

    const labelMatch = normalized.match(/(?:型\s*号\s*[\/／]?\s*规\s*格|型号规格|规格型号|型号|规格)[:：\s]*([^\n]*)/i)
    if (labelMatch && labelMatch[1]) {
      const fromLabel = this.normalizeModelSpec(labelMatch[1], normalized)
      if (fromLabel) return fromLabel
    }

    return this.extractPressureRange(normalized)
  }

  normalizeModelSpec(value, fullText = '') {
    const text = String(value || '').trim()
    const pressure = this.extractPressureRange(text)
    if (pressure) return pressure

    const compact = text.replace(/\s+/g, '').replace(/[/:：/／]+/g, '')
    if (compact && !['型号', '规格', '型号规格', '规格型号'].includes(compact)) {
      return text
    }

    return this.extractPressureRange(fullText)
  }

  extractPressureRange(text) {
    const match = String(text || '').match(/([\(（]?\s*(?:\d+(?:\.\d+)?|[Oo])\s*(?:-|~|～|－|—|–|一|至|到)\s*(?:\d+(?:\.\d+)?|[Oo])\s*[\)）]?\s*(?:k|M|G)?\s*P\s*a)/i)
    if (!match || !match[1]) return ''
    return match[1]
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/[－—–一到至~～]/g, '-')
      .replace(/[Oo]/g, '0')
      .replace(/\s+/g, ' ')
      .replace(/\s*-\s*/g, '-')
      .replace(/([kMG])\s*P\s*a/i, (source, prefix) => `${prefix.toUpperCase()}Pa`)
      .replace(/P\s*a/i, 'Pa')
      .trim()
  }

  extractDateFromText(text) {
    const normalized = this.normalizeOcrDateText(text).replace(/\r/g, '\n')
    const labelMatch = normalized.match(/(?:检定日期|检定日|校准日期)[:：\s]*([^\n]{0,40})/)
    if (labelMatch) {
      const fromLabel = this.normalizeDateValue(labelMatch[1])
      if (fromLabel) return fromLabel
    }

    const lines = normalized.split('\n').filter((line) => !/(有效期|到期|有效至)/.test(line))
    for (const line of lines) {
      const matches = line.matchAll(/(\d{4})\s*(?:年|[.\-/])\s*(\d{1,2})\s*(?:月|[.\-/])\s*(\d{1,2})\s*(?:日)?/g)
      for (const match of matches) {
        const date = this.buildValidDate(match[1], match[2], match[3])
        if (date) return date
      }
    }
    return ''
  }

  normalizeDateValue(value) {
    const text = this.normalizeOcrDateText(value)
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/) ||
      text.match(/(\d{4})\s*(?:年|[.\-/])\s*(\d{1,2})\s*(?:月|[.\-/])\s*(\d{1,2})\s*(?:日)?/)
    if (!match) return ''
    return this.buildValidDate(match[1], match[2], match[3])
  }

  buildValidDate(year, month, day) {
    const y = Number(year)
    const m = Number(month)
    const d = Number(day)
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return ''
    const date = new Date(y, m - 1, d)
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return ''
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  normalizeOcrDateText(value) {
    return String(value || '').replace(/[Oo](?=\s*(?:\d|年|月|日|[.\/-]))/g, '0')
  }

  estimateConfidence(data, fieldConfidence = {}) {
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
    const evidence = populated.length
      ? populated.reduce((sum, key) => sum + Number(fieldConfidence[key] || 0.72), 0) / populated.length
      : 0
    return Number((completeness * 0.4 + evidence * 0.6).toFixed(2))
  }
}

module.exports = new AIExtractService()
