# 压力表检定智能体小程序

企业端和管理端共用的微信小程序项目，核心能力是压力表识别建档、设备台账、AI 管家对话、企业数据管理和监管查看。

## 当前入口

企业端：

- `pages/ai-assistant/ai-assistant`：AI 管家
- `pages/workbench/workbench`：设备中心
- `pages/user/user`：我的

企业端业务页：

- `pages/camera/camera`：确认并保存、手动录入
- `pages/archive/archive`：档案入口
- `pages/detail/detail`：检定记录详情
- `pages/device-list/device-list`：压力表列表
- `pages/device-detail/device-detail`：压力表详情
- `pages/equipment-detail/equipment-detail`：设备详情

管理端：

- `pages/dashboard/dashboard`：预览平台
- `pages/admin-workbench/admin-workbench`：管理工作台
- `pages/admin/admin`：台账中心
- `pages/account-settings/account-settings`：账号信息设置

## 云函数

- `aiAssistant`：AI 管家、对话式查询和修改
- `baiduOcr`：OCR 识别
- `enterpriseAuth`：企业注册、登录、账号信息
- `expiryReminder`：提醒相关接口
- `initAdmin`：初始化管理账号
- `webAdmin`：PC 网页监管端接口

## PC 监管端

PC 网页监管端已拆分到独立目录：

```text
D:\wechatsoftware\pc-admin
```

启动：

```powershell
cd D:\wechatsoftware\pc-admin
& "C:\Program Files\nodejs\npm.cmd" run dev
```

浏览器访问：

```text
http://localhost:3000
```

## 已下线功能

以下能力已从当前主流程移除，不要再写入提审说明或新增入口：

- 二维码生成
- 设备码、压力表码
- 扫码核验
- 现场核验
- 旧工作台 `task-center`
- 旧执法页 `enforcement`

## 更多维护信息

上线检查、环境变量、数据库集合、索引建议、AI 管家 CRUD 口径和常见问题统一维护在：

```text
PROJECT_GUIDE.md
```
