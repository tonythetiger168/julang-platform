# 🎬 劇浪 (JuLang) - 短劇漫劇平台 v7.0

> PWA 移動端 App：短劇 Agent 工作流 · 智能畫布編輯器 · 靈感社區 · 聚合播放 · 雲端同步 · 多端協作 · 訂閱變現
> 參考產品：小雲雀（短劇 Agent）/ 即夢（智能畫布 + 社區）/ LibreTV（聚合播放）

<p align=center>
  <img src=https://img.shields.io/badge/version-7.0.0-purple />
  <img src=https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white />
  <img src=https://img.shields.io/badge/PostgreSQL-15+-4169E1?logo=postgresql&logoColor=white />
  <img src=https://img.shields.io/badge/Prisma-5.15-2D3748?logo=prisma&logoColor=white />
  <img src=https://img.shields.io/badge/Redis-7+-DC382D?logo=redis&logoColor=white />
  <img src=https://img.shields.io/badge/AI-劇本·繪圖·TTS-a855f7 />
</p>

---

## ✨ v5.0 新增功能

| 功能 | v4.0 | v5.0 |
|------|:----:|:----:|
| AI 劇本生成 | 無 | OpenAI 兼容 LLM 接口 + 內置模板降級 |
| AI 分鏡漫畫 | 無 | OpenAI 兼容文生圖 + 種子占位圖降級 |
| AI 配音 (TTS) | 無 | OpenAI 兼容 Speech 接口 + Web Speech 降級 |
| 漫劇播放器 | 無 | Ken Burns 運鏡 + 轉場 + 字幕 + 自動連播 |
| 生成任務系統 | 無 | 異步流水線 + 進度輪詢 + 階段上報 |
| AI 創作工作室 | 無 | 向導式 UI：創意 → 參數 → 生成 → 觀看 |
| Schema 修復 | 8 處關聯錯誤 | 全部修復，validate 通過 |
| 路由修復 | creators 未掛載 | 掛載 + `/me` 與 `/:id` 順序修正 |


---

## ✨ v6.0 新增功能（PWA 移動端 App）

| 功能 | 說明 | 參考 |
|------|------|------|
| 短劇 Agent 工作流 | 劇本上傳 → 故事藍圖 → 角色卡（AI 形象 + 音色綁定）→ 分鏡預覽 → 一鍵成片 | 小雲雀 |
| 智能畫布編輯器 | 分鏡網格編輯：台詞/運鏡/轉場/時長修改、單格 AI 重繪、整部換畫風 | 即夢 |
| 靈感社區 | 作品流（最熱/最新 + 畫風篩選）、點贊、收藏、一鍵做同款（復刻） | 即夢 |
| 聚合搜索 | `/api/v1/search/all` 一次搜索短劇 + 漫劇 + 創作者 | LibreTV |
| PWA 能力 | manifest 安裝、Service Worker 離線緩存、觀看歷史本地存儲、安裝橫幅 | LibreTV |
| 角色一致性 | `characters` 表保存外觀提示詞與頭像，分鏡生圖時注入角色名保證連貫 | 小雲雀 |
| 多輪改稿（深化） | 藍圖修訂對話：輸入意見 → AI 保留結構改內容，版本號遞增 | 小雲雀 |
| 批次重繪 + 撤銷（深化） | 畫布多選模式批次重繪；每格 10 步撤銷堆疊（`history` JSON） | 即夢 |
| 評論系統（深化） | 作品詳情頁 + 評論列表/發表/刪除（可選登入識別 mine） | 即夢 |
| 倍速 + 續播（深化） | 0.75–2x 倍速（語音同步變速）、播放進度 localStorage 記憶續播、歷史單條刪除 | LibreTV |
| 無限創作畫布 | 五種節點（文本/腳本/圖片/視頻/音頻）+ 拖曳連線 + 拓撲序一鍵執行 + 本地保存 | LibTV |
| 分鏡腳本表 | 腳本節點生成結構化分鏡表（時長/畫面/角色/景別/運鏡），勾選批量出分鏡圖節點 | LibTV |
| Slash 快捷命令 | 圖片節點輸入 `/`：多機位九宮格/劇情推演四宮格/角色三視圖/25 宮格/光影矯正/畫面推演 | LibTV |
| 圖像工具集 | 高清放大/擴圖/摳圖/多角度/打光，一鍵作用於圖片節點 | LibTV |
| 視頻合成時間軸 | 多視頻節點片段排序/裁剪起止點/順序預覽/合成導出 | LibTV |
| 多模型庫 | 圖像 10 款（GPT Image 2 榜首 / FLUX.2 開源多參考 / Midjourney V8.1 / Nano Banana Pro 4K 等）、視頻 11 款（Seedance 2.5 旗艦 30s / Vidu Q3 16s 漫劇 / Veo 3.1 4K 電影感 / Runway Gen-4.5 導演運鏡 / Hailuo 2.3 動漫量產 / Pika 2.5 特效等）、音頻 6 款（Eleven V3 / Gemini 3.1 Flash TTS 多人對話 / MiniMax Speech 2.8 中文配音 / IndexTTS-2 音畫對齊 / Mureka V8 / Suno V5.5）、LLM 8 款模型選擇器 | LibTV |
| 導演台 | 角色站位拖擺 + 機位（正面/左右/俯拍/仰拍）+ 景別（遠全中近特），構圖描述一鍵出參考圖進畫布 | LibTV |
| 逐幀拉片 | 上傳/HLS 視頻客戶端抽 12 幀 → 鏡頭分析表（景別/運鏡/節奏）→ 參考幀一鍵「做同款」進畫布 | LibTV |
| 批量操作 | Shift+點擊多選節點（青色高亮）→ 🔗 一鍵批量連線到目標節點 | LibTV |
| 分鏡組 | 圖片節點按位置排序成宮格（序號角標），導出帶序號的合成大圖 PNG | LibTV |
| 時間軸多軌變速 | 視頻軌 + 音頻軌分軌管理，每段 0.5x/1x/1.5x/2x 變速，預覽按速率連播 | LibTV |
| 社區創作過程 | 作品詳情公開創作工作流時間線（文本→腳本→角色→配音→合成），配合「做同款」復用 | LibTV |
| AccessKey · Agent Skill | 我的頁簽發/複製/重置 AccessKey，提供 Skill 安裝指令，開放 AI 工作流給外部 Agent | LibTV |

### v6.0 新增 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/v1/ai/agent/blueprint` | 劇本 → 故事藍圖（角色/分集/情緒曲線） |
| POST | `/api/v1/ai/agent/characters` | 角色卡生成（AI 頭像 + 外觀提示詞） |
| POST | `/api/v1/ai/agent/produce` | 藍圖 + 角色卡 → 一鍵成片任務 |
| GET | `/api/v1/ai/agent/canvas/:comicId` | 畫布編輯全量數據 |
| PATCH | `/api/v1/ai/agent/panels/:panelId` | 編輯分鏡（台詞/運鏡/轉場/時長） |
| POST | `/api/v1/ai/agent/panels/:panelId/redraw` | 單格 AI 重繪 |
| POST | `/api/v1/ai/agent/comics/:comicId/restyle` | 整部換畫風 |
| GET | `/api/v1/community/works` | 靈感社區作品流（sort=hot/new, style 篩選） |
| POST | `/api/v1/community/works/:id/like` | 點贊 |
| POST | `/api/v1/community/works/:id/favorite` | 收藏（PWA 離線可看） |
| POST | `/api/v1/community/works/:id/remix` | 一鍵做同款（復刻生成任務） |
| GET | `/api/v1/community/favorites` | 我的收藏 |
| POST | `/api/v1/ai/agent/blueprint/revise` | 藍圖多輪改稿（深化） |
| PATCH | `/api/v1/ai/agent/comics/:id/characters/:charId` | 編輯角色卡（深化） |
| POST | `/api/v1/ai/agent/comics/:id/characters/:charId/avatar` | 重生成角色頭像（深化） |
| POST | `/api/v1/ai/agent/canvas/batch-redraw` | 批次重繪多格分鏡（深化） |
| POST | `/api/v1/ai/agent/panels/:panelId/undo` | 單格撤銷（深化） |
| GET | `/api/v1/community/works/:id` | 作品詳情（深化） |
| GET/POST | `/api/v1/community/works/:id/comments` | 評論列表 / 發表（深化） |
| DELETE | `/api/v1/community/comments/:commentId` | 刪除自己的評論（深化） |
| GET | `/api/v1/ai/tools/models` | 模型庫（圖像/視頻/音頻/LLM）（LibTV） |
| POST | `/api/v1/ai/tools/script-table` | 劇本 → 結構化分鏡腳本表（LibTV） |
| POST | `/api/v1/ai/tools/image-op` | 圖像工具集（生成/放大/擴圖/摳圖/角度/打光/720° 全景）（LibTV） |
| POST | `/api/v1/ai/tools/slash` | Slash 快捷命令（九宮格/四宮格/三視圖等）（LibTV） |
| POST | `/api/v1/ai/tools/compose` | 視頻片段合成任務（LibTV） |
| GET | `/api/v1/search/all?q=` | 聚合搜索（短劇+漫劇+創作者） |

## 🔄 AI 漫劇生成流水線

```
用戶創意（一句話）
   │
   ├─► [階段一] AI 劇本生成       progress 5% → 20%
   │     LLM 輸出結構化 JSON：標題/角色/分集/分鏡/台詞
   │
   ├─► [階段二] AI 分鏡繪圖       progress 20% → 70%
   │     每格分鏡按鏡頭類型(特写/中景/全身/远景)生成豎版圖
   │
   ├─► [階段三] AI 配音合成       progress 70% → 90%
   │     按角色性質自動分配音色（男/女/旁白）
   │
   └─► [階段四] 封面 + 入庫發布   progress 90% → 100%
         ComicDrama / ComicEpisode / ComicPanel 三表落庫
```

**降級策略**（不配置任何 API Key 也可完整體驗）：

| 環節 | 配置 API Key | 未配置 |
|------|-------------|--------|
| 劇本 | 真實 LLM 創作 | 內置高質量短劇模板 |
| 分鏡圖 | 真實文生圖 | picsum 種子占位圖 |
| 配音 | 真實 TTS 音頻 | 前端 Web Speech API 朗讀 |

## 🚀 快速開始

```bash
cd julang-platform
npm install
cp .env.example .env   # 填入 PostgreSQL / Redis，AI Key 可選
npx prisma db push
npm run db:seed         # 含一部演示 AI 漫劇《逆襲：命運重啟》
npm run dev             # API: http://localhost:3001
cd src && npx serve .   # 前端
```

打開前端 → 底部「+」→ **AI 漫劇生成** → 輸入創意 → 觀看實時生成進度 → 一鍵播放。

## 🔌 v5.0 新增 API

| 方法 | 路徑 | 說明 | 權限 |
|------|------|------|------|
| GET | `/api/v1/ai/capabilities` | 畫風/音色列表 + 後端可用狀態 | 公開 |
| GET | `/api/v1/ai/comics` | 漫劇列表 | 公開 |
| GET | `/api/v1/ai/comics/:id` | 漫劇詳情（含劇集） | 公開 |
| GET | `/api/v1/ai/comics/:id/episodes/:n` | 劇集分鏡數據（播放器用） | 公開 |
| POST | `/api/v1/ai/tasks` | 創建 AI 漫劇生成任務 | 登入 + 限流(5次/分) |
| GET | `/api/v1/ai/tasks` | 我的生成任務列表 | 登入 |
| GET | `/api/v1/ai/tasks/:id` | 輪詢任務狀態/進度 | 登入 |

### 創建生成任務示例

```bash
curl -X POST http://localhost:3001/api/v1/ai/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "灰姑娘重生歸來，在豪門宴會上揭穿繼妹陰謀",
    "genre": "逆襲",
    "style": "anime",
    "episodeCount": 2,
    "panelsPerEpisode": 6,
    "withVoice": true
  }'
# → { "code": 200, "data": { "taskId": "...", "status": "pending" } }
```

## ⚙️ AI 環境變數（均可選）

```bash
# 劇本：任意 OpenAI 兼容 Chat 接口
AI_LLM_API_KEY=sk-xxx
AI_LLM_BASE_URL=https://api.moonshot.cn/v1
AI_LLM_MODEL=moonshot-v1-8k

# 繪圖：OpenAI 兼容 Images 接口
AI_IMAGE_API_KEY=sk-xxx
AI_IMAGE_MODEL=dall-e-3
AI_IMAGE_SIZE=1024x1792

# 配音：OpenAI 兼容 Speech 接口
AI_TTS_API_KEY=sk-xxx
AI_TTS_MODEL=tts-1
```

## 📁 專案結構（v5.0 新增部分）

```
julang-platform/
├── api/
│   ├── routes/ai.js                  # AI 路由（公開 + 登入 + 限流）
│   ├── controllers/aiController.js   # 任務創建/輪詢/漫劇瀏覽
│   └── services/ai/
│       ├── llmService.js             # 劇本生成（API + 模板降級）
│       ├── imageService.js           # 分鏡繪圖（API + 占位圖降級）
│       ├── ttsService.js             # 配音合成（API + Web Speech 降級）
│       └── comicPipeline.js          # 生成流水線編排（進度上報）
├── prisma/schema.prisma              # +4 張表：comic_dramas / comic_episodes / comic_panels / ai_tasks
└── src/js/
    ├── ai-studio.js                  # AI 創作工作室（向導 + 輪詢 + 記錄）
    └── comic-player.js               # 漫劇播放器（運鏡/轉場/字幕/連播）
```

## 🗺️ 開發路線圖

- [x] v1.0 前端原型
- [x] v2.0 真實 API + 播放器
- [x] v3.0 Redis 緩存 + 推薦算法 + 模塊化
- [x] v4.0 創作者中心 + 審核流 + 收益體系
- [x] v5.0 AI 漫劇生成（劇本/分鏡/配音/合成播放器）
- [x] **v6.0 PWA 移動端 App（Agent 工作流 / 智能畫布 / 靈感社區 / 聚合播放）**
- [x] **v7.0 雲端同步 · 多端協作 · 訂閱變現 + 編劇草稿後端化 + 監控埋點 + API 層強化**
- [ ] v7.0 多端同步 + 真機上架

---

<p align=center>
  Made with ❤️ by 劇浪團隊
</p>
