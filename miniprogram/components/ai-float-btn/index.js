Component({
  properties: {
    // 是否显示标签
    showLabel: {
      type: Boolean,
      value: false
    }
  },

  data: {
    x: 280, // 初始X位置 (rpx转px约为140)
    y: 500, // 初始Y位置
    isMoving: false,
    startTime: 0
  },

  lifetimes: {
    attached() {
      // 获取屏幕宽高，设置初始位置在右下角
      const systemInfo = wx.getSystemInfoSync()
      const screenWidth = systemInfo.windowWidth
      const screenHeight = systemInfo.windowHeight
      
      this.setData({
        x: screenWidth - 70,  // 距离右边 70px
        y: screenHeight - 200 // 距离底部 200px
      })
    }
  },

  methods: {
    // 移动时记录状态
    onMove(e) {
      if (!this.data.isMoving) {
        this.setData({ 
          isMoving: true,
          startTime: Date.now()
        })
      }
    },

    // 触摸结束
    onTouchEnd(e) {
      const moveTime = Date.now() - this.data.startTime
      
      setTimeout(() => {
        this.setData({ isMoving: false })
      }, 100)

      // 吸附到边缘
      this.snapToEdge(e)
    },

    // 吸附到屏幕边缘
    snapToEdge(e) {
      const systemInfo = wx.getSystemInfoSync()
      const screenWidth = systemInfo.windowWidth
      const currentX = e.detail.x
      
      // 判断靠左还是靠右
      const newX = currentX < screenWidth / 2 ? 10 : screenWidth - 70

      this.setData({ x: newX })
    },

    // 跳转到AI助手页面
    goToAI() {
      // 如果正在移动，不触发点击
      if (this.data.isMoving) return
      
      wx.navigateTo({
        url: '/pages/ai-assistant/ai-assistant',
        fail: (err) => {
          console.error('跳转AI助手失败:', err)
          wx.showToast({
            title: '页面跳转失败',
            icon: 'none'
          })
        }
      })
    }
  }
})
