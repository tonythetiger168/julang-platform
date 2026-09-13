# 劇浪 v6.2 後端 API 契約文檔（v1.0）

> 本文件定義前端與後端的接口契約。前端 `api.js` 已按此契約實現重試、超時、離線隊列。

---

## 基礎約定

| 項目 | 值 |
|------|-----|
| Base URL | `http://localhost:3001/api/v1` (dev) / 生產環境同域 |
| Content-Type | `application/json` |
| 認證 | `Authorization: Bearer <token>` |
| 超時 | 15 秒 |
| 重試 | 2 次，指數退避（1s → 2s → 4s）|

---

## 通用響應格式

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

| code | 含義 |
|------|------|
| 200 | 成功 |
| 400 | 請求參數錯誤 |
| 401 | 未認證 / Token 過期 |
| 403 | 無權限 |
| 404 | 資源不存在 |
| 429 | 請求過頻 |
| 500 | 服務器內部錯誤 |
| 0 | 網絡錯誤（前端定義）|
| 408 | 請求超時（前端定義）|
| -1 | 離線排隊（前端定義）|

---

## 認證模組

### POST /auth/register
**請求：**
```json
{
  "phone": "13800138000",
  "password": "sha256_hash",
  "nickname": "用戶名"
}
```

**響應：**
```json
{
  "code": 200,
  "data": {
    "token": "jwt_token",
    "user": { "id": "uuid", "phone": "13800138000", "nickname": "用戶名" }
  }
}
```

> 後端注意：password 字段為前端 SHA-256 哈希值，後端需存儲時再次哈希（bcrypt/argon2）。

### POST /auth/login
**請求：**
```json
{
  "phone": "13800138000",
  "password": "sha256_hash"
}
```

**響應：** 同 register

### POST /auth/refresh
**響應：**
```json
{
  "code": 200,
  "data": { "token": "new_jwt_token" }
}
```

---

## 短劇模組

### GET /dramas/recommend?limit=50&offset=0
**響應：**
```json
{
  "code": 200,
  "data": {
    "list": [
      {
        "id": "drama_uuid",
        "title": "劇名",
        "cover": "https://...",
        "category": "甜寵",
        "episodes": 80,
        "isFree": true,
        "views": 1200000,
        "rating": 4.8,
        "desc": "簡介..."
      }
    ],
    "total": 1000
  }
}
```

### GET /dramas/:id
**響應：** 單部短劇詳情（含 episodes 數組）

### GET /categories
**響應：**
```json
{
  "code": 200,
  "data": [
    { "id": "cat_id", "name": "甜寵", "icon": "❤️", "dramaCount": 128 }
  ]
}
```

---

## 用戶模組

### GET /coins/balance 🔒
**響應：**
```json
{
  "code": 200,
  "data": { "coins": 1500 }
}
```

### GET /checkin/status 🔒
**響應：**
```json
{
  "code": 200,
  "data": { "canCheckin": true, "streak": 4, "nextReward": 15, "rewards": [] }
}
```

### POST /checkin/daily 🔒
**響應：**
```json
{
  "code": 200,
  "data": {
    "streak": 5,
    "coins": 15,
    "coinsEarned": 15,
    "streakDays": 5,
    "totalCoins": 1515
  }
}
```
**錯誤：** 400 今日已簽到（含並發重複提交）

### GET /user/follows
**響應：** 追劇列表

---

## 硬幣經濟模組（v7.1+）

### GET /coins/packages
**響應：** 硬幣包列表（mini / standard / mega / ultra）

### POST /coins/purchase 🔒
**請求：** `{ "packageId": "standard", "clientOrderId": "可選，冪等鍵" }`
**說明：** `PAYMENT_MOCK=false` 時僅建立 pending 訂單，需支付網關回調確認後發幣

### POST /coins/unlock 🔒
**請求：** `{ "dramaId": "d1", "episodeId": "e1" }`
**錯誤：** 402 硬幣不足

### POST /coins/binge-reward 🔒
**請求：** `{ "count": 3 }`（3 集 +5 幣 / 5 集 +10 幣，每檔每日限一次）

### GET /coins/unlocked/:dramaId 🔒
**響應：** 已解鎖集數 ID 列表

---

## 廣告激勵模組（v7.1+）

### GET /ads/status 🔒
**響應：** `{ "watched": 3, "limit": 15, "reward": 2, "remaining": 12 }`

### POST /ads/watch 🔒
**限制：** 每日 15 次，兩次間隔 ≥ 10 秒
**錯誤：** 429 次數用完 / 觀看過於頻繁

---

## 禮品碼模組（v7.1+）

### POST /giftcodes/redeem 🔒
**請求：** `{ "code": "JULANG2026" }`
**錯誤：** 404 無效 / 400 已過期·已兌換·已兌完 / 403 僅 VIP

---

## 訂閱模組（v7.0+，掛載於 /subscription 單數）

### GET /subscription 🔒
### GET /subscription/plans
### POST /subscription/upgrade 🔒
**請求：** `{ "plan": "weekly|pro|team", "duration": 1 }`
### POST /subscription/downgrade 🔒
### POST /subscription/cancel 🔒

---

## AI 模組

### POST /ai/comics
**請求：**
```json
{
  "theme": "主題",
  "style": "ink",
  "episodes": 6
}
```

**響應：**
```json
{
  "code": 200,
  "data": { "taskId": "task_uuid" }
}
```

### GET /ai/tasks
**響應：** 任務列表（輪詢用）

### GET /ai/tasks/:id
**響應：** 單任務狀態

---

## 社區模組

### GET /community/works
### POST /community/works/:id/like
### POST /community/works/:id/favorite
### POST /community/works/:id/comments

---

## 素材庫模組（v6.2 新增）

### GET /assets
**響應：** 用戶雲端素材列表

### POST /assets
**請求：** multipart/form-data（文件上傳）

### DELETE /assets/:id

### POST /assets/sync
**請求：**
```json
{
  "localAssets": [
    { "id": "local_id", "hash": "sha256", "modifiedAt": "2026-08-23T..." }
  ]
}
```

**響應：** 差異列表（需上傳 / 需下載 / 衝突）

---

## 編劇草稿模組（v6.2 新增）

### GET /drafts
**響應：** 草稿列表

### POST /drafts
**請求：**
```json
{
  "title": "草稿標題",
  "content": "劇本內容",
  "outline": "大綱",
  "tags": ["tag1"]
}
```

### PUT /drafts/:id

### DELETE /drafts/:id

---

## 監控模組（v6.2 新增）

### POST /monitor/error
**請求：** 前端錯誤報告（見 monitor.js）

### POST /monitor/vitals
**請求：** Web Vitals 數據

---

## 實現狀態對照

| 接口 | 前端實現 | 後端實現 | 備註 |
|------|---------|---------|------|
| /auth/* | ✅ | ⏳ | 需支持 SHA-256 密碼 |
| /dramas/* | ✅ | ⏳ | |
| /categories | ✅ | ⏳ | |
| /user/* | ✅ | ⏳ | |
| /ai/* | ✅ | ⏳ | |
| /community/* | ✅ | ⏳ | |
| /assets/* | ✅ (IndexedDB) | ✅ | v6.2 新增，v7.2 已掛載 |
| /drafts/* | ✅ (localStorage) | ✅ | v6.2 新增，v7.2 已掛載 |
| /monitor/* | ✅ | ✅ | v6.2 新增，v7.2 已掛載 |
| /coins/* | ✅ | ✅ | v7.1 新增，v7.2 兩段式支付 |
| /checkin/* | ✅ | ✅ | v7.1 新增 |
| /ads/* | ✅ | ✅ | v7.1 新增 |
| /giftcodes/redeem | ✅ | ✅ | v7.1 新增 |
| /subscription/* | ✅ | ✅ | v7.0 新增 |

---

*文檔版本：v2.0 | 對應前端版本：v7.2.0*
