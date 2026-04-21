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
      /([\(\uff08]?\d+(?:\.\d+)?\s*(?:-|~)\s*\d+(?:\.\d+)?[\)\uff09]?\s*(?:k|M|G)?Pa)/i
    ]))
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
    const match = text.match(/(\d{4})[.\-/\u5e74]\s*(\d{1,2})[.\-/\u6708]\s*(\d{1,2})/)
    if (!match) return ''
    return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
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
