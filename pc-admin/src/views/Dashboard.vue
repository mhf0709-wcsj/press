<template>
  <div class="dashboard-page">
    <div class="page-header">
      <h1 class="page-title">数据大屏</h1>
      <p class="page-subtitle">欢迎使用压力表检定智能体管理后台</p>
    </div>
    
    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-icon total">
          <el-icon :size="28"><Document /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.totalRecords }}</div>
          <div class="stat-label">总检定记录</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon qualified">
          <el-icon :size="28"><CircleCheck /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.qualified }}</div>
          <div class="stat-label">合格记录</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon unqualified">
          <el-icon :size="28"><CircleClose /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.unqualified }}</div>
          <div class="stat-label">不合格记录</div>
        </div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon expiring">
          <el-icon :size="28"><Warning /></el-icon>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ stats.expiring }}</div>
          <div class="stat-label">即将到期</div>
        </div>
      </div>
    </div>
    
    <!-- 图表区域 -->
    <div class="charts-row">
      <div class="chart-card">
        <h3 class="chart-title">辖区数据分布</h3>
        <div ref="districtChartRef" class="chart-container"></div>
      </div>
      
      <div class="chart-card">
        <h3 class="chart-title">检定结论分布</h3>
        <div ref="conclusionChartRef" class="chart-container"></div>
      </div>
    </div>
    
    <!-- 最近记录 -->
    <div class="recent-section">
      <div class="section-header">
        <h3>最近检定记录</h3>
        <el-button type="primary" link @click="goToRecords">
          查看全部 <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
      
      <el-table :data="recentRecords" stripe>
        <el-table-column prop="certNo" label="证书编号" width="180" />
        <el-table-column prop="factoryNo" label="出厂编号" width="120" />
        <el-table-column prop="enterpriseName" label="企业名称" />
        <el-table-column prop="district" label="辖区" width="100" />
        <el-table-column prop="conclusion" label="结论" width="80">
          <template #default="{ row }">
            <el-tag :type="row.conclusion === '合格' ? 'success' : 'danger'" size="small">
              {{ row.conclusion }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="verificationDate" label="检定日期" width="120" />
        <el-table-column prop="expiryDate" label="到期日期" width="120">
          <template #default="{ row }">
            <span :class="{ 'text-danger': isExpiring(row.expiryDate) }">
              {{ row.expiryDate }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import dayjs from 'dayjs'

const router = useRouter()

// 统计数据
const stats = reactive({
  totalRecords: 0,
  qualified: 0,
  unqualified: 0,
  expiring: 0
})

// 最近记录
const recentRecords = ref([])

// 图表引用
const districtChartRef = ref()
const conclusionChartRef = ref()
let districtChart = null
let conclusionChart = null

// 加载数据
const loadData = async () => {
  // 模拟数据
  stats.totalRecords = 1256
  stats.qualified = 1198
  stats.unqualified = 58
  stats.expiring = 23
  
  // 模拟最近记录
  recentRecords.value = [
    {
      certNo: 'JL-2024-001256',
      factoryNo: 'PB-001',
      enterpriseName: '温州压力表有限公司',
      district: '大峃所',
      conclusion: '合格',
      verificationDate: '2024-03-01',
      expiryDate: '2024-09-01'
    },
    {
      certNo: 'JL-2024-001255',
      factoryNo: 'PB-002',
      enterpriseName: '浙江仪表科技有限公司',
      district: '珊溪所',
      conclusion: '合格',
      verificationDate: '2024-02-28',
      expiryDate: '2024-08-28'
    },
    {
      certNo: 'JL-2024-001254',
      factoryNo: 'PB-003',
      enterpriseName: '华东测控设备有限公司',
      district: '巨屿所',
      conclusion: '不合格',
      verificationDate: '2024-02-27',
      expiryDate: '2024-08-27'
    },
    {
      certNo: 'JL-2024-001253',
      factoryNo: 'PB-004',
      enterpriseName: '文成县机械厂',
      district: '峃口所',
      conclusion: '合格',
      verificationDate: '2024-02-26',
      expiryDate: '2024-08-26'
    },
    {
      certNo: 'JL-2024-001252',
      factoryNo: 'PB-005',
      enterpriseName: '温州精密仪器有限公司',
      district: '黄坦所',
      conclusion: '合格',
      verificationDate: '2024-02-25',
      expiryDate: '2024-08-25'
    }
  ]
}

// 初始化辖区分布图表
const initDistrictChart = () => {
  if (!districtChartRef.value) return
  
  districtChart = echarts.init(districtChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'item'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center'
    },
    series: [
      {
        name: '检定记录',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold'
          }
        },
        data: [
          { value: 320, name: '大峃所' },
          { value: 180, name: '珊溪所' },
          { value: 150, name: '巨屿所' },
          { value: 120, name: '峃口所' },
          { value: 100, name: '黄坦所' },
          { value: 98, name: '西坑所' },
          { value: 86, name: '玉壶所' },
          { value: 72, name: '南田所' },
          { value: 130, name: '百丈漈所' }
        ]
      }
    ]
  }
  
  districtChart.setOption(option)
}

// 初始化结论分布图表
const initConclusionChart = () => {
  if (!conclusionChartRef.value) return
  
  conclusionChart = echarts.init(conclusionChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'item'
    },
    series: [
      {
        name: '检定结论',
        type: 'pie',
        radius: '70%',
        data: [
          { 
            value: stats.qualified, 
            name: '合格',
            itemStyle: { color: '#67c23a' }
          },
          { 
            value: stats.unqualified, 
            name: '不合格',
            itemStyle: { color: '#f56c6c' }
          }
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }
    ]
  }
  
  conclusionChart.setOption(option)
}

// 判断是否即将到期
const isExpiring = (date) => {
  if (!date) return false
  const expiry = dayjs(date)
  const now = dayjs()
  const diff = expiry.diff(now, 'day')
  return diff <= 30
}

// 跳转到记录管理
const goToRecords = () => {
  router.push('/records')
}

// 窗口大小变化时重绘图表
const handleResize = () => {
  districtChart?.resize()
  conclusionChart?.resize()
}

onMounted(async () => {
  await loadData()
  initDistrictChart()
  initConclusionChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  districtChart?.dispose()
  conclusionChart?.dispose()
})
</script>

<style lang="scss" scoped>
.dashboard-page {
  .stat-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
    margin-bottom: 24px;
    
    .stat-card {
      display: flex;
      align-items: center;
      gap: 16px;
      
      .stat-icon {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        
        &.total {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        
        &.qualified {
          background: linear-gradient(135deg, #67c23a 0%, #85ce61 100%);
        }
        
        &.unqualified {
          background: linear-gradient(135deg, #f56c6c 0%, #f89898 100%);
        }
        
        &.expiring {
          background: linear-gradient(135deg, #e6a23c 0%, #ebb563 100%);
        }
      }
      
      .stat-info {
        .stat-value {
          font-size: 28px;
          font-weight: 600;
          color: #303133;
        }
        
        .stat-label {
          font-size: 14px;
          color: #909399;
          margin-top: 4px;
        }
      }
    }
  }
  
  .charts-row {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
    
    .chart-card {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
      
      .chart-title {
        font-size: 16px;
        font-weight: 600;
        color: #303133;
        margin-bottom: 16px;
      }
      
      .chart-container {
        height: 300px;
      }
    }
  }
  
  .recent-section {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
    
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      
      h3 {
        font-size: 16px;
        font-weight: 600;
        color: #303133;
      }
    }
  }
  
  .text-danger {
    color: #f56c6c;
  }
}
</style>
