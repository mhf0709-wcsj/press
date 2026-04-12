/**
 * 附件上传组件
 * 支持多图片上传、进度显示、删除重传、缩略图预览
 */
Component({
  properties: {
    // 已上传的文件列表
    files: {
      type: Array,
      value: []
    },
    // 最大上传数量
    maxCount: {
      type: Number,
      value: 9
    },
    // 最大文件大小（MB）
    maxSize: {
      type: Number,
      value: 10
    },
    // 是否禁用
    disabled: {
      type: Boolean,
      value: false
    },
    // 上传目录
    cloudPath: {
      type: String,
      value: 'uploads'
    }
  },

  data: {
    uploading: false,
    uploadProgress: 0
  },

  methods: {
    // 选择图片
    chooseImage() {
      if (this.data.disabled || this.data.uploading) return
      if (this.properties.files.length >= this.properties.maxCount) {
        wx.showToast({ title: `最多上传${this.properties.maxCount}张图片`, icon: 'none' })
        return
      }

      const remainCount = this.properties.maxCount - this.properties.files.length

      wx.chooseMedia({
        count: remainCount,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const tempFiles = res.tempFiles.map(file => file.tempFilePath)
          this.uploadFiles(tempFiles)
        }
      })
    },

    // 上传文件
    async uploadFiles(filePaths) {
      this.setData({ uploading: true, uploadProgress: 0 })
      
      const uploadedFiles = []
      const totalCount = filePaths.length

      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i]
        const cloudPath = `${this.properties.cloudPath}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`

        try {
          const result = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: filePath
          })

          uploadedFiles.push({
            fileID: result.fileID,
            localPath: filePath,
            status: 'success'
          })

          this.setData({
            uploadProgress: Math.round(((i + 1) / totalCount) * 100)
          })
        } catch (err) {
          console.error('上传失败:', err)
          uploadedFiles.push({
            localPath: filePath,
            status: 'error',
            error: err.message
          })
        }
      }

      this.setData({ uploading: false, uploadProgress: 0 })

      // 触发事件
      const allFiles = [...this.properties.files, ...uploadedFiles]
      this.triggerEvent('change', { files: allFiles })
      this.triggerEvent('upload', { files: uploadedFiles })
    },

    // 预览图片
    previewImage(e) {
      const index = e.currentTarget.dataset.index
      const urls = this.properties.files
        .filter(f => f.fileID || f.localPath)
        .map(f => f.fileID || f.localPath)
      
      wx.previewImage({
        current: urls[index],
        urls: urls
      })
    },

    // 删除图片
    deleteImage(e) {
      const index = e.currentTarget.dataset.index
      const files = [...this.properties.files]
      const removedFile = files.splice(index, 1)[0]
      
      this.triggerEvent('change', { files })
      this.triggerEvent('remove', { file: removedFile, index })
    },

    // 重试上传
    retryUpload(e) {
      const index = e.currentTarget.dataset.index
      const file = this.properties.files[index]
      
      if (file.localPath && file.status === 'error') {
        // 重新上传
        this.uploadFiles([file.localPath])
      }
    }
  }
})
