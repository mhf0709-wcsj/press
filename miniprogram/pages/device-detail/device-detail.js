const deviceService = require('../../services/device-service');
const lifecycleService = require('../../services/lifecycle-service');

Page({
  data: {
    deviceId: null,
    mode: 'view', // 'view' or 'create'
    device: {
      deviceNo: '',
      deviceName: '',
      factoryNo: '',
      manufacturer: '',
      modelSpec: '',
      equipmentId: '',
      equipmentName: '',
      status: '在用',
      installLocation: ''
    },
    statusOptions: ['在用', '备用', '送检', '停用', '报废'],
    logs: [],
    archiveRecords: [],
    enterpriseUser: null
  },

  onLoad(options) {
    const user = wx.getStorageSync('enterpriseUser');
    this.setData({ enterpriseUser: user });

    // 处理扫码进入的场景 (scene)
    if (options.scene) {
      // scene 需要 decodeURIComponent
      const scene = decodeURIComponent(options.scene);
      this.setData({ deviceId: scene, mode: 'view' });
      this.loadDeviceDetail(scene);
      this.loadLifecycleLogs(scene);
      this.loadArchiveRecords(scene);
    } else if (options.mode === 'create') {
      const equipmentId = options.equipmentId || ''
      const equipmentName = options.equipmentName ? decodeURIComponent(options.equipmentName) : ''
      if (!equipmentId) {
        wx.showToast({ title: '请先选择所属设备', icon: 'none' })
        wx.switchTab({ url: '/pages/archive/archive' })
        return
      }
      this.setData({ mode: 'create' });
      this.setData({
        'device.equipmentId': equipmentId,
        'device.equipmentName': equipmentName
      })
      wx.setNavigationBarTitle({ title: '新建压力表' });
    } else if (options.id) {
      this.setData({ deviceId: options.id, mode: 'view' });
      this.loadDeviceDetail(options.id);
      this.loadLifecycleLogs(options.id);
      this.loadArchiveRecords(options.id);
    }
  },

  // 生成/查看小程序码
  async showQRCode() {
    const { deviceId, device } = this.data;
    if (!deviceId) return;

    // 如果已有生成的图片，直接预览
    if (device.qrCodeImage) {
      wx.previewImage({
        urls: [device.qrCodeImage] // 需要完整的 cloud ID 或 http 链接
      });
      return;
    }

    wx.showLoading({ title: '生成中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'generateQRCode',
        data: {
          deviceId: deviceId,
          page: 'pages/device-detail/device-detail'
        }
      });

      if (res.result.success) {
        this.setData({
          'device.qrCodeImage': res.result.fileID
        });
        wx.previewImage({
          urls: [res.result.fileID]
        });
      } else {
        wx.showToast({ title: '生成失败: ' + res.result.error, icon: 'none' });
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async loadDeviceDetail(id) {
    wx.showLoading({ title: '加载中' });
    try {
      const device = await deviceService.getDeviceById(id);
      if (device) {
        this.setData({ device });
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async loadLifecycleLogs(id) {
    try {
      const logs = await lifecycleService.getDeviceLogs(id);
      this.setData({ logs });
    } catch (e) {
      console.error('加载日志失败', e);
    }
  },

  async loadArchiveRecords(deviceId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('pressure_records')
        .where({ deviceId })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get()
      this.setData({ archiveRecords: res.data || [] })
    } catch (e) {
      console.error('加载存档记录失败', e)
      this.setData({ archiveRecords: [] })
    }
  },

  goRecordDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`device.${field}`]: e.detail.value
    });
  },

  onStatusChange(e) {
    const index = e.detail.value;
    const newStatus = this.data.statusOptions[index];
    this.setData({
      'device.status': newStatus
    });
  },

  async saveDevice() {
    const { device, mode, deviceId, enterpriseUser } = this.data;
    
    if (!device.deviceName) {
      return wx.showToast({ title: '请填写设备名称', icon: 'none' });
    }

    wx.showLoading({ title: '保存中' });
    try {
      if (mode === 'create') {
        const res = await deviceService.createDevice(device, { enterpriseUser });
        wx.showToast({ title: '建档成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        await deviceService.updateDevice(deviceId, device);
        
        // 如果状态或位置改变了，记录生命周期日志
        // 这里只是简单演示，实际应用中可以比对 oldDevice 差异
        await lifecycleService.logEvent({
          deviceId: deviceId,
          action: `更新状态为[${device.status}]`,
          operator: enterpriseUser.companyName,
          operatorId: enterpriseUser._id,
          remark: `位置更新为: ${device.installLocation || '未说明'}`
        });

        wx.showToast({ title: '更新成功', icon: 'success' });
        this.loadLifecycleLogs(deviceId);
      }
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
