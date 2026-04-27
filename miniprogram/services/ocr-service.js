const debugLog = () => {}

class OCRService {
  constructor() {
    this.accessToken = null
  }

  async ensurePrivacyAuthorized() {
    if (!wx.requirePrivacyAuthorize) {
      return
    }

    return new Promise((resolve, reject) => {
      wx.requirePrivacyAuthorize({
        success: () => resolve(),
        fail: (error) => {
          reject(new Error(error?.errMsg || '\u672a\u5b8c\u6210\u9690\u79c1\u6388\u6743'))
        }
      })
    })
  }

  async init() {
    return Promise.resolve()
  }

  async chooseImage(options = {}) {
    const { count = 1, sourceType = ['album', 'camera'] } = options
    await this.ensurePrivacyAuthorized()

    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType,
        success: (res) => {
          const filePath = res?.tempFiles?.[0]?.tempFilePath
          if (filePath) {
            resolve(filePath)
            return
          }
          reject(new Error('\u672a\u83b7\u53d6\u5230\u56fe\u7247'))
        },
        fail: reject
      })
    })
  }

  async compressImage(imagePath, options = {}) {
    const { quality = 80, compressedWidth = 2000 } = options

    return new Promise((resolve) => {
      wx.compressImage({
        src: imagePath,
        quality,
        compressedWidth,
        success: (res) => resolve(res.tempFilePath),
        fail: () => resolve(imagePath)
      })
    })
  }

  async uploadImage(filePath, cloudPath) {
    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: (res) => resolve(res.fileID),
        fail: reject
      })
    })
  }

  async performOCR(imagePath) {
    wx.showLoading({ title: 'AI\u5206\u6790\u4e2d...' })

    try {
      const imageInfo = await new Promise((resolve, reject) => {
        wx.getImageInfo({ src: imagePath, success: resolve, fail: reject })
      })

      const maxSide = 1600
      const options = { quality: 70 }

      if (imageInfo.width > maxSide || imageInfo.height > maxSide) {
        if (imageInfo.width >= imageInfo.height) {
          options.compressedWidth = maxSide
        } else {
          options.compressedWidth = Math.round(imageInfo.width * (maxSide / imageInfo.height))
        }
      }

      const compressedPath = await this.compressImage(imagePath, options)
      const cloudPath = `ocr-temp/enterprise_${Date.now()}.jpg`
      const fileID = await this.uploadImage(compressedPath, cloudPath)
      const result = await this.callOCRFunction(fileID)
      await this.deleteTempFile(fileID)
      return result
    } catch (error) {
      wx.hideLoading()
      if (error.message && error.message.includes('image size error')) {
        throw new Error('\u56fe\u7247\u5c3a\u5bf8\u4e0d\u5408\u9002\uff0c\u8bf7\u91cd\u65b0\u62cd\u6444\u4e00\u5f20\u6e05\u6670\u7684\u8fd1\u666f\u7167\u7247')
      }
      throw error
    }
  }

  async callOCRFunction(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'baiduOcr',
        data: { fileID },
        success: (res) => {
          wx.hideLoading()
          if (res.result && res.result.success && res.result.text) {
            resolve(this.parseOcrText(res.result.text))
            return
          }
          reject(new Error(res.result?.error || 'AI\u5206\u6790\u5931\u8d25'))
        },
        fail: (err) => {
          wx.hideLoading()
          reject(new Error(err.errMsg || 'AI\u670d\u52a1\u8c03\u7528\u5931\u8d25'))
        }
      })
    })
  }

  parseOcrText(text) {
    const raw = String(text || '')
    const normalized = raw
      .replace(/\r/g, '\n')
      .replace(/[：]/g, ':')
      .replace(/[ \t]+/g, ' ')

    debugLog('parse ocr text', normalized)

    const result = {
      certNo: '',
      sendUnit: '',
      instrumentName: '',
      modelSpec: '',
      factoryNo: '',
      manufacturer: '',
      verificationStd: '',
      conclusion: '',
      verificationDate: ''
    }

    result.certNo = this.firstMatch(normalized, [
      /(?:\u8bc1\u4e66\u7f16\u53f7|\u8bc1\u4e66\u53f7|NO|No)[:\s]*([A-Za-z0-9-]{5,})/i
    ])
    result.sendUnit = this.cleanupLineValue(this.firstMatch(normalized, [
      /(?:\u9001\u68c0\u5355\u4f4d|\u59d4\u6258\u5355\u4f4d|\u4f7f\u7528\u5355\u4f4d)[:\s]*([^\n]+)/i
    ]))
    result.instrumentName = this.cleanupLineValue(this.firstMatch(normalized, [
      /(?:\u5668\u5177\u540d\u79f0|\u4eea\u8868\u540d\u79f0|\u540d\u79f0)[:\s]*([^\n]+)/i
    ]))
    if (!result.instrumentName && /\u538b\u529b\u8868/.test(normalized)) {
      result.instrumentName = '\u538b\u529b\u8868'
    }
    result.modelSpec = this.cleanupLineValue(this.firstMatch(normalized, [
      /(?:\u578b\u53f7\u89c4\u683c|\u89c4\u683c\u578b\u53f7|\u578b\u53f7|\u89c4\u683c)[:\s]*([^\n]+)/i,
      this.getPressureRangePattern()
    ]))
    result.modelSpec = this.normalizeModelSpec(result.modelSpec, normalized)
    result.factoryNo = this.firstMatch(normalized, [
      /(?:\u51fa\u5382\u7f16\u53f7|\u7f16\u53f7|\u8868\u53f7)[:\s]*([A-Za-z0-9\-\/]{3,})/i
    ])
    result.manufacturer = this.cleanupLineValue(this.firstMatch(normalized, [
      /(?:\u5236\u9020\u5355\u4f4d|\u751f\u4ea7\u5382\u5bb6|\u5236\u9020\u5382|\u5382\u5bb6)[:\s]*([^\n]+)/i
    ]))
    result.verificationStd = this.normalizeStd(this.firstMatch(normalized, [
      /(JJG\s*[\d-]+)/i
    ]))
    result.conclusion = this.extractConclusion(normalized)
    result.verificationDate = this.extractDate(normalized)

    return result
  }

  firstMatch(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) return match[1].trim()
    }
    return ''
  }

  cleanupLineValue(value) {
    if (!value) return ''
    return String(value).split('\n')[0].trim()
  }

  normalizeModelSpec(value, fullText) {
    const cleaned = this.cleanupLineValue(value)
    if (cleaned && !this.isOnlyFieldLabel(cleaned)) {
      const pressure = this.extractPressureRange(cleaned)
      return pressure || cleaned
    }
    return this.extractPressureRange(fullText)
  }

  isOnlyFieldLabel(value) {
    const text = String(value || '').replace(/\s+/g, '').replace(/[/:：/／]+/g, '')
    return !text || ['型号', '规格', '型号规格', '规格型号'].includes(text)
  }

  getPressureRangePattern() {
    return /([\(（]?\s*\d+(?:\.\d+)?\s*(?:-|~|－|—|–|一|至|到)\s*\d+(?:\.\d+)?\s*[\)）]?\s*(?:k|M|G)?\s*P\s*a)/i
  }

  extractPressureRange(text) {
    const pressure = this.firstMatch(text, [this.getPressureRangePattern()])
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

  normalizeStd(value) {
    if (!value) return ''
    return String(value).replace(/\s+/g, '').replace(/^JJG/i, 'JJG')
  }

  extractConclusion(text) {
    if (/\u4e0d\u5408\u683c/.test(text)) return '\u4e0d\u5408\u683c'
    if (/\u5408\u683c|\u7b26\u5408/.test(text)) return '\u5408\u683c'
    return ''
  }

  extractDate(text) {
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
    const match = text.match(/(\d{4})\s*(?:年|[.\-/])\s*(\d{1,2})\s*(?:月|[.\-/])\s*(\d{1,2})\s*(?:日)?/)
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

  async deleteTempFile(fileID) {
    return new Promise((resolve) => {
      wx.cloud.deleteFile({
        fileList: [fileID],
        complete: resolve
      })
    })
  }
}

module.exports = new OCRService()
