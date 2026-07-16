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

  async chooseImages(options = {}) {
    const { count = 9, sourceType = ['album', 'camera'] } = options
    await this.ensurePrivacyAuthorized()

    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count: Math.min(9, Math.max(1, Number(count || 9))),
        mediaType: ['image'],
        sourceType,
        success: (res) => {
          const paths = (res?.tempFiles || []).map((item) => item.tempFilePath).filter(Boolean)
          if (paths.length) {
            resolve(paths)
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

      const maxSide = 2400
      const options = { quality: 85 }

      if (imageInfo.width > maxSide || imageInfo.height > maxSide) {
        if (imageInfo.width >= imageInfo.height) {
          options.compressedWidth = maxSide
        } else {
          options.compressedWidth = Math.round(imageInfo.width * (maxSide / imageInfo.height))
        }
      }

      const compressedPath = imageInfo.width <= maxSide && imageInfo.height <= maxSide
        ? imagePath
        : await this.compressImage(imagePath, options)
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
        data: { fileID, adminToken: wx.getStorageSync('adminUser')?.token || '' },
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
    const normalized = this.normalizeOcrText(text)

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
      /(?:\u51fa\u5382\u7f16\u53f7|\u51fa\u5382\u53f7|\u5668\u53f7|\u8868\u53f7)[:\s]*([A-Za-z0-9\-\/]{3,})/i
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
    const cleaned = String(value)
      .split(/\n/)[0]
      .split(/(?:证书编号|出厂编号|型号规格|规格型号|制造单位|检定依据|检定结论|检定日期|有效期至)/)[0]
      .trim()
    return this.isOnlyFieldLabel(cleaned) ? '' : cleaned
  }

  normalizeOcrText(text) {
    let normalized = String(text || '')
      .replace(/\r/g, '\n')
      .replace(/：/g, ':')
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/[ \t]+/g, ' ')

    const labels = [
      [/证\s*书\s*编\s*号/g, '证书编号'],
      [/送\s*检\s*单\s*位/g, '送检单位'],
      [/委\s*托\s*单\s*位/g, '委托单位'],
      [/使\s*用\s*单\s*位/g, '使用单位'],
      [/计\s*量\s*器\s*具\s*名\s*称/g, '计量器具名称'],
      [/器\s*具\s*名\s*称/g, '器具名称'],
      [/仪\s*表\s*名\s*称/g, '仪表名称'],
      [/型\s*号\s*[\/／]?\s*规\s*格/g, '型号/规格'],
      [/规\s*格\s*型\s*号/g, '规格型号'],
      [/制\s*造\s*单\s*位/g, '制造单位'],
      [/出\s*厂\s*编\s*号/g, '出厂编号'],
      [/检\s*定\s*依\s*据/g, '检定依据'],
      [/检\s*定\s*结\s*论/g, '检定结论'],
      [/检\s*定\s*日\s*期/g, '检定日期'],
      [/有\s*效\s*期\s*至/g, '有效期至']
    ]
    labels.forEach(([pattern, label]) => {
      normalized = normalized.replace(pattern, label)
    })

    for (let i = 0; i < 4; i += 1) {
      normalized = normalized.replace(/([\u4e00-\u9fa5])[ \t]+(?=[\u4e00-\u9fa5])/g, '$1')
    }

    return normalized
      .replace(/([\u4e00-\u9fa5])\s*\/\s*([\u4e00-\u9fa5])/g, '$1/$2')
      .replace(/([\u4e00-\u9fa5])\s*:\s*/g, '$1:')
      .replace(/\(\s*/g, '(')
      .replace(/\s*\)/g, ')')
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
