<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-title">系统设置</h1>
      <p class="page-subtitle">账号与系统配置</p>
    </div>
    
    <el-row :gutter="20">
      <!-- 账号信息 -->
      <el-col :span="12">
        <div class="setting-card">
          <h3 class="card-title">账号信息</h3>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="用户名">
              {{ userStore.user?.username }}
            </el-descriptions-item>
            <el-descriptions-item label="角色">
              <el-tag :type="userStore.isAdmin ? 'danger' : 'primary'">
                {{ userStore.isAdmin ? '总管理员' : '辖区管理员' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="辖区" v-if="userStore.isDistrictAdmin">
              {{ userStore.adminDistrict }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </el-col>
      
      <!-- 修改密码 -->
      <el-col :span="12">
        <div class="setting-card">
          <h3 class="card-title">修改密码</h3>
          <el-form
            ref="passwordFormRef"
            :model="passwordForm"
            :rules="passwordRules"
            label-width="100px"
          >
            <el-form-item label="原密码" prop="oldPassword">
              <el-input
                v-model="passwordForm.oldPassword"
                type="password"
                placeholder="请输入原密码"
                show-password
              />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input
                v-model="passwordForm.newPassword"
                type="password"
                placeholder="请输入新密码"
                show-password
              />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input
                v-model="passwordForm.confirmPassword"
                type="password"
                placeholder="请再次输入新密码"
                show-password
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleChangePassword">
                修改密码
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-col>
      
      <!-- 系统信息 -->
      <el-col :span="24">
        <div class="setting-card">
          <h3 class="card-title">系统信息</h3>
          <el-descriptions :column="3" border>
            <el-descriptions-item label="系统名称">压力表检定智能体</el-descriptions-item>
            <el-descriptions-item label="版本号">v1.0.0</el-descriptions-item>
            <el-descriptions-item label="更新日期">2024-03-01</el-descriptions-item>
            <el-descriptions-item label="技术栈">Vue 3 + Element Plus</el-descriptions-item>
            <el-descriptions-item label="后端服务">微信云开发</el-descriptions-item>
            <el-descriptions-item label="开发者">Qoder AI</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'

const userStore = useUserStore()

const passwordFormRef = ref()
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const validateConfirmPassword = (rule, value, callback) => {
  if (value !== passwordForm.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const passwordRules = {
  oldPassword: [
    { required: true, message: '请输入原密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

const handleChangePassword = async () => {
  const valid = await passwordFormRef.value.validate().catch(() => false)
  if (!valid) return
  
  const result = await userStore.changePassword(
    passwordForm.oldPassword,
    passwordForm.newPassword
  )
  
  if (result.success) {
    ElMessage.success('密码修改成功')
    passwordFormRef.value.resetFields()
  } else {
    ElMessage.error(result.message)
  }
}
</script>

<style lang="scss" scoped>
.settings-page {
  .setting-card {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
    
    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: #303133;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #eee;
    }
  }
}
</style>
