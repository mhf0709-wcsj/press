// cloudfunctions/baiduOcr/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const axios = require('axios')

// 百度API密钥
const BAIDU_API_KEY = 'WmCgS01d2nXXDUqHpSbCt7oI'
const BAIDU_SECRET_KEY = 'h0tasZ8UmcFJb06RdWQdi0lzBHGROrSx'

// 缓存Token
let cachedToken = null
let tokenExpireTime = 0

exports.main = async (event) => {
  const { fileID } = event
  
  if (!fileID) {
    return { success: false, error: '缺少图片参数' }
  }

  try {
    // 1. 从云存储下载图片
    const fileRes = await cloud.downloadFile({ fileID })
    const buffer = fileRes.fileContent
    console.log('图片大小:', buffer.length, 'bytes')
    
    // 2. 转Base64
    const imageBase64 = buffer.toString('base64')
    
    // 3. 获取Token（使用缓存）
    const accessToken = await getAccessToken()
    
    // 4. 尝试多种OCR API，选择最佳结果
    let ocrResult = null
    let apiUsed = ''
    
    // 优先使用高精度含位置版（识别率最高）
    try {
      ocrResult = await callBaiduOcr(accessToken, imageBase64, 'accurate')
      apiUsed = 'accurate'
      console.log('高精度OCR(含位置)识别:', ocrResult.words_result_num, '行')
    } catch (err) {
      console.log('高精度OCR失败:', err.message)
      // 备用：通用高精度版
      try {
        ocrResult = await callBaiduOcr(accessToken, imageBase64, 'accurate_basic')
        apiUsed = 'accurate_basic'
        console.log('高精度基础版识别:', ocrResult.words_result_num, '行')
      } catch (err2) {
        console.log('高精度基础版失败:', err2.message)
        // 最后尝试通用版
        ocrResult = await callBaiduOcr(accessToken, imageBase64, 'general_basic')
        apiUsed = 'general_basic'
        console.log('通用版识别:', ocrResult.words_result_num, '行')
      }
    }
    
    // 5. 处理识别结果
    if (ocrResult && ocrResult.words_result && ocrResult.words_result.length > 0) {
      // 提取文字和位置信息，过滤低置信度结果
      const lines = ocrResult.words_result
        .filter(item => {
          // 如果有置信度信息，过滤低于0.5的结果
          if (item.probability && item.probability.average < 0.5) {
            console.log('过滤低置信度:', item.words, item.probability.average)
            return false
          }
          return true
        })
        .map(item => ({
          text: item.words,
          location: item.location || null,
          probability: item.probability ? item.probability.average : null
        }))
      
      const fullText = lines.map(l => l.text).join('\n')
      
      return { 
        success: true, 
        text: fullText,
        lines: lines,
        total: lines.length,
        apiUsed: apiUsed
      }
    } else {
      return { success: false, error: '未识别到有效文字' }
    }
  } catch (err) {
    console.error('OCR失败:', err.message, err.stack)
    return { 
      success: false, 
      error: err.message || '识别服务异常',
      detail: err.toString()
    }
  }
}

// 获取AccessToken（带缓存）
async function getAccessToken() {
  // 检查缓存是否有效
  if (cachedToken && Date.now() < tokenExpireTime) {
    return cachedToken
  }
  
  const tokenRes = await axios.post(
    'https://aip.baidubce.com/oauth/2.0/token',
    null,
    {
      params: {
        grant_type: 'client_credentials',
        client_id: BAIDU_API_KEY,
        client_secret: BAIDU_SECRET_KEY
      },
      timeout: 10000
    }
  )
  
  if (!tokenRes.data.access_token) {
    throw new Error('获取Token失败')
  }
  
  // 缓存Token（提前1小时过期）
  cachedToken = tokenRes.data.access_token
  tokenExpireTime = Date.now() + (tokenRes.data.expires_in - 3600) * 1000
  
  return cachedToken
}

// 调用百度OCR（优化参数提升中文识别率）
async function callBaiduOcr(accessToken, imageBase64, apiType) {
  const apiUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/${apiType}`
  
  const params = new URLSearchParams()
  params.append('image', imageBase64)
  params.append('access_token', accessToken)
  
  // ===== 关键优化参数 =====
  // 指定识别语言为中英文混合（提升中文识别率）
  params.append('language_type', 'CHN_ENG')
  // 检测图片方向（防止倒置图片识别错误）
  params.append('detect_direction', 'true')
  // 返回置信度（用于过滤低质量结果）
  params.append('probability', 'true')
  // 开启段落检测（提升整段文字识别）
  params.append('paragraph', 'true')
  
  const response = await axios.post(apiUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000  // 增加超时时间
  })
  
  if (response.data.error_code) {
    throw new Error(response.data.error_msg)
  }
  
  return response.data
}
