/**
 * 空数据占位组件
 * 显示空状态图标和文字，支持操作按钮
 */
Component({
  properties: {
    // 图标类型：data, search, network, error
    type: {
      type: String,
      value: 'data'
    },
    // 提示文字
    text: {
      type: String,
      value: '暂无数据'
    },
    // 描述文字
    description: {
      type: String,
      value: ''
    },
    // 操作按钮文字
    buttonText: {
      type: String,
      value: ''
    }
  },

  data: {
    // 图标映射
    icons: {
      data: '📋',
      search: '🔍',
      network: '📡',
      error: '⚠️',
      success: '✅'
    }
  },

  methods: {
    onButtonTap() {
      this.triggerEvent('action')
    }
  }
})
