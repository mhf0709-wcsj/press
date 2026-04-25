const { ROUTES } = require('../../constants/index')

Page({
  data: {
    title: '正在进入',
    subtitle: '正在跳转到正式入口'
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
