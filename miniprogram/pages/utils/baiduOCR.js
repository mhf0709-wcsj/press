/**
 * 百度OCR通用文字识别（高精度版）
 * 免费额度：50,000次/天
 */

// ========== 重要：替换为你的API密钥 ==========
const BAIDU_API_KEY = 'WmCgS01d2nXXDUqHpSbCt7oI'     // ← 替换这里！
const BAIDU_SECRET_KEY = 'h0tasZ8UmcFJb06RdWQdi0lzBHGROrSx' // ← 替换这里！

/**
 * 获取Access Token（有效期30天）
 */
function getAccessToken() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://aip.baidubce.com/oauth/2.0/token',
      method: 'POST',
      data: {
        grant_type: 'client_credentials',
        client_id: BAIDU_API_KEY,
        client_secret: BAIDU_SECRET_KEY
      },
      header: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      success: (res) => {
        if (res.data.access_token) {
          console.log('✓ Token获取成功')
          resolve(res.data.access_token)
        } else {
          console.error('✗ Token获取失败:', res.data)
          reject('获取token失败：' + (res.data.error_description || '未知错误'))
        }
      },
      fail: (err) => {
        console.error('✗ 网络请求失败:', err)
        reject('网络错误，请检查网络连接')
      }
    })
  })
}

/**
 * 调用百度OCR识别
 * @param {string} imagePath - 本地图片路径
 * @param {string} accessToken - Access Token
 */
function baiduOCR(imagePath, accessToken) {
  return new Promise((resolve, reject) => {
    // 1. 读取本地图片转Base64
    wx.getFileSystemManager().readFile({
      filePath: imagePath,
      encoding: 'base64',
      success: (res) => {
        const base64Image = res.data
        
        // 2. 调用百度OCR API
        wx.request({
          url: 'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic',
          method: 'POST',
          data: `image=${encodeURIComponent(base64Image)}&access_token=${accessToken}`,
          header: {
            'content-type': 'application/x-www-form-urlencoded'
          },
          success: (ocrRes) => {
            console.log('OCR原始响应:', ocrRes.data)
            
            if (ocrRes.data.error_code) {
              const errorMsg = ocrRes.data.error_msg || '识别失败'
              console.error('✗ OCR错误:', errorMsg)
              reject('OCR识别失败：' + errorMsg)
              return
            }
            
            if (ocrRes.data.words_result && ocrRes.data.words_result.length > 0) {
              // 合并识别文本
              const fullText = ocrRes.data.words_result
                .map(item => item.words)
                .join('\n')
              
              console.log('✓ OCR识别成功，识别到', ocrRes.data.words_result_num, '行文字')
              
              resolve({
                success: true,
                text: fullText,
                confidence: 0.9, // 百度OCR高精度版，置信度较高
                items: ocrRes.data.words_result,
                total: ocrRes.data.words_result_num
              })
            } else {
              reject('未识别到有效文字，请重新拍摄')
            }
          },
          fail: (err) => {
            console.error('✗ OCR请求失败:', err)
            reject('网络错误，请重试')
          }
        })
      },
      fail: (err) => {
        console.error('✗ 图片读取失败:', err)
        reject('图片读取失败，请重新拍摄')
      }
    })
  })
}

// 导出函数
module.exports = {
  getAccessToken: getAccessToken,
  baiduOCR: baiduOCR
}