<template>
  <div class="enterprises-page">
    <div class="page-header">
      <h1 class="page-title">企业管理</h1>
      <p class="page-subtitle">管理平台企业信息</p>
    </div>
    
    <!-- 搜索 -->
    <div class="filter-section">
      <el-form :inline="true">
        <el-form-item>
          <el-input
            v-model="searchKeyword"
            placeholder="企业名称/联系人"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- 企业列表 -->
    <div class="enterprise-list">
      <el-row :gutter="20">
        <el-col :span="8" v-for="item in enterprises" :key="item._id">
          <div class="enterprise-card" @click="handleView(item)">
            <div class="card-header">
              <div class="company-name">{{ item.companyName }}</div>
              <el-tag :type="item.status === 'active' ? 'success' : 'info'" size="small">
                {{ item.status === 'active' ? '正常' : '停用' }}
              </el-tag>
            </div>
            <div class="card-body">
              <div class="info-item">
                <el-icon><User /></el-icon>
                <span>{{ item.contact }}</span>
              </div>
              <div class="info-item">
                <el-icon><Phone /></el-icon>
                <span>{{ item.phone }}</span>
              </div>
              <div class="info-item">
                <el-icon><Location /></el-icon>
                <span>{{ item.district }}</span>
              </div>
            </div>
            <div class="card-footer">
              <span>检定记录: {{ item.recordCount }} 条</span>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>
    
    <!-- 分页 -->
    <div class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="9"
        :total="total"
        layout="prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>
    
    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="企业详情" width="500px">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="企业名称">{{ currentEnterprise.companyName }}</el-descriptions-item>
        <el-descriptions-item label="联系人">{{ currentEnterprise.contact }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ currentEnterprise.phone }}</el-descriptions-item>
        <el-descriptions-item label="所属辖区">{{ currentEnterprise.district }}</el-descriptions-item>
        <el-descriptions-item label="地址">{{ currentEnterprise.address }}</el-descriptions-item>
        <el-descriptions-item label="检定记录">{{ currentEnterprise.recordCount }} 条</el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ currentEnterprise.createdAt }}</el-descriptions-item>
      </el-descriptions>
      
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button type="primary" @click="viewRecords">查看检定记录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'

const router = useRouter()

const searchKeyword = ref('')
const enterprises = ref([])
const total = ref(0)
const currentPage = ref(1)

const detailVisible = ref(false)
const currentEnterprise = ref({})

const districts = ['大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所']

const loadData = () => {
  // 模拟数据
  const mockData = []
  for (let i = 1; i <= 18; i++) {
    mockData.push({
      _id: String(i),
      companyName: `企业${i}`,
      contact: `联系人${i}`,
      phone: `138${String(i).padStart(8, '0')}`,
      district: districts[i % districts.length],
      address: `浙江省温州市文成县xxx路${i}号`,
      recordCount: Math.floor(Math.random() * 100) + 10,
      status: i % 5 === 0 ? 'inactive' : 'active',
      createdAt: dayjs().subtract(i * 10, 'day').format('YYYY-MM-DD')
    })
  }
  
  enterprises.value = mockData
  total.value = mockData.length
}

const handleSearch = () => {
  currentPage.value = 1
  loadData()
}

const handlePageChange = (page) => {
  currentPage.value = page
  loadData()
}

const handleView = (item) => {
  currentEnterprise.value = item
  detailVisible.value = true
}

const viewRecords = () => {
  router.push({
    path: '/records',
    query: { enterprise: currentEnterprise.value.companyName }
  })
}

onMounted(() => {
  loadData()
})
</script>

<style lang="scss" scoped>
.enterprises-page {
  .filter-section {
    background: #fff;
    padding: 20px;
    border-radius: 12px;
    margin-bottom: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  }
  
  .enterprise-list {
    .enterprise-card {
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
      cursor: pointer;
      transition: all 0.3s;
      
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
      }
      
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        
        .company-name {
          font-size: 16px;
          font-weight: 600;
          color: #303133;
        }
      }
      
      .card-body {
        .info-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #606266;
          margin-bottom: 8px;
          
          .el-icon {
            color: #909399;
          }
        }
      }
      
      .card-footer {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid #eee;
        color: #909399;
        font-size: 13px;
      }
    }
  }
  
  .pagination {
    display: flex;
    justify-content: center;
    margin-top: 20px;
  }
}
</style>
