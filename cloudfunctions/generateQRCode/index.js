// 生成设备小程序码云函数
// 功能：生成带deviceId参数的小程序码，并保存到云存储中
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const { deviceId, refId, refType, page } = event
  const id = deviceId || refId
  const type = refType || 'device'

  console.log('=== 生成小程序码请求 ===')
  console.log('refType:', type)
  console.log('refId:', id)
  console.log('page:', page) // 例如: 'pages/device-detail/device-detail'

  if (!id) {
    return { success: false, error: '缺少 deviceId/refId 参数' }
  }

  try {
    // 1. 调用微信接口生成小程序码 (scene参数最大32个可见字符，这里直接用deviceId)
    // 注意：deviceId通常为uuid或类似较长字符串，如果超过32位需要做映射
    // 假设 _id 是系统生成的较短ID，直接使用
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: id, 
      page: page || 'pages/device-detail/device-detail',
      width: 430,
      autoColor: false,
      lineColor: { "r": 0, "g": 0, "b": 0 },
      isHyaline: false,
      checkPath: false // 关键修复：允许生成未发布页面的小程序码
    })

    if (result.errCode) {
      console.error('生成小程序码失败:', result)
      return { success: false, error: result.errMsg }
    }

    // 2. 上传图片到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: `${type}-qr/${id}_${Date.now()}.png`,
      fileContent: result.buffer,
    })

    console.log('小程序码上传成功:', uploadResult.fileID)

    // 3. 将二维码fileID回写到记录中，避免重复生成
    const db = cloud.database()
    const target = type === 'equipment' ? 'equipments' : 'devices'
    await db.collection(target).doc(id).update({
      data: {
        qrCodeImage: uploadResult.fileID,
        updateTime: new Date().toLocaleString()
      }
    })

    return {
      success: true,
      fileID: uploadResult.fileID
    }

  } catch (err) {
    console.error('云函数执行异常:', err)
    return { success: false, error: err.message }
  }
}
