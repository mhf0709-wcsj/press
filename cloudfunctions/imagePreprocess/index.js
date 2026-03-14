const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const Jimp = require('jimp')

exports.main = async (event) => {
  try {
    // 1. 解码Base64
    const buffer = Buffer.from(event.imageBase64, 'base64')
    
    // 2. 使用Jimp处理图像
    const image = await Jimp.read(buffer)
    
    // 3. 优化处理
    image
      .greyscale()         // 转灰度
      .contrast(0.2)      // 增强对比度
      .threshold(0.3)     // 二值化
      .resize(event.targetWidth, Jimp.AUTO) // 优化尺寸
    
    // 4. 返回处理后图片
    return {
      success: true,
      processedImageBase64: image.bitmap.data.toString('base64')
    }
  } catch (err) {
    console.error('图像预处理失败:', err)
    return { success: false, error: err.message }
  }
}