// 鐢熸垚璁惧灏忕▼搴忕爜浜戝嚱鏁?// 鍔熻兘锛氱敓鎴愬甫deviceId鍙傛暟鐨勫皬绋嬪簭鐮侊紝骞朵繚瀛樺埌浜戝瓨鍌ㄤ腑
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const debugLog = () => {}

exports.main = async (event, context) => {
  const { deviceId, refId, refType, page } = event
  const id = deviceId || refId
  const type = refType || 'device'

  debugLog('=== 鐢熸垚灏忕▼搴忕爜璇锋眰 ===')
  debugLog('refType:', type)
  debugLog('refId:', id)
  debugLog('page:', page) // 渚嬪: 'pages/device-detail/device-detail'

  if (!id) {
    return { success: false, error: '缂哄皯 deviceId/refId 鍙傛暟' }
  }

  try {
    // 1. 璋冪敤寰俊鎺ュ彛鐢熸垚灏忕▼搴忕爜 (scene鍙傛暟鏈€澶?2涓彲瑙佸瓧绗︼紝杩欓噷鐩存帴鐢╠eviceId)
    // 娉ㄦ剰锛歞eviceId閫氬父涓簎uid鎴栫被浼艰緝闀垮瓧绗︿覆锛屽鏋滆秴杩?2浣嶉渶瑕佸仛鏄犲皠
    // 鍋囪 _id 鏄郴缁熺敓鎴愮殑杈冪煭ID锛岀洿鎺ヤ娇鐢?    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: id, 
      page: page || 'pages/device-detail/device-detail',
      width: 430,
      autoColor: false,
      lineColor: { "r": 0, "g": 0, "b": 0 },
      isHyaline: false,
      checkPath: false // 鍏抽敭淇锛氬厑璁哥敓鎴愭湭鍙戝竷椤甸潰鐨勫皬绋嬪簭鐮?    })

    if (result.errCode) {
      console.error('鐢熸垚灏忕▼搴忕爜澶辫触:', result)
      return { success: false, error: result.errMsg }
    }

    // 2. 涓婁紶鍥剧墖鍒颁簯瀛樺偍
    const uploadResult = await cloud.uploadFile({
      cloudPath: `${type}-qr/${id}_${Date.now()}.png`,
      fileContent: result.buffer,
    })

    debugLog('灏忕▼搴忕爜涓婁紶鎴愬姛:', uploadResult.fileID)

    // 3. 灏嗕簩缁寸爜fileID鍥炲啓鍒拌褰曚腑锛岄伩鍏嶉噸澶嶇敓鎴?    const db = cloud.database()
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
    console.error('浜戝嚱鏁版墽琛屽紓甯?', err)
    return { success: false, error: err.message }
  }
}

