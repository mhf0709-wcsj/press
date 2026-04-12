/**
 * 缓存管理工具
 * 提供内存缓存和本地存储双层缓存策略
 */

class CacheManager {
  constructor() {
    this.memoryCache = new Map()
    this.defaultTTL = 5 * 60 * 1000 // 默认5分钟
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {*} data - 缓存数据
   * @param {number} ttl - 过期时间(毫秒)
   * @param {boolean} persist - 是否持久化到本地存储
   */
  set(key, data, ttl = this.defaultTTL, persist = false) {
    const expireTime = Date.now() + ttl
    const cacheItem = {
      data,
      expireTime,
      persist
    }
    
    // 内存缓存
    this.memoryCache.set(key, cacheItem)
    
    // 持久化到本地存储
    if (persist) {
      try {
        wx.setStorageSync(`cache_${key}`, cacheItem)
      } catch (e) {
        console.warn('Cache persist failed:', e)
      }
    }
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @param {boolean} checkStorage - 是否检查本地存储
   * @returns {*} 缓存数据或null
   */
  get(key, checkStorage = true) {
    // 先检查内存缓存
    const memoryItem = this.memoryCache.get(key)
    if (memoryItem) {
      if (Date.now() < memoryItem.expireTime) {
        return memoryItem.data
      }
      // 过期，删除
      this.memoryCache.delete(key)
    }
    
    // 检查本地存储
    if (checkStorage) {
      try {
        const storageItem = wx.getStorageSync(`cache_${key}`)
        if (storageItem && Date.now() < storageItem.expireTime) {
          // 恢复到内存缓存
          this.memoryCache.set(key, storageItem)
          return storageItem.data
        }
        // 过期，删除
        wx.removeStorageSync(`cache_${key}`)
      } catch (e) {
        console.warn('Cache retrieve failed:', e)
      }
    }
    
    return null
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   */
  remove(key) {
    this.memoryCache.delete(key)
    try {
      wx.removeStorageSync(`cache_${key}`)
    } catch (e) {
      console.warn('Cache remove failed:', e)
    }
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.memoryCache.clear()
    // 清理所有缓存相关的本地存储
    try {
      const keys = wx.getStorageInfoSync().keys
      keys.forEach(key => {
        if (key.startsWith('cache_')) {
          wx.removeStorageSync(key)
        }
      })
    } catch (e) {
      console.warn('Cache clear failed:', e)
    }
  }

  /**
   * 检查缓存是否存在且有效
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    const item = this.memoryCache.get(key)
    if (item && Date.now() < item.expireTime) {
      return true
    }
    return false
  }

  /**
   * 获取或设置缓存
   * @param {string} key - 缓存键
   * @param {Function} fetcher - 获取数据的函数
   * @param {number} ttl - 过期时间
   * @returns {Promise<*>}
   */
  async getOrSet(key, fetcher, ttl = this.defaultTTL) {
    const cached = this.get(key)
    if (cached !== null) {
      return cached
    }
    
    const data = await fetcher()
    this.set(key, data, ttl)
    return data
  }
}

// 导出单例
const cache = new CacheManager()

module.exports = {
  cache,
  CacheManager
}
