/**
 * 加载动画组件
 * 支持全屏遮罩、自定义加载文字
 */
Component({
  properties: {
    // 是否显示
    show: {
      type: Boolean,
      value: false
    },
    // 加载文字
    text: {
      type: String,
      value: '加载中...'
    },
    // 是否显示遮罩
    mask: {
      type: Boolean,
      value: true
    },
    // 遮罩是否透明
    transparent: {
      type: Boolean,
      value: false
    }
  },

  data: {},

  methods: {}
})
