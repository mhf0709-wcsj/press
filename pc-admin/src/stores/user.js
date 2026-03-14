import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  // 状态
  const user = ref(null)
  const token = ref('')
  const isLoggedIn = computed(() => !!token.value && !!user.value)
  
  // 管理员类型
  const isAdmin = computed(() => user.value?.role === 'super' || user.value?.role === 'admin')
  const isDistrictAdmin = computed(() => user.value?.role === 'district')
  const adminDistrict = computed(() => user.value?.district || null)

  // 登录
  async function login(username, password) {
    // 模拟登录验证
    // 实际项目中应该调用云函数验证
    const admins = JSON.parse(localStorage.getItem('mock_admins') || '[]')
    const admin = admins.find(a => a.username === username && a.password === password)
    
    if (admin) {
      user.value = {
        id: admin._id,
        username: admin.username,
        role: admin.role,
        district: admin.district
      }
      token.value = 'mock_token_' + Date.now()
      
      // 保存到本地存储
      localStorage.setItem('adminUser', JSON.stringify(user.value))
      localStorage.setItem('adminToken', token.value)
      
      return { success: true }
    }
    
    return { success: false, message: '用户名或密码错误' }
  }

  // 退出登录
  function logout() {
    user.value = null
    token.value = ''
    localStorage.removeItem('adminUser')
    localStorage.removeItem('adminToken')
  }

  // 检查登录状态
  function checkAuth() {
    const savedUser = localStorage.getItem('adminUser')
    const savedToken = localStorage.getItem('adminToken')
    
    if (savedUser && savedToken) {
      user.value = JSON.parse(savedUser)
      token.value = savedToken
      return true
    }
    return false
  }

  // 修改密码
  async function changePassword(oldPassword, newPassword) {
    // 模拟修改密码
    const admins = JSON.parse(localStorage.getItem('mock_admins') || '[]')
    const index = admins.findIndex(a => a._id === user.value.id)
    
    if (index > -1 && admins[index].password === oldPassword) {
      admins[index].password = newPassword
      localStorage.setItem('mock_admins', JSON.stringify(admins))
      return { success: true }
    }
    
    return { success: false, message: '原密码错误' }
  }

  return {
    user,
    token,
    isLoggedIn,
    isAdmin,
    isDistrictAdmin,
    adminDistrict,
    login,
    logout,
    checkAuth,
    changePassword
  }
})
