const db = wx.cloud.database()

Page({
  data: {
    companyName: '',
    creditCode: '',
    legalPerson: '',
    phone: '',
    district: '',
    districtIndex: 0,
    districtOptions: ['大峃所', '珊溪所', '巨屿所', '峃口所', '黄坦所', '西坑所', '玉壶所', '南田所', '百丈漈所'],
    loading: false
  },

  onInputCompanyName(e) {
    this.setData({ companyName: e.detail.value })
  },

  onInputCreditCode(e) {
    this.setData({ creditCode: e.detail.value })
  },

  onInputLegalPerson(e) {
    this.setData({ legalPerson: e.detail.value })
  },

  onInputPhone(e) {
    this.setData({ phone: e.detail.value })
  },

  onDistrictChange(e) {
    const index = e.detail.value
    this.setData({ 
      districtIndex: index,
      district: this.data.districtOptions[index]
    })
  },

  handleRegister() {
    const { companyName, creditCode, legalPerson, phone, district } = this.data

    if (!companyName.trim()) {
      wx.showToast({ title: '请输入企业名称', icon: 'none' })
      return
    }

    if (!creditCode.trim()) {
      wx.showToast({ title: '请输入企业信用代码', icon: 'none' })
      return
    }

    if (creditCode.trim().length !== 18) {
      wx.showToast({ title: '信用代码应为18位', icon: 'none' })
      return
    }

    if (!legalPerson.trim()) {
      wx.showToast({ title: '请输入企业法人', icon: 'none' })
      return
    }

    if (!phone.trim()) {
      wx.showToast({ title: '请输入手机号', icon: 'none' })
      return
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' })
      return
    }

    if (!district) {
      wx.showToast({ title: '请选择所在辖区', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '注册中...', mask: true })

    // 先检查是否已存在
    db.collection('enterprises').where({
      companyName: companyName.trim()
    }).get()
      .then(res => {
        if (res.data && res.data.length > 0) {
          wx.hideLoading()
          wx.showToast({ title: '该企业已注册', icon: 'none' })
          this.setData({ loading: false })
          return Promise.reject('已存在')
        }

        // 检查手机号是否被使用
        return db.collection('enterprises').where({
          phone: phone.trim()
        }).get()
      })
      .then(res => {
        if (res.data && res.data.length > 0) {
          wx.hideLoading()
          wx.showToast({ title: '该手机号已被注册', icon: 'none' })
          this.setData({ loading: false })
          return Promise.reject('手机号已使用')
        }

        // 创建新用户
        return db.collection('enterprises').add({
          data: {
            companyName: companyName.trim(),
            creditCode: creditCode.trim().toUpperCase(),
            legalPerson: legalPerson.trim(),
            phone: phone.trim(),
            district: district,
            createTime: new Date(),
            updateTime: new Date()
          }
        })
      })
      .then(res => {
        wx.hideLoading()
        wx.showToast({ title: '注册成功', icon: 'success' })
        
        // 注册成功后跳转到登录页面
        setTimeout(() => {
          wx.navigateBack({
            success: () => {
              wx.showToast({ title: '请登录', icon: 'none', duration: 2000 })
            }
          })
        }, 1500)
      })
      .catch(err => {
        if (err === '已存在' || err === '手机号已使用') return
        wx.hideLoading()
        console.error('注册失败:', err)
        wx.showToast({ title: '注册失败，请重试', icon: 'none' })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },

  goBack() {
    wx.navigateBack()
  }
})
