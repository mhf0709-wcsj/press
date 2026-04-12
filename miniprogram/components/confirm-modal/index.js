/**
 * 确认弹窗组件
 * 支持自定义标题、内容、按钮文字
 * 支持危险操作样式
 */
Component({
  properties: {
    // 是否显示弹窗
    show: {
      type: Boolean,
      value: false
    },
    // 标题
    title: {
      type: String,
      value: '提示'
    },
    // 内容
    content: {
      type: String,
      value: ''
    },
    // 确认按钮文字
    confirmText: {
      type: String,
      value: '确认'
    },
    // 取消按钮文字
    cancelText: {
      type: String,
      value: '取消'
    },
    // 是否为危险操作（红色确认按钮）
    danger: {
      type: Boolean,
      value: false
    },
    // 是否显示取消按钮
    showCancel: {
      type: Boolean,
      value: true
    },
    // 点击遮罩是否关闭
    closeOnMask: {
      type: Boolean,
      value: true
    }
  },

  data: {
    loading: false
  },

  methods: {
    // 点击遮罩
    onMaskTap() {
      if (this.properties.closeOnMask) {
        this.onCancel()
      }
    },

    // 取消
    onCancel() {
      this.triggerEvent('cancel')
    },

    // 确认
    onConfirm() {
      if (this.data.loading) return
      this.triggerEvent('confirm')
    },

    // 显示加载状态
    showLoading() {
      this.setData({ loading: true })
    },

    // 隐藏加载状态
    hideLoading() {
      this.setData({ loading: false })
    }
  }
})
