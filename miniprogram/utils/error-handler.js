/**
 * 全局错误处理工具
 * 统一处理云函数错误、网络错误、业务错误
 */

const ErrorHandler = {
  // 错误类型定义
  ErrorTypes: {
    NETWORK: 'NETWORK_ERROR',
    CLOUD_FUNCTION: 'CLOUD_FUNCTION_ERROR',
    VALIDATION: 'VALIDATION_ERROR',
    BUSINESS: 'BUSINESS_ERROR',
    AUTH: 'AUTH_ERROR',
    UNKNOWN: 'UNKNOWN_ERROR'
  },

  // 错误码映射
  ErrorCodes: {
    // 网络错误
    '-1': { type: 'NETWORK', message: '网络连接失败，请检查网络' },
    'timeout': { type: 'NETWORK', message: '请求超时，请重试' },
    
    // 云函数错误
    'FUNCTION_NOT_FOUND': { type: 'CLOUD_FUNCTION', message: '服务暂不可用' },
    'INVOKE_FAILED': { type: 'CLOUD_FUNCTION', message: '服务调用失败' },
    
    // 认证错误
    'AUTH_FAILED': { type: 'AUTH', message: '登录已过期，请重新登录' },
    'PERMISSION_DENIED': { type: 'AUTH', message: '没有操作权限' },
    
    // 业务错误
    'DATA_NOT_FOUND': { type: 'BUSINESS', message: '数据不存在' },
    'DATA_EXISTS': { type: 'BUSINESS', message: '数据已存在' },
    'OPERATION_FAILED': { type: 'BUSINESS', message: '操作失败' }
  },

  /**
   * 解析错误信息
   * @param {Error|Object} error - 错误对象
   * @returns {Object} 解析后的错误信息
   */
  parseError(error) {
    // 默认错误信息
    let result = {
      type: this.ErrorTypes.UNKNOWN,
      code: 'UNKNOWN',
      message: '发生未知错误，请稍后重试',
      original: error
    }

    if (!error) {
      return result
    }

    // 处理云函数返回的错误
    if (error.errCode !== undefined) {
      result.code = error.errCode
      const mapped = this.ErrorCodes[error.errCode]
      if (mapped) {
        result.type = this.ErrorTypes[mapped.type]
        result.message = mapped.message
      } else {
        result.message = error.errMsg || result.message
      }
      return result
    }

    // 处理自定义错误
    if (error.code) {
      result.code = error.code
      const mapped = this.ErrorCodes[error.code]
      if (mapped) {
        result.type = this.ErrorTypes[mapped.type]
        result.message = error.message || mapped.message
      } else {
        result.message = error.message || result.message
      }
      return result
    }

    // 处理网络错误
    if (error.message && (
      error.message.includes('network') ||
      error.message.includes('timeout') ||
      error.message.includes('fail')
    )) {
      result.type = this.ErrorTypes.NETWORK
      result.code = 'NETWORK_ERROR'
      result.message = '网络连接失败，请检查网络后重试'
      return result
    }

    // 使用错误对象的消息
    if (error.message) {
      result.message = error.message
    }

    return result
  },

  /**
   * 处理错误
   * @param {Error|Object} error - 错误对象
   * @param {Object} options - 处理选项
   * @returns {Object} 错误信息
   */
  handle(error, options = {}) {
    const { 
      showToast = true, 
      toastTitle = '错误',
      logError = true,
      rethrow = false 
    } = options

    const parsed = this.parseError(error)

    // 记录错误日志
    if (logError) {
      console.error('[ErrorHandler]', parsed)
    }

    // 显示错误提示
    if (showToast) {
      wx.showToast({
        title: parsed.message,
        icon: 'none',
        duration: 3000
      })
    }

    // 特殊错误处理
    this.handleSpecialError(parsed)

    if (rethrow) {
      throw parsed
    }

    return parsed
  },

  /**
   * 处理特殊类型的错误
   * @param {Object} parsedError - 解析后的错误
   */
  handleSpecialError(parsedError) {
    switch (parsedError.type) {
      case this.ErrorTypes.AUTH:
        // 认证错误，跳转到登录页
        if (parsedError.code === 'AUTH_FAILED') {
          setTimeout(() => {
            wx.navigateTo({
              url: '/pages/login/login'
            })
          }, 1500)
        }
        break

      case this.ErrorTypes.NETWORK:
        // 网络错误，可以尝试重连
        break

      default:
        break
    }
  },

  /**
   * 包装云函数调用
   * @param {Function} fn - 云函数调用函数
   * @param {Object} options - 选项
   * @returns {Promise}
   */
  async wrapCloudFunction(fn, options = {}) {
    try {
      const result = await fn()
      return result
    } catch (error) {
      return this.handle(error, options)
    }
  },

  /**
   * 创建错误对象
   * @param {string} code - 错误码
   * @param {string} message - 错误消息
   * @param {Object} data - 附加数据
   * @returns {Error}
   */
  createError(code, message, data = {}) {
    const error = new Error(message)
    error.code = code
    error.data = data
    return error
  },

  /**
   * 显示成功提示
   * @param {string} message - 提示消息
   * @param {number} duration - 持续时间
   */
  showSuccess(message, duration = 2000) {
    wx.showToast({
      title: message,
      icon: 'success',
      duration
    })
  },

  /**
   * 显示加载提示
   * @param {string} title - 提示文字
   * @param {boolean} mask - 是否显示遮罩
   * @returns {Function} 关闭加载的函数
   */
  showLoading(title = '加载中...', mask = true) {
    wx.showLoading({
      title,
      mask
    })
    return () => wx.hideLoading()
  },

  /**
   * 显示确认对话框
   * @param {Object} options - 选项
   * @returns {Promise<boolean>}
   */
  showConfirm(options) {
    return new Promise((resolve) => {
      wx.showModal({
        title: options.title || '提示',
        content: options.content || '',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        confirmColor: options.confirmColor || '#1890ff',
        success: (res) => {
          resolve(res.confirm)
        }
      })
    })
  }
}

module.exports = {
  ErrorHandler
}
