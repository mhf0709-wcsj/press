<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <div class="logo">
          <el-icon :size="48"><DataAnalysis /></el-icon>
        </div>
        <h1 class="title">压力表检定智能体</h1>
        <p class="subtitle">管理后台</p>
      </div>
      
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            size="large"
            :prefix-icon="User"
          />
        </el-form-item>
        
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-btn"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>
      
      <div class="login-footer">
        <p>提示：默认管理员账号 admin / admin123</p>
      </div>
    </div>
    
    <div class="login-bg">
      <div class="bg-content">
        <h2>特种设备检定管理系统</h2>
        <p>高效 · 安全 · 智能</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserStore()

const formRef = ref()
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ]
}

// 初始化默认管理员账号
onMounted(() => {
  const admins = JSON.parse(localStorage.getItem('mock_admins') || '[]')
  if (admins.length === 0) {
    // 创建默认管理员
    const defaultAdmins = [
      {
        _id: '1',
        username: 'admin',
        password: 'admin123',
        role: 'super',
        district: null
      },
      {
        _id: '2',
        username: 'dawen',
        password: 'dawen123',
        role: 'district',
        district: '大峃所'
      }
    ]
    localStorage.setItem('mock_admins', JSON.stringify(defaultAdmins))
  }
})

const handleLogin = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  
  loading.value = true
  
  try {
    const result = await userStore.login(form.username, form.password)
    
    if (result.success) {
      ElMessage.success('登录成功')
      router.push('/dashboard')
    } else {
      ElMessage.error(result.message || '登录失败')
    }
  } catch (error) {
    ElMessage.error('登录失败，请稍后重试')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.login-container {
  display: flex;
  height: 100vh;
}

.login-box {
  width: 420px;
  padding: 60px 40px;
  background: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  
  .login-header {
    text-align: center;
    margin-bottom: 40px;
    
    .logo {
      width: 80px;
      height: 80px;
      margin: 0 auto 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    
    .title {
      font-size: 24px;
      color: #303133;
      margin-bottom: 8px;
    }
    
    .subtitle {
      font-size: 14px;
      color: #909399;
    }
  }
  
  .login-form {
    .login-btn {
      width: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      height: 44px;
      font-size: 16px;
      
      &:hover {
        opacity: 0.9;
      }
    }
  }
  
  .login-footer {
    text-align: center;
    margin-top: 24px;
    
    p {
      font-size: 12px;
      color: #909399;
    }
  }
}

.login-bg {
  flex: 1;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  
  .bg-content {
    text-align: center;
    color: #fff;
    
    h2 {
      font-size: 36px;
      margin-bottom: 16px;
    }
    
    p {
      font-size: 18px;
      opacity: 0.8;
      letter-spacing: 8px;
    }
  }
}
</style>
