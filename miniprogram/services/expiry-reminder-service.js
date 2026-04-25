const { formatDate } = require('../utils/helpers/date')
const { STORAGE_KEYS } = require('../constants/index')
const debugLog = () => {}

class ExpiryReminderService {
  buildDeferredStorageKey(enterpriseUser) {
    const identity = enterpriseUser?._id || enterpriseUser?.companyName || 'default'
    return `${STORAGE_KEYS.LAST_REMINDER_DATE}_${identity}_deferred`
  }

  hasDeferredToday(enterpriseUser) {
    const today = formatDate(new Date())
    return wx.getStorageSync(this.buildDeferredStorageKey(enterpriseUser)) === today
  }

  deferTodayReminder(enterpriseUser) {
    wx.setStorageSync(this.buildDeferredStorageKey(enterpriseUser), formatDate(new Date()))
  }

  buildEntryReminderContent(data = {}) {
    const expiredCount = Number(data.expiredCount || 0)
    const expiringCount = Number(data.expiringCount || 0)
    const lines = [`您有 ${expiredCount} 台已过期，${expiringCount} 台将在 30 天内到期。`]
    const items = Array.isArray(data.recentItems) ? data.recentItems.slice(0, 3) : []

    items.forEach((item) => {
      const title = item.factoryNo || item.instrumentName || '压力表'
      const suffix = item.expiryStatus === 'expired' ? '已过期' : `到期：${item.expiryDate || '-'}`
      lines.push(`• ${title} ${suffix}`)
    })

    return lines.join('\n')
  }

  async maybeShowEntryReminder(page, enterpriseUser, days = 30) {
    if (!page || !enterpriseUser) return null

    const app = typeof getApp === 'function' ? getApp() : null
    const token = app?.globalData?.entryReminderToken || 0

    if (token && app?.globalData?.entryReminderHandledToken === token) {
      return null
    }

    if (this.hasDeferredToday(enterpriseUser)) {
      if (app?.globalData && token) {
        app.globalData.entryReminderHandledToken = token
      }
      return null
    }

    const res = await this.getEnterpriseExpiryDashboard(enterpriseUser, days)
    if (!res || !res.success) return null

    const data = res.data || {}
    const expiredCount = Number(data.expiredCount || 0)
    const expiringCount = Number(data.expiringCount || 0)
    if (expiredCount + expiringCount <= 0) return null

    if (app?.globalData && token) {
      app.globalData.entryReminderHandledToken = token
    }

    return new Promise((resolve) => {
      wx.showModal({
        title: '压力表到期提醒',
        content: this.buildEntryReminderContent(data),
        confirmText: '去处理',
        cancelText: '稍后处理',
        success: (modalRes) => {
          if (modalRes.cancel) {
            this.deferTodayReminder(enterpriseUser)
            resolve({ shown: true, action: 'later', data })
            return
          }

          resolve({ shown: true, action: 'confirm', data })
        },
        fail: () => resolve(null)
      })
    })
  }

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
      console.error('查询到期提醒失败:', err)
      return null
    }
  }

  markTodayReminded() {
    const today = formatDate(new Date())
    wx.setStorageSync('lastReminderDate', today)
  }

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
      console.error('获取到期记录失败:', err)
      throw err
    }
  }

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
