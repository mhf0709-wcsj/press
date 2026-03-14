/**
 * 本地存储工具
 * 封装 wx.getStorageSync 和 wx.setStorageSync
 * 添加错误处理和类型转换
 */

/**
 * 获取存储数据
 * @param {string} key 键名
 * @param {*} defaultValue 默认值
 * @returns {*} 存储的数据
 */
function get(key, defaultValue = null) {
  try {
    const value = wx.getStorageSync(key)
    return value !== undefined && value !== null ? value : defaultValue
  } catch (err) {
    console.error(`获取存储失败 [${key}]:`, err)
    return defaultValue
  }
}

/**
 * 设置存储数据
 * @param {string} key 键名
 * @param {*} value 数据
 * @returns {boolean} 是否成功
 */
function set(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (err) {
    console.error(`设置存储失败 [${key}]:`, err)
    return false
  }
}

/**
 * 移除存储数据
 * @param {string} key 键名
 * @returns {boolean} 是否成功
 */
function remove(key) {
  try {
    wx.removeStorageSync(key)
    return true
  } catch (err) {
    console.error(`移除存储失败 [${key}]:`, err)
    return false
  }
}

/**
 * 清空所有存储
 * @returns {boolean} 是否成功
 */
function clear() {
  try {
    wx.clearStorageSync()
    return true
  } catch (err) {
    console.error('清空存储失败:', err)
    return false
  }
}

/**
 * 获取企业用户信息
 * @returns {Object|null} 企业用户信息
 */
function getEnterpriseUser() {
  return get('enterpriseUser', null)
}

/**
 * 设置企业用户信息
 * @param {Object} user 用户信息
 * @returns {boolean} 是否成功
 */
function setEnterpriseUser(user) {
  return set('enterpriseUser', user)
}

/**
 * 获取管理员信息
 * @returns {Object|null} 管理员信息
 */
function getAdminUser() {
  return get('adminUser', null)
}

/**
 * 设置管理员信息
 * @param {Object} admin 管理员信息
 * @returns {boolean} 是否成功
 */
function setAdminUser(admin) {
  return set('adminUser', admin)
}

/**
 * 清除登录信息
 */
function clearAuth() {
  remove('enterpriseUser')
  remove('adminUser')
}

module.exports = {
  get,
  set,
  remove,
  clear,
  getEnterpriseUser,
  setEnterpriseUser,
  getAdminUser,
  setAdminUser,
  clearAuth
}
