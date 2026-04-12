/**
 * 生命周期流转服务模块
 * 负责设备从入库、安装、送检到报废的全生命周期日志记录
 */

const db = wx.cloud.database()
const { formatDateTime } = require('../utils/helpers/date')

class LifecycleService {
  /**
   * 记录设备生命周期事件
   * @param {Object} params 参数
   * @param {string} params.deviceId 设备ID
   * @param {string} params.action 动作 (如: '入库', '安装', '送检', '检定', '停用', '报废')
   * @param {string} params.operator 操作人名称
   * @param {string} params.operatorId 操作人ID
   * @param {string} params.remark 备注信息
   * @param {Array<string>} params.images 相关图片
   * @param {Object} params.location 位置信息 { latitude, longitude, name }
   * @returns {Promise<string>} 记录ID
   */
  async logEvent(params) {
    try {
      const {
        deviceId,
        action,
        operator = '系统',
        operatorId = 'system',
        remark = '',
        images = [],
        location = null
      } = params;

      if (!deviceId) throw new Error('缺少设备ID');
      if (!action) throw new Error('缺少动作名称');

      const logData = {
        deviceId,
        action,
        operator,
        operatorId,
        remark,
        images,
        location,
        createTime: formatDateTime(new Date()),
        timestamp: Date.now()
      };

      const res = await db.collection('lifecycle_logs').add({
        data: logData
      });

      return res._id;
    } catch (err) {
      console.error('记录生命周期事件失败:', err);
      throw err;
    }
  }

  /**
   * 获取设备的生命周期日志
   * @param {string} deviceId 设备ID
   * @returns {Promise<Array>} 日志列表
   */
  async getDeviceLogs(deviceId) {
    try {
      const res = await db.collection('lifecycle_logs')
        .where({ deviceId })
        .orderBy('timestamp', 'desc')
        .get();
      
      return res.data;
    } catch (err) {
      console.error('获取生命周期日志失败:', err);
      throw err;
    }
  }
}

module.exports = new LifecycleService();
