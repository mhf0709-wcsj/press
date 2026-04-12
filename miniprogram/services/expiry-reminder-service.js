/**
 * 到期提醒服务模块
 * 负责检查和发送到期提醒
 */

const { formatDate } = require('../utils/helpers/date')

/**
 * 到期提醒服务类
 */
class ExpiryReminderService {
  /**
   * 检查到期提醒
   * @param {string} enterpriseName 企业名称
   * @param {number} days 提前天数
   * @returns {Promise<Object>} 提醒数据
   */
  async checkExpiryReminder(enterpriseName, days = 30) {
    if (!enterpriseName) {
      return null
    }

    const today = formatDate(new Date())
    const lastReminderDate = wx.getStorageSync('lastReminderDate')
    
    if (lastReminderDate === today) {
      console.log('今日已提醒过，跳过')
      return null
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'expiryReminder',
        data: {
          action: 'getEnterpriseExpiring',
          enterpriseName,
          days
        }
      })

      if (res.result.success) {
        const { expired, expiring, totalCount } = res.result.data
        
        if (totalCount > 0) {
          return {
            expiredCount: expired.length,
            expiringCount: expiring.length,
            totalCount,
            expiredList: expired.slice(0, 5),
            expiringList: expiring.slice(0, 5)
          }
        }
      }
      
      return null
    } catch (err) {
      console.error('查询到期提醒失败:', err)
      return null
    }
  }

  /**
   * 标记今日已提醒
   */
  markTodayReminded() {
    const today = formatDate(new Date())
    wx.setStorageSync('lastReminderDate', today)
  }

  /**
   * 获取所有到期记录（管理员用）
   * @param {number} days 提前天数
   * @param {string} district 辖区
   * @returns {Promise<Object>} 到期数据
   */
  async getAllExpiring(days = 30, district = null) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'expiryReminder',
        data: {
          action: 'getAllExpiring',
          days,
          district
        }
      })

      return res.result
    } catch (err) {
      console.error('获取所有到期记录失败:', err)
      throw err
    }
  }

  /**
   * 获取到期汇总统计（管理员用）
   * @param {number} days 提前天数
   * @param {string} district 辖区
   * @returns {Promise<Object>} 汇总数据
   */
  async getExpiringSummary(days = 30, district = null) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'expiryReminder',
        data: {
          action: 'getExpiringSummary',
          days,
          district
        }
      })

      return res.result
    } catch (err) {
      console.error('获取到期汇总失败:', err)
      throw err
    }
  }

  /**
   * 发送微信订阅消息
   * @param {Object} options 发送选项
   * @returns {Promise<Object>} 发送结果
   */
  async sendWxSubscribeMessage(options) {
    const { touser, templateId, page, data } = options

    try {
      const res = await wx.cloud.callFunction({
        name: 'expiryReminder',
        data: {
          action: 'sendWxSubscribeMessage',
          touser,
          templateId,
          page,
          data
        }
      })

      return res.result
    } catch (err) {
      console.error('发送订阅消息失败:', err)
      throw err
    }
  }

  /**
   * 批量发送提醒
   * @param {Array} users 用户列表
   * @param {string} templateId 模板ID
   * @param {string} message 消息内容
   * @returns {Promise<Object>} 发送结果
   */
  async batchSendReminder(users, templateId, message) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'expiryReminder',
        data: {
          action: 'batchSendReminder',
          users,
          templateId,
          message
        }
      })

      return res.result
    } catch (err) {
      console.error('批量发送提醒失败:', err)
      throw err
    }
  }

  /**
   * 请求订阅消息授权
   * @param {Array} templateIds 模板ID列表
   * @returns {Promise<Object>} 授权结果
   */
  async requestSubscribeMessage(templateIds) {
    return new Promise((resolve, reject) => {
      wx.requestSubscribeMessage({
        tmplIds: templateIds,
        success: (res) => {
          console.log('订阅消息授权结果:', res)
          resolve(res)
        },
        fail: (err) => {
          console.log('订阅消息授权失败:', err)
          reject(err)
        }
      })
    })
  }

  /**
   * 保存订阅状态
   * @param {string} enterpriseId 企业ID
   * @param {boolean} subscribed 是否订阅
   * @returns {Promise<void>}
   */
  async saveSubscribeStatus(enterpriseId, subscribed) {
    const db = wx.cloud.database()
    
    try {
      await db.collection('enterprises').doc(enterpriseId).update({
        data: {
          subscribeMessage: subscribed,
          subscribeTime: new Date().toISOString()
        }
      })
    } catch (err) {
      console.error('保存订阅状态失败:', err)
    }
  }
}

module.exports = new ExpiryReminderService()
