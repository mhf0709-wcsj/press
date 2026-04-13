const deviceService = require('../../services/device-service');

Page({
  data: {
    devices: [],
    searchKeyword: '',
    isLoading: false,
    enterpriseUser: null
  },

  onLoad() {
    const user = wx.getStorageSync('enterpriseUser');
    if (user) {
      this.setData({ enterpriseUser: user });
      this.loadData();
    } else {
      wx.showToast({ title: '请先登录', icon: 'none' });
    }
  },

  onShow() {
    this.loadData(); // 每次显示页面刷新数据
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadData() {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    
    try {
      wx.showLoading({ title: '加载中' });
      const devices = await deviceService.searchDevices(this.data.searchKeyword, {
        enterpriseUser: this.data.enterpriseUser
      });
      this.setData({ devices });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isLoading: false });
    }
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearch() {
    this.loadData();
  },

  scanQrCode() {
    wx.scanCode({
      success: async (res) => {
        const qrCode = res.result;
        wx.showLoading({ title: '查询中...' });
        
        try {
          const db = wx.cloud.database();
          const deviceRes = await db.collection('devices').where({ qrCode }).get();
          
          wx.hideLoading();
          
          if (deviceRes.data.length > 0) {
            // 找到设备，跳转详情页
            wx.navigateTo({
              url: `/pages/device-detail/device-detail?id=${deviceRes.data[0]._id}`
            });
          } else {
            wx.showToast({ title: '未找到该设备', icon: 'none' });
          }
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '查询失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '扫码取消', icon: 'none' });
      }
    });
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/device-detail/device-detail?id=${id}`
    });
  },

  createNewDevice() {
    wx.showToast({ title: '请在设备库下新增压力表', icon: 'none' })
    wx.navigateTo({ url: '/pages/archive/archive' })
  },

  copyQr(e) {
    const qr = e.currentTarget.dataset.qr;
    wx.setClipboardData({
      data: qr,
      success: () => {
        wx.showToast({ title: '识别码已复制', icon: 'success' });
      }
    });
  }
});
