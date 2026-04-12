/**
 * OCR识别服务模块
 * 负责图片处理、OCR识别和结果解析
 */

const baiduOCRUtil = require('../pages/utils/baiduOCR')

/**
 * OCR服务类
 */
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
          reject(new Error(error?.errMsg || '未完成隐私授权'))
        }
      })
    })
  }

  /**
   * 初始化OCR服务
   * @returns {Promise<void>}
   */
  async init() {
    return new Promise((resolve, reject) => {
      wx.showLoading({ title: 'AI能力准备中...' })
      
      wx.getStorage({
        key: 'baidu_access_token',
        success: (res) => {
          const { token, expireTime } = res.data
          if (Date.now() < expireTime) {
            this.accessToken = token
            console.log('✓ 使用缓存token')
            wx.hideLoading()
            resolve()
          } else {
            console.log('⚠ 缓存token已过期，重新获取')
            this.refreshToken().then(resolve).catch(reject)
          }
        },
        fail: () => {
          console.log('⚠ 无缓存token，首次获取')
          this.refreshToken().then(resolve).catch(reject)
        }
      })
    })
  }

  /**
   * 刷新Token
   * @returns {Promise<void>}
   */
  async refreshToken() {
    return new Promise((resolve, reject) => {
      baiduOCRUtil.getAccessToken()
        .then(token => {
          const expireTime = Date.now() + 25 * 24 * 60 * 60 * 1000
          wx.setStorage({
            key: 'baidu_access_token',
            data: { token, expireTime },
            success: () => {
              this.accessToken = token
              wx.hideLoading()
              console.log('✓ Token获取成功')
              resolve()
            }
          })
        })
        .catch(err => {
          wx.hideLoading()
          console.error('✗ Token获取失败:', err)
          wx.showToast({ title: 'AI能力初始化失败', icon: 'none' })
          reject(err)
        })
    })
  }

  /**
   * 选择图片
   * @param {Object} options 选项
   * @returns {Promise<string>} 图片临时路径
   */
  async chooseImage(options = {}) {
    const { count = 1, sourceType = ['album', 'camera'] } = options

    await this.ensurePrivacyAuthorized()

    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType,
        success: (res) => {
          resolve(res.tempFiles[0].tempFilePath)
        },
        fail: reject
      })
    })
  }

  /**
   * 压缩图片
   * @param {string} imagePath 图片路径
   * @param {Object} options 压缩选项
   * @returns {Promise<string>} 压缩后的图片路径
   */
  async compressImage(imagePath, options = {}) {
    const { quality = 80, compressedWidth = 2000 } = options
    
    return new Promise((resolve, reject) => {
      wx.compressImage({
        src: imagePath,
        quality,
        compressedWidth,
        success: (res) => {
          console.log('图片压缩成功')
          resolve(res.tempFilePath)
        },
        fail: (err) => {
          console.log('压缩失败，使用原图')
          resolve(imagePath)
        }
      })
    })
  }

  /**
   * 上传图片到云存储
   * @param {string} filePath 本地文件路径
   * @param {string} cloudPath 云存储路径
   * @returns {Promise<string>} 文件ID
   */
  async uploadImage(filePath, cloudPath) {
    return new Promise((resolve, reject) => {
      console.log('开始上传图片:', filePath)
      
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: (res) => {
          console.log('图片上传成功:', res.fileID)
          resolve(res.fileID)
        },
        fail: reject
      })
    })
  }

  /**
   * 执行OCR识别
   * @param {string} imagePath 图片路径
   * @returns {Promise<Object>} OCR识别结果
   */
  async performOCR(imagePath) {
    wx.showLoading({ title: 'AI分析中...' })
    
    try {
      // 1. 获取图片信息，检查是否需要调整尺寸
      const imageInfo = await new Promise((resolve, reject) => {
        wx.getImageInfo({ src: imagePath, success: resolve, fail: reject })
      });
      console.log('原始图片信息:', imageInfo.width, 'x', imageInfo.height);

      // 2. 智能压缩：确保图片在百度OCR限制范围内 (15px < side < 4096px，且Base64编码后<4MB)
      // 为保证不超过 4M，将长边限制在 1600 左右，质量设置为 70
      let compressOptions = { quality: 70 };
      
      const MAX_SIDE = 1600;
      let targetWidth = imageInfo.width;
      
      // 只有当尺寸超过限制时才缩小，绝不放大，防止画质损坏或长宽比失调
      if (imageInfo.width > MAX_SIDE || imageInfo.height > MAX_SIDE) {
        if (imageInfo.width >= imageInfo.height) {
          targetWidth = MAX_SIDE;
        } else {
          // 如果是竖图，根据比例计算宽度
          targetWidth = Math.round(imageInfo.width * (MAX_SIDE / imageInfo.height));
        }
        compressOptions.compressedWidth = targetWidth;
      }
      
      console.log('图片压缩参数:', compressOptions);
      const compressedPath = await this.compressImage(imagePath, compressOptions)
      
      const cloudPath = `ocr-temp/enterprise_${Date.now()}.jpg`
      const fileID = await this.uploadImage(compressedPath, cloudPath)
      
      // 3. 调用高精度OCR云函数
      const result = await this.callOCRFunction(fileID)
      
      // 4. 清理临时文件
      await this.deleteTempFile(fileID)
      
      return result
    } catch (error) {
      wx.hideLoading()
      // 针对常见的图片尺寸错误进行友好提示
      if (error.message && error.message.includes('image size error')) {
        throw new Error('图片尺寸不合适，请重新拍摄一张清晰的近景照片')
      }
      throw error
    }
  }

  /**
   * 调用OCR云函数
   * @param {string} fileID 文件ID
   * @returns {Promise<Object>} 识别结果
   */
  async callOCRFunction(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'baiduOcr',
        data: { fileID },
        success: (res) => {
          wx.hideLoading()
          
          if (res.result && res.result.success && res.result.text) {
            const ocrData = this.parseOcrText(res.result.text)
            resolve(ocrData)
          } else {
            reject(new Error(res.result?.error || 'AI分析失败'))
          }
        },
        fail: (err) => {
          wx.hideLoading()
          reject(new Error(err.errMsg || 'AI服务调用失败'))
        }
      })
    })
  }

  /**
   * 解析OCR文本提取字段（针对压力表检定证书深度优化）
   * @param {string} text OCR识别文本
   * @returns {Object} 解析后的数据
   */
  parseOcrText(text) {
    const result = {};
    // 预处理文本：去除所有多余空格，统一标点，但保留换行符用于行逻辑
    const cleanText = text.replace(/[：:]/g, ':').replace(/[ \t]+/g, ' ');
    const lines = cleanText.split('\n');
    
    console.log('--- 开始深度解析OCR文本 ---');
    
    // 1. 证书编号解析 (通常在顶部，格式固定)
    const certNoRegex = /(?:证书编号|NO|No|№|编号)[:\s]*([A-Z0-9-]{6,})/i;
    const certNoMatch = cleanText.match(certNoRegex);
    if (certNoMatch) {
      result.certNo = certNoMatch[1].trim();
    } else {
      // 备选方案：查找纯大写字母+数字的组合
      const fallbackCert = cleanText.match(/([A-Z]{1,3}\d{6,})/i);
      if (fallbackCert) result.certNo = fallbackCert[1].trim();
    }

    // 2. 出厂编号解析 (压力表核心标识)
    // 考虑 OCR 常见的错误：出厂编号 -> 出 厂 编 号, 厂 编 号
    const factoryNoRegex = /(?:出\s*厂\s*编\s*号|厂\s*编\s*号|机\s*身\s*号)[:\s]*([A-Z0-9\-\/]+)/i;
    const factoryNoMatch = cleanText.match(factoryNoRegex);
    if (factoryNoMatch) {
      result.factoryNo = factoryNoMatch[1].trim().replace(/^[:\s]+/, '');
    }

    // 3. 送检单位 (委托单位)
    const sendUnitRegex = /(?:送\s*检\s*单\s*位|委\s*托\s*单\s*位|用\s*户\s*名\s*称)[:\s]*([^\n]+)/;
    const sendUnitMatch = cleanText.match(sendUnitRegex);
    if (sendUnitMatch) {
      let unit = sendUnitMatch[1].trim();
      // 过滤掉可能误入的后续标签
      unit = unit.split(/(?:计量|型号|器具|地址)/)[0].trim();
      result.sendUnit = unit;
    }

    // 4. 器具名称
    const instrumentRegex = /(?:计\s*量\s*器\s*具\s*名\s*称|器\s*具\s*名\s*称|仪\s*表\s*名\s*称)[:\s]*([^\n]+)/;
    const instrumentMatch = cleanText.match(instrumentRegex);
    if (instrumentMatch) {
      let name = instrumentMatch[1].trim();
      name = name.split(/(?:型号|规格|编号)/)[0].trim();
      result.instrumentName = name;
    } else {
      // 关键字启发式搜索
      if (cleanText.includes('耐震压力表')) result.instrumentName = '耐震压力表';
      else if (cleanText.includes('数字压力表')) result.instrumentName = '数字压力表';
      else if (cleanText.includes('压力表')) result.instrumentName = '压力表';
      else if (cleanText.includes('压力变送器')) result.instrumentName = '压力变送器';
    }

    // 5. 型号规格
    const modelRegex = /(?:型\s*号[\s\/]*规\s*格|规\s*格\s*型\s*号|型\s*号|规\s*格)[:\s]*([^\n]+)/;
    const modelMatch = cleanText.match(modelRegex);
    if (modelMatch) {
      let spec = modelMatch[1].trim();
      spec = spec.split(/(?:制造|生产|编号)/)[0].trim();
      result.modelSpec = spec;
    } else {
      // 尝试匹配压力表常见的规格描述 (如 0-1.6MPa, (0-10)MPa)
      const specPattern = /([\(（]?[\d\.\-~～]+[\)）]?\s*[kMG]?[Pp]a)/i;
      const specMatch = cleanText.match(specPattern);
      if (specMatch) result.modelSpec = specMatch[1].trim();
    }

    // 6. 制造单位
    const manuRegex = /(?:制\s*造\s*单\s*位|生\s*产\s*厂\s*家|制\s*造\s*厂)[:\s]*([^\n]+)/;
    const manuMatch = cleanText.match(manuRegex);
    if (manuMatch) {
      let manu = manuMatch[1].trim();
      manu = manu.split(/(?:出厂|地址|编号)/)[0].trim();
      result.manufacturer = manu;
    }

    // 7. 检定依据
    const stdRegex = /(?:检\s*定\s*依\s*据|技\s*术\s*依\s*据)[:\s]*(JJG\s*[\d\-\s]+)/i;
    const stdMatch = cleanText.match(stdRegex);
    if (stdMatch) {
      result.verificationStd = stdMatch[1].replace(/\s+/g, '').replace(/JJG/i, 'JJG ').trim();
    }

    // 8. 检定结论 (最重要结果)
    if (cleanText.includes('不合格')) {
      result.conclusion = '不合格';
    } else if (cleanText.match(/合格|符合|准用/)) {
      result.conclusion = '合格';
    }

    // 9. 日期解析 (深度容错)
    // 格式 A: 2023年05月20日
    const dateRegexA = /(?:检\s*定\s*日\s*期|日期)[:\s]*(\d{4})\s*[年\-\.\/]\s*(\d{1,2})\s*[月\-\.\/]\s*(\d{1,2})\s*日?/i;
    // 格式 B: 2023-05-20
    const dateRegexB = /(\d{4})[\-\.\/](\d{1,2})[\-\.\/](\d{1,2})/;
    
    const dateMatch = cleanText.match(dateRegexA) || cleanText.match(dateRegexB);
    if (dateMatch) {
      const year = dateMatch[1];
      const month = dateMatch[2].padStart(2, '0');
      const day = dateMatch[3].padStart(2, '0');
      result.verificationDate = `${year}-${month}-${day}`;
    }

    // 10. 有效期解析
    const expiryRegex = /(?:有\s*效\s*期\s*至|有效日期)[:\s]*(\d{4})\s*[年\-\.\/]\s*(\d{1,2})\s*[月\-\.\/]\s*(\d{1,2})\s*日?/i;
    const expiryMatch = cleanText.match(expiryRegex);
    if (expiryMatch) {
      result.expiryDate = `${expiryMatch[1]}-${expiryMatch[2].padStart(2, '0')}-${expiryMatch[3].padStart(2, '0')}`;
    }

    console.log('--- 深度解析完成 ---', result);
    return result;
  }

  /**
   * 删除临时文件
   * @param {string} fileID 文件ID
   */
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
