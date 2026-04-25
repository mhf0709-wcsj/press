Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '\u5230\u671f\u63d0\u9192'
    },
    summary: {
      type: String,
      value: ''
    },
    items: {
      type: Array,
      value: [],
      observer(items) {
        this.syncPriority(items)
      }
    },
    confirmText: {
      type: String,
      value: '\u53bb\u5904\u7406'
    },
    cancelText: {
      type: String,
      value: '\u7a0d\u540e\u5904\u7406'
    },
    badgeText: {
      type: String,
      value: '\u5230\u671f\u63d0\u9192'
    },
    fallbackSubtitle: {
      type: String,
      value: '\u8bf7\u4f18\u5148\u8ddf\u8fdb'
    },
    expiredSuffix: {
      type: String,
      value: '\u8fc7\u671f'
    },
    expiringSuffix: {
      type: String,
      value: '\u5373\u5c06\u5230\u671f'
    }
  },

  data: {
    hasExpired: false,
    priorityText: '',
    listTitle: '\u5f85\u5904\u7406\u9879',
    listHint: '\u8bf7\u4f18\u5148\u5904\u7406\u5df2\u8fc7\u671f\u9879\uff0c\u518d\u8ddf\u8fdb\u5373\u5c06\u5230\u671f\u9879',
    priorityNote: '',
    expiredHint: '\u5df2\u8fc7\u671f\u9879\u76ee\u9700\u4f18\u5148\u5904\u7406',
    expiringHint: '\u5efa\u8bae\u63d0\u524d\u5b89\u6392\u5230\u671f\u524d\u5904\u7406'
  },

  lifetimes: {
    attached() {
      this.syncPriority(this.properties.items)
    }
  },

  methods: {
    syncPriority(items) {
      const safeItems = Array.isArray(items) ? items : []
      const hasExpired = safeItems.some((item) => Number(item.expiredCount || 0) > 0)
      this.setData({
        hasExpired,
        priorityText: hasExpired ? '\u5df2\u8fc7\u671f\u4f18\u5148\u5904\u7406' : '\u5373\u5c06\u5230\u671f\u8bf7\u5c3d\u5feb\u8ddf\u8fdb',
        priorityNote: hasExpired ? '\u8bf7\u4f18\u5148\u5b89\u6392\u5df2\u8fc7\u671f\u9879\u5904\u7406' : '\u5efa\u8bae\u63d0\u524d\u5b89\u6392\u5230\u671f\u524d\u5904\u7406',
        listTitle: hasExpired ? '\u4f18\u5148\u5904\u7406\u9879' : '\u5f85\u8ddf\u8fdb\u9879',
        listHint: hasExpired
          ? '\u5efa\u8bae\u4f18\u5148\u5904\u7406\u5df2\u8fc7\u671f\u538b\u529b\u8868\u6216\u98ce\u9669\u4f01\u4e1a'
          : '\u5efa\u8bae\u63d0\u524d\u5b89\u6392\u5373\u5c06\u5230\u671f\u7684\u53f0\u8d26\u5904\u7406'
      })
    },

    onClose() {
      this.triggerEvent('cancel')
    },

    onCancel() {
      this.triggerEvent('cancel')
    },

    onConfirm() {
      this.triggerEvent('confirm')
    },

    stopPropagation() {}
  }
})
