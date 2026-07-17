# 项目维护手册

本文档合并原来的产品方案、上线检查、环境变量、数据库初始化、索引建议、AI 管家 CRUD 方案和 Bug 修复记录，只保留当前仍有用的内容。

## 1. 产品口径

当前产品围绕“企业设备 - 压力表 - 检定记录 - AI 管家 - 管理端监管”展开。

保留能力：

- 企业注册、登录和微信账号绑定补全企业信息
- 企业先建设备，再为压力表选择所属设备
- AI 管家上传图片识别证书，并包装成 AI 识别建档
- AI 管家支持知识问答、数据查询、对话式修改
- 压力表支持换绑所属设备
- 压力表列表支持左滑删除，删除后管理端留痕
- 管理端查看总览、风险企业、台账和删除记录

下线能力：

- 二维码生成、设备码、压力表码
- 扫码核验、现场核验
- 旧工作台 `task-center`
- 旧执法页 `enforcement`
- 旧云函数 `generateQRCode`、`regulator`、`quickstartFunctions`、`imagePreprocess`

## 2. 数据关系

核心集合：

- `enterprises`：企业账号、企业信息、微信绑定信息
- `equipments`：企业设备台账
- `devices`：压力表档案
- `pressure_records`：压力表检定记录
- `deletion_logs`：删除留痕
- `admins`：管理端账号
- `auth_sessions`：管理端短期会话，仅云函数可读写
- `kb_docs`、`kb_chunks`：AI 知识库
- `enterprise_alert_settings`、`expiry_alert_logs`：提醒配置和日志
- `enterprise_notifications`：监管整改任务、企业反馈和复核状态
- `operation_logs`：人工、AI、Excel、审核及整改操作的统一审计日志

业务关系：

- 一个企业可以有多个设备。
- 一个设备可以绑定多个压力表。
- 一个压力表当前只属于一个设备。
- 压力表换绑后，需要同步新旧设备的绑定数量。
- 删除压力表后，需要清理设备侧绑定残留，并写入 `deletion_logs`。

## 3. 云函数环境变量

`aiAssistant`：

- `DASHSCOPE_API_KEY`：百炼 / 通义千问 API Key
- `DASHSCOPE_MODEL`：模型名称，建议 `qwen3.5-flash`
- `DASHSCOPE_ENDPOINT`：可选，默认兼容 OpenAI 格式接口

`baiduOcr`：

- `BAIDU_API_KEY`
- `BAIDU_SECRET_KEY`

`expiryReminder`：

- `DEVICE_EXPIRY_TEMPLATE_ID`：设备到期提醒订阅消息模板 ID，可选
- `REMINDER_TASK_SECRET`：定时扫描任务调用密钥

`initAdmin`：

- `INITIAL_ADMIN_USERNAME`：首次管理员用户名
- `INITIAL_ADMIN_PASSWORD`：首次管理员强密码，至少 8 位且包含字母和数字
- `ADMIN_BOOTSTRAP_SECRET`：一次性初始化调用密钥

`dataMaintenance`：

- `MAINTENANCE_SECRET`：数据维护任务调用密钥

安全要求：

- 不要把 API Key、Secret、Token 写死在代码里。
- 已经暴露过的密钥必须废弃并重新生成。
- 正式环境部署前，逐个云函数确认环境变量已配置。

## 4. 建议数据库索引

`pressure_records`：

- `enterpriseName ASC + createTime DESC`：企业端记录列表
- `enterpriseName ASC + _openid ASC + expiryDate ASC`：企业端到期统计
- `enterpriseName ASC + status ASC + createTime DESC`：按状态筛选

`enterprise_notifications`：

- `enterpriseId ASC + status ASC + createdAt DESC`：企业待办提醒
- `district ASC + taskStatus ASC + createdAt DESC`：管理端整改任务

`operation_logs`：

- `enterpriseName ASC + timestamp DESC`：企业端跨端版本检查与操作轨迹
- `district ASC + timestamp DESC`：辖区管理端跨端版本检查与审计查询
- `timestamp DESC`：总管理端全局数据版本检查
- `entityType ASC + entityId ASC + createdAt DESC`：单条数据变更历史
- `enterpriseName ASC + deviceId ASC + createTime DESC`：压力表详情历史记录
- `district ASC + expiryDate ASC + status ASC`：管理端辖区风险查询
- `expiryDate ASC + status ASC`：全局到期查询

`devices`：

- `enterpriseName ASC + createTime DESC`：企业端压力表列表
- `enterpriseName ASC + equipmentId ASC + status ASC`：设备详情绑定压力表
- `enterpriseName ASC + isDeleted ASC + createTime DESC`：过滤已删除压力表
- `enterpriseName ASC + isDeleted ASC + status ASC + updateTime DESC`：设备中心停用/报废列表
- `enterpriseName ASC + isDeleted ASC + latestExpiryDate ASC`：设备中心逾期统计

`equipments`：

- `enterpriseName ASC + createTime DESC`：设备中心设备列表
- `enterpriseName ASC + district ASC`：辖区筛选

`deletion_logs`：

- `enterpriseName ASC + deleteTime DESC`：企业删除记录查看
- `operatorOpenid ASC + deleteTime DESC`：按操作人追溯

## 5. AI 管家 CRUD 规则

AI 管家不能直接绕过业务规则改库，推荐链路是：

1. 大模型理解自然语言。
2. 服务端做字段白名单校验。
3. 服务端匹配目标记录。
4. AI 生成“待确认变更摘要”。
5. 用户确认后执行。
6. 写入操作结果和必要日志。

允许对话示例：

- “帮我查一下编号为 2 的压力表”
- “把刚才那条记录的型号改成 XXX”
- “把这块压力表改成报废”
- “把这块压力表换绑到洗衣机”
- “删除刚才识别错的那条记录”

字段白名单建议：

- 压力表名称
- 压力表编号
- 出厂编号
- 证书编号
- 型号规格
- 制造单位
- 送检单位
- 检定日期
- 检定结论
- 所属设备
- 使用状态

高风险动作必须确认：

- 删除记录
- 换绑设备
- 修改检定结论
- 修改企业归属
- 批量修改

## 6. 上线前检查

代码检查：

- `miniprogram/app.json` 页面清单和真实页面一致。
- 小程序开发者工具重新编译，无 WXML / JS 报错。
- 运行代码中无明显乱码。
- 运行代码中无旧功能入口引用。
- 启用组件按需注入、代码压缩、WXML/WXSS 压缩和 `setData` 数据校验。
- 业务成功后立即跳转，不使用人为延时制造等待。
- 根目录不保留无用 `node_modules`、测试包、临时文件。

云函数检查：

- 正式环境部署 `aiAssistant`、`baiduOcr`、`batchImport`、`enterpriseAuth`、`dataAccess`、`expiryReminder`、`initAdmin`、`dataMaintenance`。
- 环境变量已在云开发控制台配置。
- 正式环境和体验版使用同一个目标云环境。

企业端冒烟：

- 企业注册登录正常。
- 未建设备时能引导先建设备。
- AI 管家可上传图片并识别。
- 识别后可确认、修改并保存。
- 压力表列表可点击详情。
- 管理端可下发带期限的整改任务，企业可提交说明和图片，管理端可复核通过或退回。
- 新增、修改、删除、AI、Excel、审核和整改操作均写入 `operation_logs`。
- 左滑删除后列表立即刷新。
- 删除后设备绑定数量同步更新。

管理端冒烟：

- 使用云端已初始化的管理员账号登录，代码中不存在默认密码。
- 预览平台数据正常。
- 管理工作台入口清晰。
- 台账中心可筛选数据。
- 重点企业只展示风险企业。
- 可查看企业删除记录留痕。

提审说明：

- 只描述当前保留功能。
- 不提二维码、扫码、现场核验。
- 隐私协议与图片上传、微信登录、AI 识别用途保持一致。

## 7. 常见问题

日期错误：

- 不要把字符串日期直接当 `Date` 对象使用。
- 计算前转 `Date`，展示时再格式化。

乱码问题：

- 发现 WXML 标签损坏、JS 字符串未闭合、中文乱码时，优先整段重写。
- 不要在历史乱码片段上继续追加逻辑。

删除残留：

- 删除压力表后同步处理设备侧绑定关系。
- 删除动作写入 `deletion_logs`。
- 前端删除成功后立即从列表移除，不依赖重新加载页面。

权限差异：

- iOS、鸿蒙、开发者工具数据不一致时，优先检查登录态、云环境、云函数权限和集合权限。

## 8. 正式环境数据权限

小程序端不再直接调用数据库集合，所有业务数据统一经过 `dataAccess`、`enterpriseAuth`、`aiAssistant` 和 `expiryReminder` 云函数校验。

云开发控制台中，下列集合应设置为“所有用户不可直接读写”或等价的自定义安全规则；云函数使用服务端 SDK，不受客户端规则影响：

- `admins`
- `auth_sessions`
- `enterprises`
- `equipments`
- `devices`
- `pressure_records`
- `deletion_logs`
- `lifecycle_logs`
- `enterprise_alert_settings`
- `enterprise_notifications`
- `expiry_alert_logs`
- `operation_logs`
- `kb_docs`
- `kb_chunks`

管理员旧明文密码会在首次成功登录时自动升级为 PBKDF2 加盐哈希，并删除原 `password` 字段。登录连续失败 5 次后锁定 15 分钟，管理会话有效期为 12 小时。

## 9. 正式版自动验收

每次上传体验版或正式版之前，在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/pre-release-check.ps1
```

安全脚本检查正式版云函数是否完整、前端是否绕过云函数直连数据库、是否存在常见硬编码密钥，以及隐私检查、sitemap 和 JavaScript 语法是否正常。

`config/production-baseline.json` 是正式环境基线。云开发控制台必须逐项确认其中列出的集合均禁止客户端直接读写，环境变量已经配置，`webAdmin` 保持停用。

## 10. AI 识别回归测试

`tests/ai-extraction/fixtures.json` 保存脱敏 OCR 文本和预期字段，不保存真实企业证书照片。当前重点校验型号规格中的全角符号和空格单位、检定日期与有效期至的区分、非法日期拦截，以及模型错误结果的规则回退。

每发现一种真实误识别，先脱敏后增加一条测试样本，再修正规则。正式灰度前应扩充到至少 50 份不同版式证书，证书编号、出厂编号、型号规格、检定日期四个关键字段准确率应达到 95% 以上。

## 11. 隐私与提审口径

公众平台隐私保护指引和小程序内隐私说明必须保持一致，并明确以下处理活动：

- 微信账号标识用于识别企业账号和隔离企业数据
- 企业名称、统一社会信用代码、法人姓名和联系电话用于企业注册、绑定和监管联系
- 相机或相册图片用于上传压力表检定证书和安装照片
- 设备、压力表及检定记录用于企业台账管理和辖区监管
- 证书图片存储在腾讯云存储，图片文字交由百度 OCR 识别，识别文本交由阿里云百炼模型辅助整理

提审描述建议使用：

> 压力表智能管家面向压力表使用企业和监管人员，提供企业设备建档、压力表检定证书智能识别、检定台账维护、到期风险查看及辖区监管功能。AI 识别结果在保存前均由用户确认和修改。

不要宣称 AI 自动作出检定结论。检定结论以用户上传的正式检定证书和人工确认记录为准。

## 12. 小范围企业灰度

首轮选择 3 至 5 家企业，连续运行 7 天。每家企业至少完成设备创建、30 条证书识别、修改保存、换绑、删除留痕和逾期筛选。

达到以下门槛后再扩大范围：

- 企业、辖区和总管理员之间不存在越权数据
- 新增、修改和删除后当前页面及返回页面数据立即一致
- 仪表盘与台账人工抽查结果一致，误差为 0
- 建档保存成功率不低于 99%
- AI 四个关键字段准确率不低于 95%，总体字段准确率不低于 90%
- 无阻断登录、保存或详情查看的高优先级问题
- 云函数错误率、OCR/AI 调用量和每日费用处于可接受范围

涉及数据越权、错误删除、统计错误或无法保存的问题必须停止扩量并优先修复。
