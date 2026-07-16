const MAX_EXCEL_SIZE = 10 * 1024 * 1024
const XLSX_SIGNATURE = [0x50, 0x4b]
const XLS_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0]

class BatchImportService {
  async chooseExcelFile() {
    return new Promise((resolve, reject) => {
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['xlsx'],
        success: (res) => {
          const file = res?.tempFiles?.[0]
          if (!file) {
            reject(new Error('未获取到 Excel 文件'))
            return
          }
          if (Number(file.size || 0) > MAX_EXCEL_SIZE) {
            reject(new Error('Excel 文件不能超过 10MB'))
            return
          }
          this.validateExcelFile(file).then(() => resolve(file)).catch(reject)
        },
        fail: reject
      })
    })
  }

  async validateExcelFile(file) {
    const fileName = String(file?.name || file?.path || '').toLowerCase()
    if (!fileName.endsWith('.xlsx')) {
      throw new Error('当前仅支持 .xlsx 文件，请在 Excel 或 WPS 中另存为“Excel 工作簿（.xlsx）”。')
    }

    const header = await this.readFileHeader(file.path)
    if (this.matchesSignature(header, XLS_SIGNATURE)) {
      throw new Error('检测到旧版 .xls 文件，请先另存为 .xlsx 后再导入。')
    }
    if (!this.matchesSignature(header, XLSX_SIGNATURE)) {
      throw new Error('文件内容不是有效的 .xlsx 工作簿，请重新保存后再导入。')
    }
  }

  readFileHeader(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        position: 0,
        length: 8,
        success: (res) => resolve(new Uint8Array(res.data)),
        fail: () => reject(new Error('无法读取 Excel 文件，请重新选择。'))
      })
    })
  }

  matchesSignature(bytes, signature) {
    return signature.every((value, index) => bytes[index] === value)
  }

  async uploadAndParse(file) {
    const cloudPath = `batch-import/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xlsx`
    const upload = await wx.cloud.uploadFile({ cloudPath, filePath: file.path })
    try {
      const result = await this.callFunction('parseExcel', {
        fileID: upload.fileID,
        fileName: file.name || ''
      })
      return { ...result, fileID: upload.fileID }
    } catch (error) {
      await this.deleteFile(upload.fileID)
      throw error
    }
  }

  async commit(rows) {
    return this.callFunction('commitExcel', { rows })
  }

  async callFunction(action, payload) {
    try {
      const response = await wx.cloud.callFunction({
        name: 'batchImport',
        data: { action, ...payload }
      })
      const result = response.result || {}
      if (!result.success) {
        const error = new Error(result.error || '批量导入服务异常')
        error.code = result.code || 'BATCH_IMPORT_FAILED'
        error.isBatchImportError = true
        throw error
      }
      return result.data || {}
    } catch (error) {
      if (error?.isBatchImportError) throw error
      const message = this.getCloudErrorMessage(error)
      const normalized = new Error(message)
      normalized.code = error?.code || 'CLOUD_CALL_FAILED'
      throw normalized
    }
  }

  getCloudErrorMessage(error) {
    const raw = String(error?.errMsg || error?.message || '')
    if (/FUNCTION_NOT_FOUND|function.*not.*exist|-501000/i.test(raw)) {
      return '批量导入云函数尚未部署，请联系管理员部署 batchImport。'
    }
    if (/FUNCTIONS_EXECUTE_FAIL|-504002|execute fail/i.test(raw)) {
      return '批量导入云函数执行失败，请重新部署云函数依赖后再试。'
    }
    if (/timeout|-504003/i.test(raw)) {
      return 'Excel 解析超时，请将文件拆分为 100 行以内后重试。'
    }
    if (/storage|uploadFile|downloadFile/i.test(raw)) {
      return 'Excel 文件上传失败，请检查云存储配置和网络后重试。'
    }
    return raw.replace(/^cloud\.callFunction:fail\s*/i, '') || 'Excel 解析失败，请稍后重试。'
  }

  async deleteFile(fileID) {
    if (!fileID) return
    try {
      await wx.cloud.deleteFile({ fileList: [fileID] })
    } catch (error) {}
  }
}

module.exports = new BatchImportService()
