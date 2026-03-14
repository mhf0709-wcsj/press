const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 检查是否已存在admin账号
    const checkResult = await db.collection('admins').where({
      username: 'admin'
    }).get()
    
    if (checkResult.data && checkResult.data.length > 0) {
      return {
        success: true,
        message: 'admin账号已存在',
        data: checkResult.data[0]
      }
    }
    
    // 创建admin账号
    const createResult = await db.collection('admins').add({
      data: {
        username: 'admin',
        password: 'admin123',
        role: 'admin',
        createTime: new Date(),
        updateTime: new Date()
      }
    })
    
    return {
      success: true,
      message: 'admin账号创建成功',
      data: {
        _id: createResult._id,
        username: 'admin',
        password: 'admin123',
        role: 'admin'
      }
    }
  } catch (err) {
    // 如果集合不存在，先创建集合
    if (err.errCode === -1 || err.message.includes('collection')) {
      // 尝试创建集合并添加数据
      try {
        const createResult = await db.collection('admins').add({
          data: {
            username: 'admin',
            password: 'admin123',
            role: 'admin',
            createTime: new Date(),
            updateTime: new Date()
          }
        })
        return {
          success: true,
          message: 'admin账号创建成功',
          data: {
            _id: createResult._id,
            username: 'admin',
            password: 'admin123',
            role: 'admin'
          }
        }
      } catch (e) {
        return {
          success: false,
          message: '请先在云开发控制台创建 admins 集合',
          error: e.message
        }
      }
    }
    
    return {
      success: false,
      message: '初始化失败',
      error: err.message
    }
  }
}
