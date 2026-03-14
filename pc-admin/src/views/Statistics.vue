<template>
  <div class="statistics-page">
    <div class="page-header">
      <h1 class="page-title">统计分析</h1>
      <p class="page-subtitle">检定数据多维度分析</p>
    </div>
    
    <!-- 时间筛选 -->
    <div class="filter-section">
      <el-radio-group v-model="timeRange" @change="handleTimeChange">
        <el-radio-button label="week">近一周</el-radio-button>
        <el-radio-button label="month">近一月</el-radio-button>
        <el-radio-button label="quarter">近三月</el-radio-button>
        <el-radio-button label="year">近一年</el-radio-button>
      </el-radio-group>
    </div>
    
    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalRecords }}</div>
        <div class="stat-label">检定总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.passRate }}%</div>
        <div class="stat-label">合格率</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.enterpriseCount }}</div>
        <div class="stat-label">企业数量</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.avgDaily }}</div>
        <div class="stat-label">日均检定量</div>
      </div>
    </div>
    
    <!-- 图表区域 -->
    <div class="charts-grid">
      <div class="chart-card">
        <h3 class="chart-title">检定趋势</h3>
        <div ref="trendChartRef" class="chart-container"></div>
      </div>
      
      <div class="chart-card">
        <h3 class="chart-title">辖区合格率对比</h3>
        <div ref="districtChartRef" class="chart-container"></div>
      </div>
      
      <div class="chart-card full-width">
        <h3 class="chart-title">企业检定排行TOP10</h3>
        <div ref="rankChartRef" class="chart-container"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'

const timeRange = ref('month')

const stats = reactive({
  totalRecords: 1256,
  passRate: 95.4,
  enterpriseCount: 86,
  avgDaily: 12.5
})

const trendChartRef = ref()
const districtChartRef = ref()
const rankChartRef = ref()

let trendChart = null
let districtChart = null
let rankChart = null

const handleTimeChange = () => {
  // 重新加载图表
  initTrendChart()
}

const initTrendChart = () => {
  if (!trendChartRef.value) return
  
  trendChart = echarts.init(trendChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['检定数量', '合格数量']
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['03-01', '03-02', '03-03', '03-04', '03-05', '03-06', '03-07']
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: '检定数量',
        type: 'line',
        smooth: true,
        data: [45, 52, 38, 65, 48, 56, 42],
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(102, 126, 234, 0.3)' },
            { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
          ])
        },
        lineStyle: { color: '#667eea' },
        itemStyle: { color: '#667eea' }
      },
      {
        name: '合格数量',
        type: 'line',
        smooth: true,
        data: [43, 50, 36, 62, 46, 53, 40],
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(103, 194, 58, 0.3)' },
            { offset: 1, color: 'rgba(103, 194, 58, 0.05)' }
          ])
        },
        lineStyle: { color: '#67c23a' },
        itemStyle: { color: '#67c23a' }
      }
    ]
  }
  
  trendChart.setOption(option)
}

const initDistrictChart = () => {
  if (!districtChartRef.value) return
  
  districtChart = echarts.init(districtChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所']
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: {
        formatter: '{value}%'
      }
    },
    series: [
      {
        name: '合格率',
        type: 'bar',
        data: [96, 98, 94, 97, 95, 93, 96, 98, 95],
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#667eea' },
            { offset: 1, color: '#764ba2' }
          ]),
          borderRadius: [4, 4, 0, 0]
        }
      }
    ]
  }
  
  districtChart.setOption(option)
}

const initRankChart = () => {
  if (!rankChartRef.value) return
  
  rankChart = echarts.init(rankChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value'
    },
    yAxis: {
      type: 'category',
      data: [
        '温州压力表有限公司',
        '浙江仪表科技有限公司',
        '华东测控设备有限公司',
        '文成县机械厂',
        '温州精密仪器有限公司',
        '瑞安仪表厂',
        '乐清测控公司',
        '平阳机械厂',
        '永嘉仪表公司',
        '苍南设备厂'
      ].reverse()
    },
    series: [
      {
        name: '检定数量',
        type: 'bar',
        data: [156, 142, 128, 115, 98, 86, 75, 68, 52, 45].reverse(),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#667eea' },
            { offset: 1, color: '#764ba2' }
          ]),
          borderRadius: [0, 4, 4, 0]
        }
      }
    ]
  }
  
  rankChart.setOption(option)
}

const handleResize = () => {
  trendChart?.resize()
  districtChart?.resize()
  rankChart?.resize()
}

onMounted(() => {
  initTrendChart()
  initDistrictChart()
  initRankChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  districtChart?.dispose()
  rankChart?.dispose()
})
</script>

<style lang="scss" scoped>
.statistics-page {
  .filter-section {
    background: #fff;
    padding: 16px 20px;
    border-radius: 12px;
    margin-bottom: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  }
  
  .stat-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 20px;
    
    .stat-card {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
      
      .stat-value {
        font-size: 36px;
        font-weight: 600;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      
      .stat-label {
        font-size: 14px;
        color: #909399;
        margin-top: 8px;
      }
    }
  }
  
  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    
    .chart-card {
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
      
      &.full-width {
        grid-column: span 2;
      }
      
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
}
</style>
