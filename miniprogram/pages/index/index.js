const { ROUTES } = require('../../constants/index')

Page({
  data: {
    title: '页面已迁移',
    subtitle: '正在跳转到正式版入口'
  },

  onLoad() {
    this.redirectToEntry()
  },

  redirectToEntry() {
    setTimeout(() => {
      wx.reLaunch({
        url: ROUTES.LOGIN
      })
    }, 400)
  }
})
