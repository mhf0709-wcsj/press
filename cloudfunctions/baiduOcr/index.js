const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BAIDU_API_KEY = process.env.BAIDU_API_KEY || ''
const BAIDU_SECRET_KEY = process.env.BAIDU_SECRET_KEY || ''

let cachedToken = null
let tokenExpireTime = 0

exports.main = async (event) => {
  const { fileID } = event || {}

  if (!fileID) {
    return { success: false, error: '缺少图片参数' }
  }

  try {
    const fileRes = await cloud.downloadFile({ fileID })
    const buffer = fileRes.fileContent
    const imageBase64 = buffer.toString('base64')
    const accessToken = await getAccessToken()

    let ocrResult = null
    let apiUsed = ''

    try {
      ocrResult = await callBaiduOcr(accessToken, imageBase64, 'accurate_basic')
      apiUsed = 'accurate_basic'
    } catch (error) {
      try {
        ocrResult = await callBaiduOcr(accessToken, imageBase64, 'general_basic')
        apiUsed = 'general_basic'
      } catch (fallbackError) {
        ocrResult = await callBaiduOcr(accessToken, imageBase64, 'accurate')
        apiUsed = 'accurate'
      }
    }

    if (!ocrResult || !ocrResult.words_result || !ocrResult.words_result.length) {
      return { success: false, error: '未识别到有效文字' }
    }

    const lines = ocrResult.words_result
      .filter((item) => {
        if (item.probability && item.probability.average < 0.5) {
          return false
        }
        return true
      })
      .map((item) => ({
        text: item.words,
        location: item.location || null,
        probability: item.probability ? item.probability.average : null
      }))

    return {
      success: true,
      text: lines.map((line) => line.text).join('\n'),
      lines,
      total: lines.length,
      apiUsed
    }
  } catch (error) {
    console.error('Baidu OCR failed:', error)
    return {
      success: false,
      error: error.message || '识别服务异常',
      detail: String(error)
    }
  }
}

async function getAccessToken() {
  if (!BAIDU_API_KEY || !BAIDU_SECRET_KEY) {
    throw new Error('BAIDU_API_KEY / BAIDU_SECRET_KEY not configured')
  }

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
    throw new Error('获取百度 OCR Token 失败')
  }

  cachedToken = tokenRes.data.access_token
  tokenExpireTime = Date.now() + (tokenRes.data.expires_in - 3600) * 1000

  return cachedToken
}

async function callBaiduOcr(accessToken, imageBase64, apiType) {
  const apiUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/${apiType}`
  const params = new URLSearchParams()

  params.append('image', imageBase64)
  params.append('access_token', accessToken)
  params.append('detect_direction', 'true')
  params.append('probability', 'true')

  if (apiType === 'general_basic' || apiType === 'general') {
    params.append('language_type', 'CHN_ENG')
  }

  if (apiType === 'general_basic' || apiType === 'accurate_basic') {
    params.append('paragraph', 'true')
  }

  const response = await axios.post(apiUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000
  })

  if (response.data.error_code) {
    throw new Error(response.data.error_msg || `API Error: ${response.data.error_code}`)
  }

  return response.data
}
