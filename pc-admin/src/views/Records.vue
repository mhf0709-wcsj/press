<template>
  <div class="records-page">
    <div class="page-header">
      <h1 class="page-title">记录管理</h1>
      <p class="page-subtitle">管理所有压力表检定记录</p>
    </div>
    
    <!-- 搜索筛选 -->
    <div class="filter-section">
      <el-form :inline="true" :model="filters">
        <el-form-item label="关键词">
          <el-input
            v-model="filters.keyword"
            placeholder="证书编号/出厂编号"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        
        <el-form-item label="辖区">
          <el-select v-model="filters.district" placeholder="全部辖区" clearable>
            <el-option
              v-for="item in districtOptions"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="结论">
          <el-select v-model="filters.conclusion" placeholder="全部" clearable>
            <el-option label="合格" value="合格" />
            <el-option label="不合格" value="不合格" />
          </el-select>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </div>
    
    <!-- 数据表格 -->
    <div class="table-section">
      <div class="table-header">
        <span class="total">共 {{ total }} 条记录</span>
        <div class="actions">
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon> 新增记录
          </el-button>
          <el-button @click="handleExport">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </div>
      </div>
      
      <el-table
        v-loading="loading"
        :data="records"
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column prop="certNo" label="证书编号" width="180" />
        <el-table-column prop="factoryNo" label="出厂编号" width="120" />
        <el-table-column prop="enterpriseName" label="企业名称" min-width="150" />
        <el-table-column prop="instrumentName" label="器具名称" width="120" />
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
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleView(row)">查看</el-button>
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </div>
    
    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="证书编号" prop="certNo">
              <el-input v-model="form.certNo" placeholder="请输入证书编号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="出厂编号" prop="factoryNo">
              <el-input v-model="form.factoryNo" placeholder="请输入出厂编号" />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="企业名称" prop="enterpriseName">
              <el-input v-model="form.enterpriseName" placeholder="请输入企业名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="器具名称" prop="instrumentName">
              <el-input v-model="form.instrumentName" placeholder="请输入器具名称" />
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="辖区" prop="district">
              <el-select v-model="form.district" placeholder="请选择辖区" style="width: 100%">
                <el-option
                  v-for="item in districtOptions"
                  :key="item"
                  :label="item"
                  :value="item"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="检定结论" prop="conclusion">
              <el-select v-model="form.conclusion" placeholder="请选择结论" style="width: 100%">
                <el-option label="合格" value="合格" />
                <el-option label="不合格" value="不合格" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="检定日期" prop="verificationDate">
              <el-date-picker
                v-model="form.verificationDate"
                type="date"
                placeholder="选择日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="到期日期">
              <el-date-picker
                v-model="form.expiryDate"
                type="date"
                placeholder="自动计算"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>
    
    <!-- 详情弹窗 -->
    <el-dialog
      v-model="detailVisible"
      title="检定记录详情"
      width="600px"
    >
      <el-descriptions :column="2" border>
        <el-descriptions-item label="证书编号">{{ currentRecord.certNo }}</el-descriptions-item>
        <el-descriptions-item label="出厂编号">{{ currentRecord.factoryNo }}</el-descriptions-item>
        <el-descriptions-item label="企业名称">{{ currentRecord.enterpriseName }}</el-descriptions-item>
        <el-descriptions-item label="器具名称">{{ currentRecord.instrumentName }}</el-descriptions-item>
        <el-descriptions-item label="型号规格">{{ currentRecord.modelSpec }}</el-descriptions-item>
        <el-descriptions-item label="制造单位">{{ currentRecord.manufacturer }}</el-descriptions-item>
        <el-descriptions-item label="辖区">{{ currentRecord.district }}</el-descriptions-item>
        <el-descriptions-item label="检定结论">
          <el-tag :type="currentRecord.conclusion === '合格' ? 'success' : 'danger'" size="small">
            {{ currentRecord.conclusion }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="检定日期">{{ currentRecord.verificationDate }}</el-descriptions-item>
        <el-descriptions-item label="到期日期">{{ currentRecord.expiryDate }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { districts } from '@/api/config'

const districtOptions = districts

const loading = ref(false)
const submitting = ref(false)
const records = ref([])
const total = ref(0)
const selectedRows = ref([])

const filters = reactive({
  keyword: '',
  district: '',
  conclusion: ''
})

const pagination = reactive({
  page: 1,
  pageSize: 10
})

// 弹窗相关
const dialogVisible = ref(false)
const dialogTitle = computed(() => (form.id ? '编辑记录' : '新增记录'))
const detailVisible = ref(false)
const currentRecord = ref({})
const formRef = ref()

const form = reactive({
  id: '',
  certNo: '',
  factoryNo: '',
  enterpriseName: '',
  instrumentName: '',
  modelSpec: '',
  manufacturer: '',
  district: '',
  conclusion: '合格',
  verificationDate: '',
  expiryDate: ''
})

const rules = {
  certNo: [{ required: true, message: '请输入证书编号', trigger: 'blur' }],
  factoryNo: [{ required: true, message: '请输入出厂编号', trigger: 'blur' }],
  enterpriseName: [{ required: true, message: '请输入企业名称', trigger: 'blur' }],
  district: [{ required: true, message: '请选择辖区', trigger: 'change' }],
  conclusion: [{ required: true, message: '请选择检定结论', trigger: 'change' }],
  verificationDate: [{ required: true, message: '请选择检定日期', trigger: 'change' }]
}

// 加载数据
const loadData = async () => {
  loading.value = true
  
  // 模拟数据
  const mockData = []
  for (let i = 1; i <= 50; i++) {
    mockData.push({
      _id: String(i),
      certNo: `JL-2024-${String(i).padStart(6, '0')}`,
      factoryNo: `PB-${String(i).padStart(4, '0')}`,
      enterpriseName: `企业${i}`,
      instrumentName: '压力表',
      modelSpec: 'Y-100',
      manufacturer: '温州仪表厂',
      district: districtOptions[i % districtOptions.length],
      conclusion: i % 10 === 0 ? '不合格' : '合格',
      verificationDate: dayjs().subtract(i, 'day').format('YYYY-MM-DD'),
      expiryDate: dayjs().subtract(i, 'day').add(6, 'month').format('YYYY-MM-DD')
    })
  }
  
  records.value = mockData
  total.value = mockData.length
  
  loading.value = false
}

// 搜索
const handleSearch = () => {
  pagination.page = 1
  loadData()
}

// 重置
const handleReset = () => {
  filters.keyword = ''
  filters.district = ''
  filters.conclusion = ''
  handleSearch()
}

// 判断是否即将到期
const isExpiring = (date) => {
  if (!date) return false
  const expiry = dayjs(date)
  const now = dayjs()
  const diff = expiry.diff(now, 'day')
  return diff <= 30
}

// 选择变化
const handleSelectionChange = (rows) => {
  selectedRows.value = rows
}

// 分页
const handleSizeChange = (size) => {
  pagination.pageSize = size
  loadData()
}

const handlePageChange = (page) => {
  pagination.page = page
  loadData()
}

// 新增
const handleAdd = () => {
  Object.assign(form, {
    id: '',
    certNo: '',
    factoryNo: '',
    enterpriseName: '',
    instrumentName: '压力表',
    modelSpec: '',
    manufacturer: '',
    district: '',
    conclusion: '合格',
    verificationDate: '',
    expiryDate: ''
  })
  dialogVisible.value = true
}

// 编辑
const handleEdit = (row) => {
  Object.assign(form, {
    id: row._id,
    certNo: row.certNo,
    factoryNo: row.factoryNo,
    enterpriseName: row.enterpriseName,
    instrumentName: row.instrumentName,
    modelSpec: row.modelSpec,
    manufacturer: row.manufacturer,
    district: row.district,
    conclusion: row.conclusion,
    verificationDate: row.verificationDate,
    expiryDate: row.expiryDate
  })
  dialogVisible.value = true
}

// 查看
const handleView = (row) => {
  currentRecord.value = row
  detailVisible.value = true
}

// 删除
const handleDelete = (row) => {
  ElMessageBox.confirm('确定要删除该记录吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    records.value = records.value.filter(r => r._id !== row._id)
    total.value--
    ElMessage.success('删除成功')
  }).catch(() => {})
}

// 提交
const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  
  submitting.value = true
  
  // 模拟提交
  setTimeout(() => {
    if (form.id) {
      const index = records.value.findIndex(r => r._id === form.id)
      if (index > -1) {
        records.value[index] = { ...records.value[index], ...form }
      }
      ElMessage.success('编辑成功')
    } else {
      records.value.unshift({
        _id: Date.now().toString(),
        ...form
      })
      total.value++
      ElMessage.success('新增成功')
    }
    
    dialogVisible.value = false
    submitting.value = false
  }, 500)
}

// 导出
const handleExport = () => {
  ElMessage.info('导出功能开发中...')
}

onMounted(() => {
  loadData()
})
</script>

<style lang="scss" scoped>
.records-page {
  .filter-section {
    background: #fff;
    padding: 20px;
    border-radius: 12px;
    margin-bottom: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  }
  
  .table-section {
    background: #fff;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
    
    .table-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      
      .total {
        color: #909399;
      }
    }
    
    .pagination {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
    }
  }
  
  .text-danger {
    color: #f56c6c;
  }
}
</style>
