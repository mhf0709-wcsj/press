# AI 管家对话式 CRUD 一期方案

## 目标

让 AI 管家支持通过对话完成台账数据的查询、修改、删除，并为后续新增能力预留结构。

一期重点：

- 查询压力表、设备、检定记录
- 修改压力表、设备、检定记录的部分白名单字段
- 删除单条压力表、设备、检定记录
- 多命中时要求用户先选定目标
- 高风险操作先确认再执行

## 已落地代码

- 云函数入口扩展：
  - `cloudfunctions/aiAssistant/index.js`
- CRUD 规划与执行模块：
  - `cloudfunctions/aiAssistant/crud.js`

## 新增云函数动作

### 1. `crudPlan`

用途：

- 识别用户是否在做 CRUD 操作
- 识别操作类型、实体类型、目标对象、修改字段
- 查询命中结果
- 返回执行计划、确认文案或候选列表

请求示例：

```json
{
  "action": "crudPlan",
  "question": "把出厂编号24013931的压力表状态改成停用",
  "userType": "enterprise",
  "userInfo": {
    "companyName": "示例企业"
  }
}
```

返回示例：

```json
{
  "success": true,
  "mode": "confirm",
  "operation": "update",
  "entity": "device",
  "entityLabel": "压力表",
  "needConfirm": true,
  "answer": "我准备将压力表「压力表A」修改为：status=停用，是否确认？",
  "items": [
    {
      "id": "xxx",
      "title": "压力表A",
      "subtitle": "24013931"
    }
  ],
  "payload": {
    "operation": "update",
    "entity": "device",
    "targetId": "xxx",
    "changes": {
      "status": "停用"
    }
  }
}
```

### 2. `crudExecute`

用途：

- 接收前端确认后的结构化 payload
- 再次校验权限
- 执行修改或删除

请求示例：

```json
{
  "action": "crudExecute",
  "payload": {
    "operation": "update",
    "entity": "device",
    "targetId": "xxx",
    "changes": {
      "status": "停用"
    }
  },
  "userType": "enterprise",
  "userInfo": {
    "companyName": "示例企业"
  }
}
```

## 当前支持的实体

- `device`
  - 压力表
  - 集合：`devices`
- `equipment`
  - 设备
  - 集合：`equipments`
- `pressure_record`
  - 检定记录
  - 集合：`pressure_records`

## 当前支持的操作

- `query`
- `update`
- `delete`
- `create`
  - 目前先返回补字段提示
  - 还未正式执行落库

## 当前支持的字段白名单

### 压力表 `device`

- `status`
- `installLocation`

### 设备 `equipment`

- `location`
- `district`
- `status`

### 检定记录 `pressure_record`

- `conclusion`
- `verificationDate`
- `sendUnit`

## 当前支持的目标识别方式

- 出厂编号 `factoryNo`
- 证书编号 `certNo`
- 设备编号 `deviceNo`
- 设备号 `equipmentNo`
- 压力表名称 `deviceName`
- 设备名称 `equipmentName`

## 返回模式说明

- `result`
  - 直接返回查询结果
- `confirm`
  - 需要前端显示确认卡
- `select`
  - 命中多条，需要前端先让用户选择
- `collect`
  - 信息不足，需要继续追问

## 前端接入建议

在 `miniprogram/pages/ai-assistant/ai-assistant.js` 中新增两条链路：

1. 用户发送消息时，先调用 `crudPlan`
2. 如果返回：
   - `result`：直接渲染结果卡
   - `confirm`：渲染确认卡，点击“确认执行”后再调用 `crudExecute`
   - `select`：渲染候选列表卡
   - `collect`：让 AI 继续追问
3. 如果 `crudPlan` 判断不是 CRUD，再回到原来的问答链路

## 推荐的一期前端消息卡类型

- `crud-result`
- `crud-confirm`
- `crud-select`
- `crud-error`

## 建议优先支持的对话句式

### 查询

- 查一下出厂编号 24013931 的压力表
- 查询黄坦所的设备
- 找一下证书编号 P2601008 的检定记录

### 修改

- 把出厂编号 24013931 的压力表状态改成停用
- 把这条记录的检定日期改成 2026-04-17
- 把 1 号设备的位置改成泵房二层

### 删除

- 删除出厂编号 24013931 的压力表
- 删除证书编号 P2601008 的检定记录

## 二期建议

- 支持新增正式落库
- 支持多轮补字段
- 支持字段级中文别名映射
- 支持操作审计日志
- 支持“刚才那条”“上一条”这类上下文引用
- 支持批量查询与批量修改
