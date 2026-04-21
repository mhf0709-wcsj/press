/**
 * 旧版前端直连 OCR 工具已停用。
 * 正式版统一通过云函数 `baiduOcr` 处理，避免在小程序包内暴露密钥。
 */

function getAccessToken() {
  return Promise.resolve('cloud_managed_ocr')
}

function baiduOCR() {
  return Promise.reject(new Error('Client-side OCR disabled. Please use cloud function baiduOcr.'))
}

module.exports = {
  getAccessToken,
  baiduOCR
}
