/**
 * 鍒版湡鎻愰啋鏈嶅姟妯″潡
 * 璐熻矗妫€鏌ュ拰鍙戦€佸埌鏈熸彁閱? */

const { formatDate } = require('../utils/helpers/date')
const debugLog = () => {}

/**
 * 鍒版湡鎻愰啋鏈嶅姟绫? */
class ExpiryReminderService {
  async getEnterpriseExpiryDashboard(enterpriseUser, days = 30) {
    if (!enterpriseUser || (!enterpriseUser._id && !enterpriseUser.companyName)) {
      return null
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'expiryReminder',
        data: {
          action: 'getEnterpriseExpiryDashboard',
          payload: {
            enterpriseId: enterpriseUser._id || '',
            enterpriseName: enterpriseUser.companyName || '',
            days
          }
        }
      })

      return res.result || null
    } catch (err) {
      console.error('获取企业到期看板失败:', err)
      return null
    }
  }

  /**
   * 妫€鏌ュ埌鏈熸彁閱?   * @param {string} enterpriseName 浼佷笟鍚嶇О
   * @param {number} days 鎻愬墠澶╂暟
   * @returns {Promise<Object>} 鎻愰啋鏁版嵁
   */
  async checkExpiryReminder(enterpriseName, days = 30) {
    if (!enterpriseName) {
      return null
    }

    const today = formatDate(new Date())
    const lastReminderDate = wx.getStorageSync('lastReminderDate')
    
    if (lastReminderDate === today) {
      debugLog('skip reminder for today')
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
      console.error('鏌ヨ鍒版湡鎻愰啋澶辫触:', err)
      return null
    }
  }

  /**
   * 鏍囪浠婃棩宸叉彁閱?   */
  markTodayReminded() {
    const today = formatDate(new Date())
    wx.setStorageSync('lastReminderDate', today)
  }

  /**
   * 鑾峰彇鎵€鏈夊埌鏈熻褰曪紙绠＄悊鍛樼敤锛?   * @param {number} days 鎻愬墠澶╂暟
   * @param {string} district 杈栧尯
   * @returns {Promise<Object>} 鍒版湡鏁版嵁
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
      console.error('鑾峰彇鎵€鏈夊埌鏈熻褰曞け璐?', err)
      throw err
    }
  }

  /**
   * 鑾峰彇鍒版湡姹囨€荤粺璁★紙绠＄悊鍛樼敤锛?   * @param {number} days 鎻愬墠澶╂暟
   * @param {string} district 杈栧尯
   * @returns {Promise<Object>} 姹囨€绘暟鎹?   */
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
      console.error('鑾峰彇鍒版湡姹囨€诲け璐?', err)
      throw err
    }
  }

  /**
   * 鍙戦€佸井淇¤闃呮秷鎭?   * @param {Object} options 鍙戦€侀€夐」
   * @returns {Promise<Object>} 鍙戦€佺粨鏋?   */
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
      console.error('鍙戦€佽闃呮秷鎭け璐?', err)
      throw err
    }
  }

  /**
   * 鎵归噺鍙戦€佹彁閱?   * @param {Array} users 鐢ㄦ埛鍒楄〃
   * @param {string} templateId 妯℃澘ID
   * @param {string} message 娑堟伅鍐呭
   * @returns {Promise<Object>} 鍙戦€佺粨鏋?   */
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
      console.error('鎵归噺鍙戦€佹彁閱掑け璐?', err)
      throw err
    }
  }

  async saveAlertSettings(enterpriseUser, settings = {}) {
    if (!enterpriseUser || (!enterpriseUser._id && !enterpriseUser.companyName)) {
      return { success: false, error: '缺少企业信息' }
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'expiryReminder',
        data: {
          action: 'saveAlertSettings',
          payload: {
            enterpriseId: enterpriseUser._id || '',
            enterpriseName: enterpriseUser.companyName || '',
            ...settings
          }
        }
      })

      return res.result || { success: false, error: '保存提醒设置失败' }
    } catch (err) {
      console.error('保存提醒设置失败:', err)
      return { success: false, error: err.message || '保存提醒设置失败' }
    }
  }

  async confirmWxSubscription(enterpriseUser, templateId = '') {
    if (!enterpriseUser || (!enterpriseUser._id && !enterpriseUser.companyName)) {
      return { success: false, error: '缺少企业信息' }
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'expiryReminder',
        data: {
          action: 'confirmWxSubscription',
          payload: {
            enterpriseId: enterpriseUser._id || '',
            enterpriseName: enterpriseUser.companyName || '',
            templateId
          }
        }
      })

      return res.result || { success: false, error: '保存订阅状态失败' }
    } catch (err) {
      console.error('保存订阅状态失败:', err)
      return { success: false, error: err.message || '保存订阅状态失败' }
    }
  }

  /**
   * 璇锋眰璁㈤槄娑堟伅鎺堟潈
   * @param {Array} templateIds 妯℃澘ID鍒楄〃
   * @returns {Promise<Object>} 鎺堟潈缁撴灉
   */
  async requestSubscribeMessage(templateIds) {
    return new Promise((resolve, reject) => {
      wx.requestSubscribeMessage({
        tmplIds: templateIds,
        success: (res) => {
          debugLog('subscribe message auth result', res)
          resolve(res)
        },
        fail: (err) => {
          debugLog('subscribe message auth failed', err)
          reject(err)
        }
      })
    })
  }

  /**
   * 淇濆瓨璁㈤槄鐘舵€?   * @param {string} enterpriseId 浼佷笟ID
   * @param {boolean} subscribed 鏄惁璁㈤槄
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
      console.error('淇濆瓨璁㈤槄鐘舵€佸け璐?', err)
    }
  }
}

module.exports = new ExpiryReminderService()

