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
- PC 网页监管端通过 `webAdmin` 云函数读取同一套云数据

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
- `kb_docs`、`kb_chunks`：AI 知识库
- `enterprise_alert_settings`、`expiry_alert_logs`：提醒配置和日志

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

安全要求：

- 不要把 API Key、Secret、Token 写死在代码里。
- 已经暴露过的密钥必须废弃并重新生成。
- 正式环境部署前，逐个云函数确认环境变量已配置。

## 4. 建议数据库索引

`pressure_records`：

- `enterpriseName ASC + createTime DESC`：企业端记录列表
- `enterpriseName ASC + _openid ASC + expiryDate ASC`：企业端到期统计
- `enterpriseName ASC + status ASC + createTime DESC`：按状态筛选
- `enterpriseName ASC + deviceId ASC + createTime DESC`：压力表详情历史记录
- `district ASC + expiryDate ASC + status ASC`：管理端辖区风险查询
- `expiryDate ASC + status ASC`：全局到期查询

`devices`：

- `enterpriseName ASC + createTime DESC`：企业端压力表列表
- `enterpriseName ASC + equipmentId ASC + status ASC`：设备详情绑定压力表
- `enterpriseName ASC + isDeleted ASC + createTime DESC`：过滤已删除压力表

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
- 根目录不保留无用 `node_modules`、测试包、临时文件。

云函数检查：

- 正式环境部署 `aiAssistant`、`baiduOcr`、`enterpriseAuth`、`expiryReminder`、`initAdmin`、`webAdmin`。
- 环境变量已在云开发控制台配置。
- 正式环境和体验版使用同一个目标云环境。

企业端冒烟：

- 企业注册登录正常。
- 未建设备时能引导先建设备。
- AI 管家可上传图片并识别。
- 识别后可确认、修改并保存。
- 压力表列表可点击详情。
- 左滑删除后列表立即刷新。
- 删除后设备绑定数量同步更新。

管理端冒烟：

- `admin / admin123` 可登录。
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
