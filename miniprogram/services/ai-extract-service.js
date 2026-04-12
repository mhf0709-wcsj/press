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

    return {
      ...extractResult,
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
    const maxSide = 1600
    const options = { quality: 72 }

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
        data: { fileID },
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
