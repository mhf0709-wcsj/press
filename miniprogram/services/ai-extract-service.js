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
    const cloudPath = `ai-extract/${Date.now()}.jpg`

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

    const modelSpec = this.normalizeModelSpec(extractResult.modelSpec, rawText)
    const verificationDate = this.normalizeDateValue(extractResult.verificationDate) || this.extractDateFromText(rawText)
    return {
      ...extractResult,
      modelSpec,
      verificationDate
    }
  }

  extractModelSpecFromText(text) {
    const normalized = String(text || '')
      .replace(/\r/g, '\n')
      .replace(/：/g, ':')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
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
    const match = String(text || '').match(/([\(（]?\s*\d+(?:\.\d+)?\s*(?:-|~|－|—|–|一|至|到)\s*\d+(?:\.\d+)?\s*[\)）]?\s*(?:k|M|G)?\s*P\s*a)/i)
    if (!match || !match[1]) return ''
    return match[1]
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/[－—–一到至~]/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\s*-\s*/g, '-')
      .replace(/([kMG])\s*P\s*a/i, (source, prefix) => `${prefix.toUpperCase()}Pa`)
      .replace(/P\s*a/i, 'Pa')
      .trim()
  }

  extractDateFromText(text) {
    const normalized = String(text || '').replace(/\r/g, '\n')
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
    const text = String(value || '')
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

  estimateConfidence(data) {
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
}

module.exports = new AIExtractService()
