/**
 * 设备管理服务模块
 * 负责设备的查询、创建和更新
 */

const db = wx.cloud.database()
const { formatDateTime } = require('../utils/helpers/date')
const lifecycleService = require('./lifecycle-service')
const equipmentService = require('./equipment-service')

/**
 * 设备管理服务类
 */
class DeviceService {
  /**
   * 加载设备列表
   * @param {Object} options 查询选项
   * @returns {Promise<Array>} 设备列表
   */
  async loadDevices(options = {}) {
    const { enterpriseUser, fromAdmin, district } = options
    
    if (!enterpriseUser) {
      return []
    }
    
    let whereCondition = {}
    
    if (fromAdmin) {
      if (district) {
        whereCondition.district = district
      }
    } else {
      whereCondition.enterpriseName = enterpriseUser.companyName
    }
    
    try {
      const res = await db.collection('devices')
        .where(whereCondition)
        .orderBy('createTime', 'desc')
        .limit(100)
        .get()
      
      return res.data
    } catch (err) {
      console.error('加载设备失败:', err)
      throw err
    }
  }

  /**
   * 创建新设备
   * @param {Object} deviceData 设备数据
   * @param {Object} options 选项
   * @returns {Promise<Object>} 创建结果
   */
  async createDevice(deviceData, options = {}) {
    const { enterpriseUser, fromAdmin, district } = options
    
    const newDevice = {
      deviceNo: deviceData.deviceNo || `DEV-${Date.now()}`,
      deviceName: deviceData.deviceName,
      deviceType: deviceData.deviceType || '压力表',
      enterpriseId: enterpriseUser._id || enterpriseUser.companyName,
      enterpriseName: fromAdmin ? '管理端录入' : enterpriseUser.companyName,
      district: district || '',
      factoryNo: deviceData.factoryNo || '',
      equipmentId: deviceData.equipmentId || '',
      equipmentName: deviceData.equipmentName || '',
      status: deviceData.status || '在用', // 在用, 备用, 送检, 停用, 报废
      qrCode: `QR-${Date.now()}-${Math.floor(Math.random()*1000)}`, // 自动分配一表一码
      manufacturer: deviceData.manufacturer || '',
      modelSpec: deviceData.modelSpec || '',
      installLocation: deviceData.installLocation || '',
      createTime: formatDateTime(new Date()),
      updateTime: formatDateTime(new Date()),
      recordCount: 0
    }
    
    try {
      const res = await db.collection('devices').add({
        data: newDevice
      })
      
      // 自动记录“入库”生命周期事件
      await lifecycleService.logEvent({
        deviceId: res._id,
        action: '入库',
        operator: enterpriseUser.companyName || '系统',
        operatorId: enterpriseUser._id || 'system',
        remark: newDevice.equipmentName ? `压力表首次建档赋码（所属设备：${newDevice.equipmentName}）` : '压力表首次建档赋码'
      }).catch(e => console.error('记录入库事件失败', e));

      if (newDevice.equipmentId) {
        equipmentService.updateGaugeCount(newDevice.equipmentId).catch(() => {})
      }
      
      return {
        _id: res._id,
        ...newDevice
      }
    } catch (err) {
      console.error('创建设备失败:', err)
      throw err
    }
  }

  /**
   * 更新设备记录数
   * @param {string} deviceId 设备ID
   * @returns {Promise<void>}
   */
  async updateRecordCount(deviceId) {
    try {
      const countRes = await db.collection('pressure_records')
        .where({ deviceId })
        .count()
      
      await db.collection('devices').doc(deviceId).update({
        data: {
          recordCount: countRes.total,
          updateTime: formatDateTime(new Date())
        }
      })
    } catch (err) {
      console.error('更新设备记录数失败:', err)
    }
  }

  /**
   * 根据ID获取设备
   * @param {string} deviceId 设备ID
   * @returns {Promise<Object>} 设备信息
   */
  async getDeviceById(deviceId) {
    try {
      const res = await db.collection('devices').doc(deviceId).get()
      return res.data
    } catch (err) {
      console.error('获取设备失败:', err)
      throw err
    }
  }

  /**
   * 更新设备信息
   * @param {string} deviceId 设备ID
   * @param {Object} data 更新数据
   * @returns {Promise<void>}
   */
  async updateDevice(deviceId, data) {
    try {
      const safeData = sanitizeUpdateData(data)
      await db.collection('devices').doc(deviceId).update({
        data: {
          ...safeData,
          updateTime: formatDateTime(new Date())
        }
      })
    } catch (err) {
      console.error('更新设备失败:', err)
      throw err
    }
  }

  /**
   * 删除设备
   * @param {string} deviceId 设备ID
   * @returns {Promise<void>}
   */
  async deleteDevice(deviceId) {
    try {
      await db.collection('devices').doc(deviceId).remove()
    } catch (err) {
      console.error('删除设备失败:', err)
      throw err
    }
  }

  /**
   * 搜索设备
   * @param {string} keyword 关键词
   * @param {Object} options 选项
   * @returns {Promise<Array>} 搜索结果
   */
  async searchDevices(keyword, options = {}) {
    const { enterpriseUser, fromAdmin } = options
    
    if (!keyword || !keyword.trim()) {
      return this.loadDevices(options)
    }
    
    const db = wx.cloud.database()
    const _ = db.command
    
    let whereCondition = {
      deviceName: db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    }
    
    if (!fromAdmin && enterpriseUser) {
      whereCondition.enterpriseName = enterpriseUser.companyName
    }
    
    try {
      const res = await db.collection('devices')
        .where(whereCondition)
        .orderBy('createTime', 'desc')
        .limit(50)
        .get()
      
      return res.data
    } catch (err) {
      console.error('搜索设备失败:', err)
      throw err
    }
  }
}

function sanitizeUpdateData(data = {}) {
  const result = {}
  Object.keys(data || {}).forEach((key) => {
    if (!key || key.startsWith('_')) return
    if (key === 'createTime') return
    const value = data[key]
    if (value === undefined) return
    result[key] = value
  })
  return result
}

module.exports = new DeviceService()
