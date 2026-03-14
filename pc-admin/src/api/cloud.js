import { cloudConfig, collections } from './config'

/**
 * 云开发API封装
 * 使用HTTP API访问云开发数据库
 */

const BASE_URL = `https://${cloudConfig.envId}.ap-shanghai.tcb-api.tencentyun.com/api/v2`

// 获取访问Token（需要后端支持，这里使用简化的本地存储方式）
function getAccessToken() {
  return localStorage.getItem('adminToken') || ''
}

// 通用请求方法
async function request(url, options = {}) {
  const token = getAccessToken()
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  })
  
  const data = await response.json()
  
  if (data.code && data.code !== 0) {
    throw new Error(data.message || '请求失败')
  }
  
  return data
}

/**
 * 模拟数据库操作（本地开发模式）
 * 生产环境需要对接云开发HTTP API或云函数
 */
class MockDatabase {
  constructor(collectionName) {
    this.collection = collectionName
  }

  // 查询数据
  async where(condition = {}) {
    // 实际项目中应该调用云函数或HTTP API
    // 这里返回模拟数据结构
    return {
      get: async () => {
        const data = JSON.parse(localStorage.getItem(`mock_${this.collection}`) || '[]')
        return { data }
      },
      count: async () => {
        const data = JSON.parse(localStorage.getItem(`mock_${this.collection}`) || '[]')
        return { total: data.length }
      }
    }
  }

  // 添加数据
  async add(record) {
    const data = JSON.parse(localStorage.getItem(`mock_${this.collection}`) || '[]')
    const newRecord = {
      _id: Date.now().toString(),
      ...record,
      createdAt: new Date().toISOString()
    }
    data.push(newRecord)
    localStorage.setItem(`mock_${this.collection}`, JSON.stringify(data))
    return { id: newRecord._id }
  }

  // 更新数据
  async doc(id) {
    return {
      update: async (data) => {
        const records = JSON.parse(localStorage.getItem(`mock_${this.collection}`) || '[]')
        const index = records.findIndex(r => r._id === id)
        if (index > -1) {
          records[index] = { ...records[index], ...data, updatedAt: new Date().toISOString() }
          localStorage.setItem(`mock_${this.collection}`, JSON.stringify(records))
          return { updated: 1 }
        }
        return { updated: 0 }
      },
      remove: async () => {
        const records = JSON.parse(localStorage.getItem(`mock_${this.collection}`) || '[]')
        const filtered = records.filter(r => r._id !== id)
        localStorage.setItem(`mock_${this.collection}`, JSON.stringify(filtered))
        return { removed: 1 }
      },
      get: async () => {
        const records = JSON.parse(localStorage.getItem(`mock_${this.collection}`) || '[]')
        const record = records.find(r => r._id === id)
        return { data: record }
      }
    }
  }
}

// 导出数据库实例
export const db = {
  collection: (name) => new MockDatabase(name)
}

// 导出集合常量
export { collections }
