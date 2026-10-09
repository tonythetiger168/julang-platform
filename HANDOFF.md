# 劇浪 JuLang 預覽 — 交接文件

> 這份文件讓**全新的 session**（沒有先前對話記憶）也能無縫接手。
> 新 session 的第一句話建議：`讀 julang-platform/HANDOFF.md，然後照「待辦」繼續`

---

## 0. 這個專案是什麼

`tonythetiger168/julang-platform` 的 GitHub repo **缺少整個前端外殼**：沒有任何 `.html`、沒有任何 `.css`，只有 `src/js/*.js`（21 支）與 `src/assets/` 兩張圖示。因此我們用 JS 反推出一套可運作的預覽外殼。

- 預覽網址：**http://127.0.0.1:4173/**
- 啟動方式（已在跑，背景作業）：`python _julang-analysis/serve.py <src目錄> 4173`
  - **必須用這支伺服器**：它送 `Cache-Control: no-store`。用 `python -m http.server` 會讓瀏覽器吃到舊快取，出現「明明改了卻還是舊畫面」的假 bug。

---

## 1. 目前狀態（已完成並驗證）

| 項目 | 說明 |
|---|---|
| 外殼 | `src/index.html`（DOM 契約：176 個 id）＋ `src/styles.css` |
| 修復 repo 缺陷 | `api.js`、`app.js`、`monitor.js`、`toast.js` 被壓成單行、`//` 註解吃掉整檔 → 已插入換行修復 |
| 樣式系統 | 原本就是 Tailwind（377 個 class token 中 311 個是 Tailwind），用 Play CDN 還原 |
| 版面 | 全出血豎屏、桌機 440px 手機框、橫豎屏自適應、**iOS 與 Android 完全一致**（逐位元相同） |
| 導覽 | 底部 5 分頁：首頁 / 分類 / 福利 / 漫劇 / 追劇（受 `ui.js` tabMap 限制） |
| 分類 | DramaBox 的 21 個分類（`/categories` 由 demo 層覆寫）；分類頁自動變成磚牆 |
| 播放 | **21 個分類全部對應到已驗證的免費公開 HLS 影片**（見 §1.3）；`ui.js` 只在 `episodes[0].videoUrl` 存在時才初始化播放器 |
| 首頁（App 版） | 頂部**搜尋列**＋VIP（`👑 -23%`，**導到「會員」頁**；數字是寫死的裝飾值，真實折扣要等 `subscriptionController`）＋獎勵（`🎁`，開每日簽到）；**文字分頁**（精選/新劇/排行榜/分類/獨家/漫劇），只出現在首頁／排行榜／分類（見 §1.4）；**精選＝2 欄格狀**（角標／`DramaBox 獨家`浮水印／▶播放量／2 行標題／類型膠囊）；新劇、獨家＝橫向三排 |
| 移除功能 | AccessKey / Agent Skill **整段拔除**（含金鑰儲存、複製/重置函式、匯出、孤兒 localStorage 清理） |
| 原生設定 | `mobile/app.json`（iOS `app.julang.ios` / Android `app.julang.android`）＋ `manifest.json` `orientation: any` |

### 1.1 第二輪（原待辦 3.1–3.4，2026-10-07 完成）

| 項目 | 作法 | 驗收證據 |
|---|---|---|
| 3.1 新劇／獨家分流 | `home-rows.js` 的 `__renderHomeRows(mode)` 吃 `default` / `new` / `exclusive`；每個模式有自己的三排標題與排序。`new` 用 **id 反序**當「新→舊」——demo 的 6 部劇沒有日期欄位，`sort=new` 只存在於 `/community/works`，所以這是明講的代理指標。`exclusive` 排序同預設但每張卡加 `獨家` 角標 | `featuretest.js`：default `d6,d1,d4,d2,d3,d5`、new `d6,d5,d4,d3,d2,d1`、exclusive 6 個角標＋標題 `獨家首播` |
| 3.2 迷你播放器 PiP | `closePlayer()` 改呼叫 `parkMiniPlayer()`：把 `#player-video` **移進** `#pip-card` 並 `pause()`，**不 destroy**；`restorePlayer()` 移回 `#player-video-home`、開 modal、`play()`；`initArtPlayer()` 進場先 `unparkMiniPlayer()`，換片不會留舊 PiP | 量到 PiP **96×55 @(12,725)**、內部 video 94×53、不壓 nav/FAB、在視窗內；`destroy=0 / pause=1`，restore 後 `play=1` |
| 3.3 金幣膠囊 | `coin-pill.js`：`#coin-pill` 固定右下 `bottom: 128px`（`#create-fab` 佔 70–122px），`MutationObserver` 綁 `#coin-count`，數字成長時閃 `+N`。匯出 `updateCoinPill()` 讓流程／測試能強制同步 | 量到 pill 72×30 @y686–716、FAB y721–773 → **不重疊**；瀏覽器內 `#coin-count` 的 8,888 即時同步。`#coin-count` 的寫入者：`render.js loadUserCoins()`（種 demo 餘額）與 `ui.js showCheckin()`（每日獎勵） |
| 3.4 超值優惠彈窗 | `promo-popup.js`：`#promo-popup` 固定右下 `bottom: 176px`，預設顯示（HTML 先帶 `hidden`，避免載入閃爍），按 × 寫 `localStorage.julang_promo_dismissed=1`，之後不再顯示 | 量到 promo 206×121，與 nav/FAB/pill 皆不重疊；`featuretest.js` 驗「預設顯示 / × 隱藏 / 重載仍隱藏」 |
| repo 缺陷修復 | `render.js`(10 個) 與 `ui.js`(4 個) 內有 **NUL 位元組**：上游打包時把 class 字串換成索引、字串表卻遺失（`class=<NUL>10<NUL>`），瀏覽器把它當 U+FFFD，載入骨架與空狀態**完全沒有樣式**；NUL 也讓這兩檔被工具誤判為二進位（`grep` 直接跳過 `ui.js`，因此差點漏掉 `showCheckin` 的來源）。已用 `_julang-analysis/fix-nuls.js` 還原成專案慣用的 class（原字串不可考：單一 commit、無 dist、無完好 dump） | 修完 8 個既有 suite 全 PASS；`render.js`／`ui.js` 恢復可讀 |
| 3.5 底部導覽文案 | 標籤改為 **首頁 / 分類 / 會員 / 漫劇 / 我的**：`會員`＝金幣/簽到/VIP hub（inspire view），`我的`＝follow view（它本來就同時渲染 `#mine-panel`、追劇、觀看歷史、我的收藏）；**保留** `分類`（該頁自己的標題就是「分類」，改叫推薦會與頁面自相矛盾）與 `漫劇`（劇浪獨有，參考 App 沒有這個分頁）。只換文字，`.nav-item` 順序不動 | 實測五個分頁高亮索引 = 0/1/2/3/4；截圖 `verify-nav.png` 顯示「我的」高亮，且畫面正是我的/追劇/觀看歷史/我的收藏 |
| 順帶修好 | `ui.js` 的 `tabMap` 少了 `inspire: 2`，所以點「會員」時**沒有任何分頁會高亮**（既有缺陷，不是這次改壞的）。補上後五個分頁一致 | 同上量測（`inspire → index 2`） |
| 3.2 收尾 | 迷你卡內 Artplayer 控制列已用 CSS 收掉：`art-bottom` / `art-mask` / `art-loading` / `art-settings` / `art-info` / `art-contextmenus` / `art-notice` / `art-layers`。**刻意不隱藏** `art-poster`（第一帧解碼前它就是縮圖），也不動 `<video>` | 實測 `.art-video-player` 的 12 個子節點：`VIDEO.art-video`＝block、`art-poster`＝block，其餘控制層全部 `none`；PiP 仍 96×55、標籤 `EP.1` |

**新增檔案**：`src/index.html`、`src/styles.css`、`src/js/demo-videos.js`、`src/js/home-rows.js`、`src/js/home-tabs.js`、`src/js/platform.js`、`src/js/coin-pill.js`、`src/js/promo-popup.js`、`mobile/app.json`
**修改檔案**：`src/js/api.js`、`app.js`、`monitor.js`、`toast.js`、`pwa.js`、`player.js`、`render.js`、`ui.js`、`src/manifest.json`

還原：`git checkout -- src/js/api.js src/js/app.js src/js/monitor.js src/js/toast.js src/js/pwa.js src/js/player.js src/js/render.js src/js/ui.js src/manifest.json`
（`coin-pill.js`／`promo-popup.js`／`home-rows.js` 等新檔不在 git 內，還原＝直接刪除。）

### 1.2 後端／資料層（第三輪，2026-10-07）

使用者的下一步是「接真實資料層、接上 prisma 持久化、清乾淨 scratch」。這一輪把**能接的都接了並驗證**，並把真正缺的東西查清楚——結論是：**設定層全部補齊且驗證通過，但「接真實資料層」本質上是「把 16 個不存在的模組寫出來」，不是接線問題。**

| 項目 | 狀態 | 證據 |
|---|---|---|
| 根目錄 `package.json` | **原本完全不存在**（只有 `package-lock.json`），npm 無法安裝任何東西 → 已補回，依賴清單逐字取自 lockfile 的 `packages[""]` | `npm install` 成功：420 packages |
| `.env` | 由 `.env.example` 建立（`.gitignore` 本來就忽略 `.env`） | — |
| `prisma/schema.prisma` | datasource **缺 `url`**（Prisma 連驗證都過不了）→ 補上 `url = env("DATABASE_URL")` | `prisma validate` → **valid 🚀** |
| Prisma client | `prisma generate` 成功（prisma / @prisma/client 5.22.0） | 產生 `node_modules/.prisma/client` |
| Postgres DDL | `prisma migrate diff --from-empty --to-schema-datamodel`（**不需要資料庫**） | `_julang-analysis/prisma-ddl.sql`，54,200 bytes，**38 張 CREATE TABLE** |
| 前端資料層切換 | `mock-api.js` 原本**無條件**覆寫 `api.request`，前端永遠連不到後端；`demo-videos.js` 又包一層，會用 demo 的 21 個分類覆蓋真實 `/categories`。現在兩層都認得真實模式：`?api=real` 或 `localStorage.julang_api_mode='real'`；**預設仍是 demo，行為完全不變** | `apimodetest.js` 14 項全 PASS（mock：8888 + 21 分類；real：不接管、不種 demo token、不覆寫分類） |
| 缺失中介軟體 | repo 缺 `middleware/rateLimit.js`、`validate.js`、`cache.js`、`apiKeyAuth.js`，但 `server.js` 與 8 個路由檔全都 require → 已依呼叫點契約補齊 | `tests/middleware.test.js`；jest **3 suites / 22 tests passed**（含 repo 原有兩支） |
| `api/config/redis.js` | 原檔 `client.connect()` 沒有 `.catch()` → Redis 沒開時是 unhandled rejection，Node 18+ 直接終止進程（API 連啟動都不可能）→ 改成失敗容忍，`isReady=false` 時 `cache.js` 自動降級為進程內快取 | 同上 |
| API 啟動 | 已能通過 `server.js` 自身所有 require，**停在 `Cannot find module '../controllers/dramaController'`** | 直接跑 `node api/server.js` 的錯誤輸出 |
| 資料庫 | 這台機器**沒有任何 Postgres**（無 `psql`／`pg_ctl`、5432 未開、Docker daemon 不可用）→ 持久化的設定與 DDL 都就緒，但**無法真的連起來跑** | — |

**真實資料層還缺什麼（16 個模組、20 個 require 點）**

- `api/controllers/`：`dramaController`、`authController`、`userController`、`communityController`、`creatorController`、`canvasProjectController`、`canvasController`、`agentController`、`aiController`、`toolsController`、`assetController`、`draftController`
- `api/services/ai/`：`llmService`、`imageService`、`videoService`、`providers`

`api/routes/*.js` 全都在、也很薄（每個端點一行），足以反推 handler 與所需 Prisma 模型；但**這些 controller 一個都不存在**。唯一存在的 controller 是 `openapiController.js`，而它自己也 require 了 4 個不存在的 AI service。要真的接上資料層，得照 `prisma/schema.prisma`（38 模型）把這 16 個模組寫出來，並且先備妥一個 Postgres 才有辦法驗證。

### 1.3 分類播放：全部換成免費影片（第四輪，2026-10-07）

需求：「分類都放 free video clips」。原本 `demo-videos.js` 的 `STREAMS` 只寫了 6 個分類，其餘 **15 個分類全部落到同一個 `FALLBACK`**（播同一支）。現在：

- `FREE_CLIPS`＝**9 支免費公開 HLS**（Big Buck Bunny／Apple BipBop／Tears of Steel／Google Shaka），每一支都經**深度驗證**：master playlist → 第一個 variant → 真的有 segment。
- **21 個分類全部有明確對應**（8 支不同影片、18/21 非 fallback），`window.__categoryStreams` 公開給測試用。
- 刻意**排除**兩支「playlist 合法但不能播」的：
  - `test-streams.mux.dev/tos_ismc`：上一輪實測卡在 `readyState 0`。
  - `apple/adv_dv_atmos`：**Dolby Vision**，一般瀏覽器解不了。（這支是我第一次挑選時誤收的，靠 segment 層檢查才抓到。）
- 追加驗證：下載每支 clip 的第一個 segment 確認編碼 —— 6 支是 MPEG-TS 且 `stream_type 0x1B`（H.264 + AAC）、2 支是 fMP4/CMAF 且 `avc1`（也是 H.264）、1 支（control mux/bigbuckbunny）因我自己的 25 秒 timeout 中止，但它上一輪已被 Chrome 實測可播。**9/9 皆為 H.264。**
- 想在 Chrome 內逐支實測播放時失敗：headless Chrome 的 **network service crashed**（環境問題，與 clip 無關），所以「瀏覽器層播放」目前只有舊有 5 支有實測紀錄。

### 1.4 分頁／標籤列改到影片之上（第五輪，2026-10-07）

回報：「tab 選擇在影片上面」。查出是兩個結構問題：

1. **`.view-section` 是 `position:absolute; inset:0`** → 每個 view 覆蓋整個 `#app-main`，所以 `#home-tabs`（精選／新劇／排行榜／分類／獨家／漫劇）被壓在 view **底下**，而且 view 的內容會與它重疊。
2. **`#home-chips`（推薦／熱播榜／…）是 `absolute top-0 … z-20`** → **浮在影片卡片上面**，第一排卡片的頂端被切掉。

修法：`#app-main` 改為 column flex；`.view-section` 改為 `position:relative; flex:1 1 auto; min-height:0`（仍在自己容器內滾動）；`#home-chips` 拿掉 absolute，變成自己一列；順帶移除 chips 上重複計算的 status-bar inset（header 已經處理，會變雙重內縮）。

實測（390×844 iframe、headless Chrome，**10 項全 PASS**）：header `0–54` → **tabs `54–101.5`** → **chips `101.5–144.3`** → **第一張卡 `144.3` 起**；`view.bottom=791` 正好停在底部 nav 上緣。tabs/view 與 chips/card 皆**零重疊**。截圖：[probe-run/layout.png](_julang-analysis/probe-run/layout.png)。

**標籤列的顯示範圍（已定案）**：它只出現在自己的畫面 —— **首頁、排行榜、分類**（後兩者是它自己導覽過去的，而且它是「回到精選」的入口）；在 **會員／漫劇／我的** 一律隱藏（由 `ui.js` 的 `switchTab` 切換 `.hidden`）。它本來就被 view 蓋住，所以這個問題以前看不出來。

順帶修掉兩個被這次改動暴露出來的**既有 bug**（都不是這次才壞的）：

1. **新劇／獨家 的底線整排消失**：`showPanel('rows')` 拿 `'rows'` 去比對 `data-tab`，但沒有任何按鈕是 `data-tab="rows"`，於是所有 `tab-active` 被移除。改成 `showPanel(panel, activeName)`，底線用真正的分頁名。
2. **在排行榜／分類按「新劇／精選」沒反應**：舊 `homeTab` 只換 panel、不切 view，`view-rank` 仍顯示，看起來像按了沒用。現在一律先 `switchTab('feed')` 再換 panel。

實測（390×844 iframe、headless Chrome，**20 項全 PASS**）：首頁／排行榜／分類 條列可見，會員／漫劇／我的 隱藏（`hidden=true`）；底線正確跟隨 精選／排行榜／獨家／分類；從排行榜按獨家會回到首頁並顯示三排；從分類按精選會回到首頁並顯示格狀。截圖：[probe-run/tabs.png](_julang-analysis/probe-run/tabs.png)。

### 1.5 VIP 角標改成「真的」（第六輪，2026-10-07）

回報問「`-23%` 是什麼」。追下去：它是**寫死的裝飾值**，而且後端**完全沒有折扣概念**（`discount|originalPrice|PercentOff|salePrice|折` 全庫搜過都沒有）。所以「做真的」＝**不編造**，而不是把假數字搬到後端：

- **角標改由 `/subscription/plans` 驅動**（新檔 `src/js/vip-offer.js`）：取最便宜的付費方案 → 顯示 `👑 9.9 起`（真資料），`title` 顯示 `週卡 9.9／贈 100 幣`。
- **不編 %**：只有 API 真的回 `percentOff`／`originalPrice` 時才顯示 `-XX%`（已測：`originalPrice: 9.9 / price: 7.6` → `-23%`）。取不到資料就顯示「優惠」字樣，**絕不退回假數字**；完全沒有付費方案時也不顯示數字。
- **「超值優惠」卡吃同一份資料**（原本寫死「新人首儲 5 折／限時 24 小時」，同樣是編的），CTA 改為進會員頁。
- **單一真實來源**：後端 `api/controllers/subscriptionController.js` 的 `PLANS`；demo 模式由 `mock-api.js` 提供同值資料，`vipoffertest.js` **會把兩邊價格抓下來比對**，漂移就 FAIL。
- 實測：`vipoffertest.js` **13 項全 PASS**；`tests/subscription.test.js` **4 項 PASS**（直接呼叫後端 `getPlans`，斷言四個方案＋「沒有折扣欄位」）。

**前置修復**：這條路原本走不通，因為 `subscriptionController.js` 是 **dead code**（單行 + `//` 吃檔：require 得到、exports 是空的，`routes/subscriptions.js` 因此直接丟 `Route.get() requires a callback function`）。用 `repair-comments.js` 修好（同時修好 `socket/syncService.js`、`utils/storage.js`），後端 dead 檔案從 3 個降到 0（`backend-deadcheck.js` 只剩 redis/prisma 兩個誤報）；jest 由 3 suites → **4 suites / 26 tests**。

**仍未解**：`syncService.js` 修好後**仍 require 失敗**，但原因是 `node_modules/engine.io/build/engine.io.js` 不存在（先前失敗的 npm install 留下的半殘相依），與註解災情無關；要修得再跑一次 `npm install`（需升級權限一次）。

### 1.6 市場研究 + P0-1：切開觀眾／創作者方案（第七輪，2026-10-07）

做了 2026 全球短劇市場研究（三份並行網路研究＋一手來源），產出 **[docs/MARKET-2026.md](docs/MARKET-2026.md)**：市場基準、競品優缺點、產業單位經濟（80–90% 不回本、行銷佔收入 50–80%、北美全週期 ROI 需 ~1.8）、法規三戰線（中國《微短劇發展管理辦法》2026-09-01 生效＋AIGC 前置審查/備案/標註；**FTC click-to-cancel 已於 2025-07-08 被第八巡迴法院撤銷**，別再引用；ReelShort 於 2026-10-02 在 C.D. Cal. 被訴侵權），以及 P0–P3 改善計畫。每一項都附來源，查不到的一律標 `UNVERIFIED`。

研究中發現**最高槓桿的落差**已實作（P0-1）：劇浪的方案其實是**創作者工具方案**（AI 額度／去水印／4K／團隊人數），卻被當成觀眾 VIP 優惠呈現。現在：

- 後端拆成 `AUDIENCE_PLANS`（`viewer_weekly`「每週無限看」）與 `CREATOR_PLANS`；`getPlans` 回傳時加 `group` 欄位；`getSubscription`／`upgrade` 改用合併查表。
- 觀眾方案價格**沿用原本的 9.9 並標 `provisional: true`**（真實定價待產品決定，競品基準 US$19.99/週）——刻意不假裝已定案，UI 的 `title` 會顯示「價格暫定」。
- `vip-offer.js` 只從 `audience` 組挑最便宜方案；後端未分組的舊回應仍向後相容。
- 驗收：**jest 4 suites / 27 tests**、前端 **12 個 suite 全過**（`vipoffertest` **17/17**，含「創作者方案再便宜也不會出現在觀眾角標」）。

**同輪一併收掉的兩件小事**
- **條列的「漫劇」按鈕原本是 `homeTab('pick')`**——按下去只會顯示精選格狀、底線跑回精選（假按鈕）。改為 `switchTab('manju')`，與底部導覽一致。瀏覽器實測：`view-manju` 顯示、`view-feed` 隱藏、標籤列隱藏、底部導覽高亮索引 3。
- **新角標的版面**（`👑 9.9 起` 比 `-23%` 長）也一併量了：角標 x255–323、金幣鈕從 331 起（**8px 間隔、不重疊**）、搜尋列仍有 235px、header 高度維持 54px。整組瀏覽器檢查 **12/12 PASS**。

**`node_modules/engine.io` 的診斷結論（不再處理）**：`engine.io@6.6.9` 的 `package.json` 宣告 `main: ./build/engine.io.js`，但實際解出來的套件**缺這個檔**（只有 `parser-v3` 與 `.d.ts`），而 `npm install` 回報 `up to date` 所以不會重裝。**它只被 socket 層（`socket.io`）需要，不在預覽或收錢路徑上**，所以不值得再花一次權限；真的要修是一行：刪掉 `node_modules/engine.io` 再 `npm install engine.io@6.6.9`。

### 1.7 P0-2：三個 vertical-slice controller（第八輪，2026-10-07）

**在接受「用 mocked Prisma 寫、只驗邏輯」的前提下**，補上 API 起不來最關鍵的三個 controller：`dramaController`（10 exports）、`authController`（6）、`userController`（5）。端點契約來自 `routes/drama.js`／`auth.js`／`user.js`，不是自己發明的。

**成果（可驗證）**
- `routes/auth.js`、`routes/drama.js`、`routes/user.js` **現在全部載得起來**（先前三個都丟 `Cannot find module` / `Route.get() requires a callback function`）。
- **API 啟動錯誤真的往前推進了**：`node api/server.js` 由 `Cannot find module '../controllers/dramaController'` 變成 `'../controllers/communityController'`——代表 auth/drama/user 三個 route group 已通過。
- jest：**5 suites / 56 tests 全過**（新增 `tests/controllers.test.js` 29 項）。

**處理掉的真實陷阱**
- `Drama.views` 是 **BigInt**、`rating` 是 **Decimal**：BigInt 不能 JSON 序列化（`res.json()` 直接丟 TypeError），Decimal 會被序列化成字串。出口統一轉 number，並用「BigInt 真的會讓 `JSON.stringify` 爆掉」的測試把必要性釘住。
- **列表的 `episodes` 必須是數字、只有詳情才是陣列**（前端 `render.js` 印 `${episodes}集`），沿用 demo 層契約。
- `registerSchema`／`loginSchema` 必須是**真的 zod schema**——`validate()` 在**路由定義時**就會呼叫 `.safeParse`，缺了整個 server 起不來。
- `UserFollow`／`WatchHistory` 在 schema 裡**沒有** drama 關聯欄位 → 劇名要用第二次查詢補。
- `inviteCode` 是 required + unique 且沒有 DB 預設值 → 註冊時必須自己產生。
- 登入對「帳號不存在」與「密碼錯誤」回**同一個** 401，避免帳號列舉。
- `userController.checkin` **委派**給 `checkinController.dailyCheckin`，不重寫第二套簽到。
- `recordWatch` 在沒有 `episodeId` 時改用 `create`：Postgres 的 unique index 不把兩個 NULL 視為相等。

**明確的驗證邊界（不要誤讀）**：這些測試用 mocked Prisma，驗的是**邏輯**——回應形狀、型別轉換、錯誤路徑、以及**真的傳給 Prisma 的查詢參數**。**沒有驗證 SQL 正確性**（Prisma 查詢只有真 DB 能證明），也沒有驗證 migration／seed 跑不跑得動。要跨過這條線就必須有真的 Postgres。

**還沒做**：其餘 13 個缺失模組（community／creator／ai／agent／tools／asset／canvasProject／draft… 以及 4 個 AI services）。

### 1.8 真的把 Postgres 跑起來 + 用真 DB 驗證 SQL（第九輪，2026-10-07）

上一輪留下的「只驗邏輯、SQL 未驗」在這輪被解掉了。**這台機器原本沒有任何 Postgres**（無 psql/pg_ctl、5432 未開、Docker daemon 不可用）——答案是**自己弄一個，不需要管理員權限**。

**怎麼弄的**
- `npm install embedded-postgres`（裝到工作區的 `_julang-analysis/pg/`，**不污染專案的 package.json**）→ 附帶 `@embedded-postgres/windows-x64`（**104 MB**，內含 PostgreSQL **18.4** 二進位檔）。
- **`pg_ctl` 在這台機器會失敗**：`could not create restricted token: error code 87`（Windows 特有的 token 問題）。`initdb` 正常（所以不是在 admin 帳號下跑），改成**直接跑 `postgres.exe`** 就行。
- 資料目錄 `_julang-analysis/pg/data`（40 MB，在工作區內）。**啟動指令**：
  ```
  postgres.exe -D <工作區>\_julang-analysis\pg\data -p 55432 -c listen_addresses=127.0.0.1
  ```
- `.env` 的 `DATABASE_URL` = `postgresql://postgres@127.0.0.1:55432/julang?schema=public`（trust 認證、只綁 127.0.0.1）。
- `prisma db push` → **「in sync with your Prisma schema」**，`julang tables: 38`——與先前靜態產出的 DDL 完全吻合。**schema 至此對真引擎驗證通過**。
- 這是**工作區內的臨時實例**，不是正式環境；`_julang-analysis/pg/` 整個刪掉就沒了。

**用真 DB 挖出 3 個只有真 DB 才會暴露的 seed bug**（`prisma/seed.js` 原本**根本跑不動**，第一步就死）
1. `category.upsert({ where: { name } })`——`Category.name` **不是** `@unique` → Prisma 直接拒絕（`CategoryWhereUniqueInput needs at least one of id`）。改 `findFirst` + `create`。
2. `drama.upsert({ where: { title } })`——`Drama.title` 也不是 `@unique`。**這裡刻意不動 schema**：翻拍劇同名是合理的，把 title 設成 unique 是錯的設計。同樣改 `findFirst` + `create`。
3. `user.create` **缺 `inviteCode`**（required + unique、沒有 DB `@default`）→ 建立用戶失敗。由手機號末 8 碼推導（`JL` + 8 碼）。

> 3 個都是靜態分析與 mocked 測試**永遠抓不到**的——這正是「先有真 DB 再往下寫」的價值。

**驗證結果**：`node _julang-analysis/pg/verify-db.js <專案目錄>` → **33/33 PASS 對真 Postgres**。涵蓋：真 SQL 的 where/orderBy/take/select、`_count` 聚合、ILIKE 搜尋、關聯查詢取集數、**Postgres 真的回 BigInt/Decimal 時的序列化**、register 真的寫入且被 unique 約束擋重複、bcrypt 真的比對、`lastLoginAt` 真的更新、toggleFollow 真的建/刪、`recordWatch` 真的 upsert（第二次是更新、不重複列）、views 真的 +2、**token 真的能通過 `api/middleware/auth`**。腳本會自我收拾（刪測試用戶、還原 views）。

**仍未做**：seed 的三個修法是「讓它跑得動」的最小改動；`Category.name` 要不要設 `@unique`（依 app 以名稱為 key 的用法，其實該設）是產品決定，我沒有擅自加約束。

### 1.9 補齊後端：9 個 controller + 4 個 AI service，API 真的跑起來（第十輪，2026-10-07）

**做法**：先用 `_julang-analysis/contract-scan.js` 從 `api/routes/*.js` **自動抽出精確契約**（每個 controller 要 export 哪些方法、哪些 zod schema、缺哪些檔案），再用 `dep-closure.js` 掃 `server.js` 的完整相依閉包拿到**權威缺失清單**（13 個），然後把 9 個 controller ＋ 4 個 AI service 分成 5 組**平行的 subagent** 實作（檔案完全不重疊）。每組簡報都含同一套硬約束：schema 必須是真 zod、只能用 schema.prisma 真的存在的欄位、BigInt/Decimal 必須轉型、形狀對齊 `mock-api.js`、**不得改 routes/schema/utils/package.json/src**、做不到要回報而不是改路由。

**新增檔案**：`agentController` `aiController` `assetController` `canvasController` `canvasProjectController` `communityController` `creatorController` `draftController` `toolsController` ＋ `api/services/ai/{providers,llmService,imageService,videoService}.js` ＋ 5 個測試檔。**契約掃描確認 0 個缺失模組**。

**驗收（全部我自己跑過）**
| 關卡 | 結果 |
|---|---|
| `verify-all.js`（真 require 逐一組裝 19 個 route 檔後再載入 `routes/index.js`） | **62/62 PASS** ← 整個 API 表面組得起來 |
| jest | **10 suites / 291 tests 全過** |
| 真 Postgres 煙霧測試（`pg/smoke-controllers.js`，新 controller 唯讀打真 SQL） | **22/22 PASS** |
| HTTP 端到端（`pg/http-write-test.js`：Express → validate(zod) → controller → Prisma → Postgres，含寫入與 JWT） | **13/13 PASS** |
| `node api/server.js` | **啟動成功**，`/health` 200、`/api/v1/dramas/recommend` 回真資料（views 為 Int32、列表 `episodes` 為數字）、未登入 `/user/profile` 401 |
| 前端 12 個 suite | 全過 |

**過程中解決的三個環境問題（都只有實跑才會遇到）**
1. **`node_modules` 大規模半殘**：第一次失敗的 npm install 留下多個「入口檔沒解出來」的套件（`engine.io`、`engine.io-parser`、巢狀的 `socket.io/node_modules/debug`）。`npm install` 會說 `up to date` 而不修（只比對 integrity）。先用 `broken-packages.js` 量化（**記得掃巢狀 node_modules，且要像 Node 一樣允許省略 `.js`／`index`，否則 `@types/*` 會大量誤報**），最後砍掉 `node_modules` 從 lockfile 重裝（437 packages）才徹底收斂。
2. 重裝會清掉**生成的 Prisma client** → 要 `prisma generate`。它回 `EPERM: rename query_engine-windows.dll.node.tmp → .node`，但引擎檔其實有寫出來——**「模組載得起來」不等於「查得動」**，所以一定要用 `pg/query-check.js` 實測一次查詢（本次：drama=8 / user=3 / category=9 / creator=3 / episode=21，與 seed 吻合）。
3. `pg_ctl` 在這台機器不能用的問題（§1.8）與上面兩項無關。

**一個重要教訓（我自己先誤判過一次）**：收工前那次 jest 出現 1 個失敗（模型庫漂移），但**同時有 agent 還在改 `toolsController`**——我當下誤以為是真漂移。等所有寫入者停下後：單獨跑該 suite 49/49、完整跑 291/291、並用真模組跑 `model-drift.js` 得 **0 漂移**（`providers.getModel` 是純函式、不看 env、無快取），證明那只是讀到**過渡狀態**。**規則：寫入者還在跑時看到的紅燈不算數，必須在靜止後重跑。**

**還沒做（誠實清單）**：`AuditLog` 只有審核流程會寫，目前沒有審核端點所以 `getAuditLogs` 實務上回空；`AiTask`/`ComposeTask` 沒有 worker，任務會停在 pending、`imageOp` 的 `imageUrl` 為 null；`GET /community/works` 沒掛 auth 所以 `_liked` 永遠 false；`toolsController.remix` 沒有偽造 mock 的 `taskId`（沒有 worker，假的任務只會永遠 pending）；`Category.name` 是否加 `@unique` 待產品決定；`api/services/ai/*` 在沒有 API key 時是降級／內置模板模式（`/health` 誠實回報三項 false）。

### 1.10 P1：付費牆接成真的 + rewarded video 解鎖（第十一輪，2026-10-07）

**任務不是「蓋付費牆」**——前端早就有（`player.js`：前 5 集免費、`showUnlockModal`、`POST /coins/unlock`）。真正的問題是**「看廣告解鎖」是假的**：只 `showToast` + `setTimeout(3000)`，然後**在本機**設 `unlocked = true`，不打後端、不寫任何紀錄，**重新整理就失效**；而且**伺服器從不回傳解鎖狀態**，成本 5/8 幣與「5 集免費」全寫死在前端。

> ⚠️ 我在中途**誤判過**：用 `Get-ChildItem -Include *.js`（**沒有 `-Recurse`，在 PowerShell 不會生效、會靜默回傳空值**）得出「前端完全沒有付費牆」。這是與 §4 第 1 點（grep 跳過 `ui.js`）同類的陷阱，任何「找不到」的結論都要先確認工具真的跑了。

**凍結的契約**（前端照此實作，後端照此實作）
- `GET /dramas/:id` 與 `/:id/episodes` 每集多帶 `free` / `unlocked` / `locked` / `cost`，頂層 `freeEpisodes`；**`locked` 時 `videoUrl` 一律 `null`**（付費牆不能只是裝飾——不把播放位址交出去）。
- 新 `api/middleware/optionalAuth.js`：合法 Bearer 就設 `req.user`，否則**放行且永不 401**。
- `POST /ads/watch` body **選填** `{dramaId, episodeId}`：不帶＝行為逐字不變（給幣）；帶了＝同一 `$transaction` 寫 `AdWatchLog(reward:0)` + `upsert UnlockedEpisode(cost:0)`，**不給幣**；免費集／已解鎖集提前返回不計次；每日上限與最短間隔兩種模式共用。
- `FREE_EPISODES=5` 只有一份（定義在 `dramaController` 並 export，`adController` require 同一份，兩邊不可能漂移）。

**兩組平行實作**（`api/**` vs `src/**`，檔案完全不重疊）：後端 `dramaController`/`adController`/`optionalAuth.js`/`routes/drama.js`/`tests/paywall.test.js`（27 tests）；前端 `player.js`/`mock-api.js`/新 `unlock.js`/`index.html` 一行 script/`paywalltest.js`（74 checks）。`player.js` 的假廣告路徑**已完全移除**，改成使用者主動點擊 → 10 秒不可略過倒數 → 倒數結束才 `POST /ads/watch` → **只有回 `unlocked:true` 才解鎖**（舊伺服器回 `{coins}` 已經騙不到），429 時彈窗不關並提示可改用金幣。

**我在領隊層補的兩件事（跨檔、不在任何 agent 的可寫範圍）**
1. **兩個跨模組缺口**（AI 組回報、我用真 DB 驗證）：`apiKeyAuth` 只匯出 `apiKeyAuth`（`hashKey`/`chargeApiKey` 是 undefined → `POST /openapi/v1/generate/*` 一律 500）、`toolsController` 只匯出 `_MODEL_CATALOG`（`MODEL_LIBRARY` undefined → `GET /openapi/v1/models` 500）。已補並驗證（`pg/openapi-verify.js` 10/10；`hashKey` 與 middleware 比對用的 sha256 必須是同一個函式，否則新建金鑰永遠驗不過）。**同時把這類「跨模組契約」加進 `verify-all.js`**（62→**67** checks），以後這種 bug 會在閘門就被抓到。
2. **快取洩漏（兩組都獨立發現，我選了「兩個都做」）**：`GET /dramas/:id` 現在回傳 per-user 資料，卻仍掛 `cache('drama',300)`，而該 cache 的鍵只有 URL（`cache.js:41`）→ 已解鎖用戶先請求後，匿名請求 300 秒內會拿到他的解鎖狀態與 `videoUrl`（付費牆在系統層被繞過）；反向則付費用戶被誤鎖。修法：**①`/:id` 直接不快取**（per-user 回應本來就不該快取；清單類端點維持快取）**②`cache.js` 的鍵加上 `req.user?.userId`**（縱深防禦，未登入一律 `anon`，所以其他路由行為不變）。**注意：`_julang-analysis/paywall-cache-leak.js` 自己 new 了一個 app 把 cache 放在 optionalAuth 之前，複製的是已被移除的舊接線，所以它永遠回報 LEAK——那是「重現舊 bug 的腳本」，不是驗證現在的 app。**

**驗收（全部在寫入者停止後跑）**
| 關卡 | 結果 |
|---|---|
| jest | **11 suites / 318 tests** |
| `verify-all.js`（含新增跨模組契約檢查） | **67/67 PASS** |
| 前端 13 個 suite（12 + `paywalltest`） | **0 失敗**（`paywalltest` 74/74） |
| 真 DB 付費牆（`pg/unlock-verify.js`，自備 8 集付費劇 fixture） | **17/17 PASS** |
| **HTTP 端到端付費牆＋快取洩漏**（`pg/http-leak-test.js`，打真的伺服器） | **12/12 PASS** |
| `pg/openapi-verify.js`／`pg/smoke-controllers.js`／`pg/http-write-test.js` | 10/10、22/22、13/13 |
| `checkids` | PASS（順手改進：**自動收集 JS 自己動態指派的 id**，例如 `player.js` 的 `modal.id = 'unlock-modal'`，並在輸出透明列出，而不是加白名單） |

**仍未做／誠實邊界**：**沒有接真的廣告 SDK**——`showRewardedAd()` 是應用內模擬倒數（原始碼有 TODO：換成 SDK load/show/onUserEarnedReward），也**沒有廣告平台的 server-side 驗籤**，所以目前「看過廣告」是客戶端宣告的；`cost` 語意採字面讀法 `free ? 0 : pricePerEp`（已解鎖的付費集仍回原價，前端只在 locked 時用到，未改）；seed 的劇只有 3 集且全免費，**demo 要看到付費牆必須靠 mock 的 12 集付費劇**（seed 若要貼近真實也得加集數）；真實瀏覽器的視覺確認仍未做（paywalltest 是 headless DOM/虛擬時鐘）。

### 1.11 真實成片《我在盛唐写天下》10 集放入 demo（第十二輪，2026-10-07）

使用者提供了 10 支成片（共 **72.2 MB**，sha256 已逐一核對）。做法與三個**必要**的配套改動：

1. **檔案**：複製到 `src/media/shengtang/ep01.mp4` … `ep10.mp4`（**改用 ASCII 檔名**——`《》`／空白／CJK 會讓 URL 需要編碼，demo 容易出錯；原中文標題保留在資料與紀錄）。**不得修改來源檔**；`_julang-analysis/media-verify.js` 會用原始 sha256 逐一比對複製品。
2. **demo 資料**（`src/js/mock-api.js`）：新增 `d7`《我在盛唐写天下》，**10 集**、`isFree:false`、`pricePerEp:5`、`mediaDir:'/media/shengtang'`、`realMedia:true`、`finaleTitle:'終章'`。
   - ⚠️ **格式陷阱**：我一開始在簡報裡寫「10 個物件的陣列」，那是**錯的**。mock-api 的既有契約是**列表用數字、只有詳情才用陣列**（`render.js` 會印 `${drama.episodes}集`，陣列會渲染成 `[object Object]…集`）。所以正確做法是 `episodes: 10`（數字）＋`mediaDir`，並讓 `demoEpisodeUrl()` 生成 `mediaDir + '/ep' + padStart(2,'0') + '.mp4'`。**這一輪也順手把 `demoEpisodes`/`findDemoEpisode` 改成依 `drama.episodes` 決定集數**（原本一律 12），並讓最後一集可用 `finaleTitle`。
   - **副作用（正面）**：10 集 > 免費 5 集，所以這齣劇成了**付費牆的第一個真實展示案例**（第 6 集起真的鎖、`videoUrl` 回 `null`），正好補掉 §1.10 記的「demo 只靠假資料才能看到付費牆」。
3. **`src/js/demo-videos.js` 的守衛**：它的裝飾層會**無條件覆寫** `videoUrl` 成免費 HLS clip、並用 `buildEpisodes()` 重建集數陣列——真實成片會被換掉。加 `if (d.realMedia) return d;` 完全跳過。
   - **同時** `mock-api.js` 的 episode payload 對 `mediaDir` 的劇也用「受控 getter + 吞寫入的 setter」（與「鎖住 ⇒ null」同一招），縱深防禦。
4. **`_julang-analysis/serve.py` 補 HTTP Range**：它原本只是加了 no-cache 的 `SimpleHTTPRequestHandler`，而**它從不實作 Range** → 影片拖動會壞、部分瀏覽器不播。補了 `206` + `Content-Range` + `Accept-Ranges`、`bytes=start-`／`bytes=-suffix`、非法 Range 回 `416`，並覆寫 `copyfile()` 只送請求的區間（不引入第三方套件）。

**驗收**
| 關卡 | 結果 |
|---|---|
| `media-verify.js`（sha256 ×10 + HTTP 200／`video/mp4`／Content-Length、`Range: bytes=0-1023` → **206** + 正確 `Content-Range` + 只回 1024 bytes、非法 Range → **416**、10 集全部可取得、生成式 URL 與 `realMedia` 守衛） | **35/35 PASS** |
| 前端 14 個 suite（12 ＋ `paywalltest` ＋ `media-verify`） | **0 失敗** |
| 真瀏覽器探針（真的 app，非 stub） | **9/11 PASS** |

**兩個必須誠實報告的插曲**
1. **`inittest`／`featuretest` 一度變紅**（1/4 與 6/33）：那些斷言把 demo 的劇集集合**寫死成 6 齣**（含 rating/views 排序快照），加 d7 就破壞。**渲染行為其實是對的**（實測順序正好等於 rating-desc／views-desc 的正確結果）。修法是把期望改成**由資料推導**（在測試裡定義 RATINGS/VIEWS 表再算出期望順序），而不是改資料去遷就測試。
2. **第一次瀏覽器探針回報「d7 是 12 集 + mux 片源」，我一度以為接線失敗**。用 `mock-d7.js`（Node 直接載入 mock-api）證明 **mock-api 完全正確**（10 集 + 真實 MP4 + 終章）；重跑探針就 **9/11**——那是**伺服器剛重啟時的暫時狀態**。教訓同 §1.9：**剛改完／剛重啟時看到的紅燈不算數**。
   - 剩下 2 個 FAIL 是**探針自己的問題**：它沒先 `openPlayer` 就檢查 `#episode-list`（該清單只在播放器開啟時才渲染）。鎖頭 UI 由 `paywalltest`（74 項）覆蓋。

**仍未做**：`serve.py` 的 Range 是**單一區間**（沒有 multipart/byteranges）；10 支成片 72 MB 進了 repo 工作區（OneDrive 會同步）；demo 只有這一齣用真實成片，其他劇仍是測試片源。

### 1.12 移除後端 `/ai/*`（含 `/ai/agent`、`/ai/tools`）與 `/openapi/*`（第十三輪，2026-10-07）

**使用者明確要求**：把後端 AI 這條線整條拔掉。範圍限縮在 `api/**`、`tests/**`、`_julang-analysis/verify-all.js`、`_julang-analysis/model-drift.js`、`HANDOFF.md`、`docs/**`；**`src/**` 由另一個 agent 負責，本輪完全沒動**。

**刪除的檔案（14 支 ＋ 1 個目錄）**

| 類別 | 檔案 | 為什麼可以刪 |
|---|---|---|
| 路由 | `api/routes/ai.js` `agent.js` `tools.js` `openapi.js` | 就是被要求移除的四條線；`routes/index.js` 的四行掛載同時拿掉 |
| Controller | `api/controllers/aiController.js` `agentController.js` `toolsController.js` `openapiController.js` | 只被上面四個路由檔 require（已用全 repo grep 確認沒有其他消費者） |
| Controller | `api/controllers/canvasController.js` | **只**被 `routes/agent.js` require（掛在 `/ai/agent/canvas`、`/ai/agent/panels`）→ 屬於 `/ai/*`，一併刪 |
| Middleware | `api/middleware/apiKeyAuth.js` | 只被 `routes/openapi.js` 與 `openapiController` 使用；兩者都刪了 |
| Services | `api/services/ai/`（`providers`／`llmService`／`imageService`／`videoService`） | 消費者只有 `aiController`／`openapiController`／`providers` 自己的 lazy require（`toolsController`）。全部刪掉後沒有任何殘留消費者 → 整個目錄刪除（`api/services/` 現在是空目錄） |
| 測試 | `tests/ai-asset.test.js`、`tests/agent-tools.test.js` | 整檔都在測被刪的 controller／service |

**修改的檔案**

| 檔案 | 改動 |
|---|---|
| `api/routes/index.js` | 移除 `router.use('/ai'…)`、`'/ai/agent'`、`'/ai/tools'`、`'/openapi'` 四行；其餘 15 個 route 檔掛載**一字未動** |
| `api/middleware/validate.js` | 檔頭舉例從已刪的 `agentController.blueprintSchema` 改成現存的 `creatorController.createDramaSchema`（純註解） |
| `api/middleware/rateLimit.js` | 檔頭說明更新：`aiLimiter` 自 v7.3 起**沒有任何路由使用**（保留匯出，見下） |
| `tests/canvas-draft.test.js` | 刪掉 `canvasController` 的 require、fixture（`COMIC_ROW`／`panelRow`）與 7 個 describe；**保留** `canvasProjectController`／`draftController` 全部測試（815 → 388 行） |
| `tests/middleware.test.js` | 刪掉 `middleware/apiKeyAuth` 的 describe 與只為它存在的 prisma/apiKey mock、`crypto`／`sha256` helper |
| `_julang-analysis/verify-all.js` | `required` 表移除 `canvasController`／`agentController`／`toolsController`／`aiController`／`openapiController`（**不改它就會永遠 FAIL**）；刪掉 require `apiKeyAuth`／`toolsController` 的「跨模組契約」段落（對象已不存在）；**新增 15 項否定檢查**（14 個檔案不得存在 ＋ `routes/index.js` 不得再 require `./ai|./agent|./tools|./openapi`），防止這條線悄悄長回來 |
| `_julang-analysis/model-drift.js` | 它 require 已刪的 `toolsController`／`services/ai/providers` → 依指示改成 **no-op（exit 0）**，檔頭寫清楚原因（它原本的診斷邏輯記在 §1.10 與本節） |

**必須保留（刻意沒動，附理由）**

- `api/controllers/canvasProjectController.js`、`draftController.js`：掛在 `/canvas`、`/drafts`，**不屬於 `/ai/*`**（`canvasController` 才是 `/ai/agent` 底下的那個，別搞混）。
- `prisma/schema.prisma`：`AiTask`／`ComposeTask`／`ApiKey`／`AiComic` 等模型**全部保留**——刪模型是破壞性 schema 變更，使用者沒要求；留著也能讓未來 AI 功能回頭接。
- 付費牆與其周邊：`dramaController` 的 free／locked／videoUrl、`adController`、`middleware/optionalAuth.js`、`cache.js` 的 per-user key（§1.10 的成果）。
- `api/middleware/rateLimit.js` 的 `aiLimiter` 匯出：目前無人使用，但 `tests/middleware.test.js` 有它的契約測試；要清掉請連測試一起改（已寫在檔頭）。
- `api/server.js`：`/health` 仍回 `ai.{llm,image,tts}` 三個布林、啟動 banner 仍印「🤖 AI 漫劇生成: …」。**刻意不動**——`/health` 的形狀是前端與驗收在讀的契約（任務只要求它 200），而且那三個值只是 `process.env` 的有無，不是路由。要一起清請由前端同步。
- `src/media/**`、`package.json`：不在本次範圍。

**驗收（全部是我自己在寫入停止後跑的）**

| 關卡 | 結果 |
|---|---|
| `node --check`（`api/**/*.js` 45 支逐檔） | **0 語法錯誤** |
| `backend-deadcheck.js` | `api/*.js files: 45`、**THREW on require = 0**、DEAD 4（`config/redis.js`／`server.js`／`socket/syncService.js`／`utils/prisma.js` —— §4 第 19 點已記載的「匯出無可列舉屬性」誤報，與本次無關）、OK 41 |
| `dep-closure.js` | 掃 42 檔、**0 個內部（相對路徑）模組缺失**；仍列 2 個**外部**套件 `ali-oss`／`@aws-sdk/client-s3` —— 那是 `utils/storage.js` 的 OSS/S3 轉接器在**建構子裡**才 require 的選用依賴（`STORAGE_PROVIDER=local` 時永不執行），本次改動前後完全一樣 |
| `verify-all.js` | **PASS — all 49 checks**（含 15 項「已移除」否定檢查），exit 0 |
| jest（`--ci --runInBand`） | **9 suites / 182 tests，0 失敗**，exit 0（§1.10 是 11 suites / 318 tests；少掉的正是 2 個整檔 ＋ 2 個被 trim 的 suite） |
| `node api/server.js` | **啟動成功**（見下方註記）；`GET /health` **200**；`GET /api/v1/dramas/recommend` **200**（真 Postgres，`total:6`）；`GET /api/v1/ai/tools/models` **404**；`GET /api/v1/openapi/v1/models` **404**；加測 `GET /api/v1/ai/capabilities`、`GET /api/v1/ai/agent/canvas/c1` 也都 **404** |

**誠實邊界／要注意的事**

1. **驗收時 3001 已被佔用**：機器上有一個**改動前**啟動的 `node api/server.js`（PID 75360，22:26 起就在跑，port 3001 LISTENING）。為了不干擾那個程序，上面那台是用 `PORT=3210 node api/server.js` 起的（同一支 server.js、同一份 `.env`，只換埠）；`backend-deadcheck` 也因為它會 require `server.js`（真的 listen）而改用 `PORT=3215` 跑。**那個舊程序跑的是舊程式碼**，要驗證新的 API 表面必須先把它關掉再重起。
2. **前端仍有一半在呼叫 `/ai/**`（那條線由另一個 agent 負責，我只讀不寫）**：本輪我看到 `src/js/ai-studio.js`、`agent-studio.js`、`canvas-editor.js`、`flow-canvas.js`、`libtv-tools.js`、`scriptwriter.js` 已經被前端 agent 刪掉，但**當下仍留著 `comic-player.js`（`/ai/comics/:id`、`/ai/comics/:id/episodes/:n`、`/ai/comics?limit=20`）與 `mock-api.js` 裡的整組 `/ai/**` mock 路由**。demo 模式走 mock 不受影響；**真實 API 模式（`?api=real`）下這些呼叫會 404**，收尾要看前端 agent 的進度。
3. **刪掉的 14 支檔案裡有 9 支是「未追蹤」的——git 救不回來**：`aiController`／`agentController`／`toolsController`／`canvasController`／`apiKeyAuth.js`／`api/services/ai/**`／兩個 AI 測試檔在刪除前都是 `??`（從沒 commit 過），所以 `git checkout` 無法還原，只能靠 §1.9 記錄的契約重寫。**可救的只有 tracked 的 5 支**：`git checkout -- api/routes/ai.js api/routes/agent.js api/routes/tools.js api/routes/openapi.js api/controllers/openapiController.js`。`_julang-analysis/` 不在任何 git repo 內，`model-drift.js` 的舊內容同樣不可還原（它的邏輯就是「比對 `tools.MODEL_LIBRARY` 與 `providers.getModel/modelCost`」，見 §1.10）。
4. **`API.md`（專案根目錄）不在本輪可寫範圍**，第 227／245／248／326 行仍記載 `/ai/comics`、`/ai/tasks`、`/ai/*`。要嘛由有權限的人更新，要嘛後續再處理。
5. `AiTask`／`ComposeTask` 這類表留著但沒有 worker，現在連建立它們的入口（`/ai/tasks`、`/ai/tools/compose`）都沒有了——這是刻意保留 schema 的結果，不是漏刪。

---

### 1.13 接手驗收 v7.5 對齊輪 ＋ 集數/直式滿版兩項調整（第十四輪，2026-10-08）

**接手狀態**：`HANDOFF-SESSION.md` §3.1 說「對齊 DramaBox 那一輪可能還沒落地」。確實還沒：另一個 session 的 **subagent（session `87d35644`）還在寫** `src/js/player-rail.js`（turn 1 / step 84）。等到 **120 秒完全沒有檔案寫入也沒有 session log 成長**才動手（工具：新寫的 `_julang-analysis/_quiet-watch.js`；判斷誰在寫用 `_recon-tails.js` 解 DSH 的 `session.v4.jsonl.zstd`，它是**串接多個 zstd frame**，`zstdDecompressSync` 只會解出第一顆，要自己掃 magic `28 B5 2F FD` 逐框解）。

**使用者本輪要求（原話）**：「集數不用放下面,放在浮出選單裡,格子變更小.」＋「影片豎頻播放如果是9:16,**一進播放器就自動全螢幕／直式滿版**」（後半句被截斷，已回問確認選項）。

**A. 前 13 輪成果的接手驗收（全部在寫入停止後跑）**

| 關卡 | 結果 |
|---|---|
| 前端 suite | **14/14 PASS**：checkids／checkhandlers／mocktest／inittest／rendertest／genrecoverage／migrationtest／featuretest(33)／apimodetest(14)／streamstest(6)／checkdupes／vipoffertest(17)／paywalltest(74)／media-verify(34) |
| jest | **10 suites / 198 tests，0 失敗** |
| `verify-all.js` | **PASS — all 49 checks** |
| `dep-closure.js` | 相對路徑缺失 0（僅 `ali-oss`／`@aws-sdk/client-s3` 兩個選用依賴） |
| `backend-deadcheck.js` | **THREW on require = 0**；DEAD 4 全是誤報（見下方「工具修正」） |
| 真 DB | query-check OK、smoke **18/18**、HTTP 寫入 **13/13**、unlock **17/17**、HTTP 洩漏 **12/12**、share-reward **11/11** |
| `rail-contract.js`（v7.5 那一輪自寫的 harness） | **60/60 PASS** |

**B. 本輪產品改動（`src/**`）**

| 檔案 | 改動 |
|---|---|
| `src/index.html` | ① 舊標題列加 `id="player-head"`（滿版時整列隱藏，操作改由覆蓋式頂列提供；`#player-title`／`#player-ep-total`／`#coin-amount` 仍留在 DOM，ui.js 照寫）。② `#episode-list` **節點保留但不再顯示**（它是 ui.js／`renderEpisodeList()` 的渲染目標，也是 paywalltest 74 項在讀的 DOM 契約） |
| `src/styles.css` | ① `#episode-list { display:none }`（集數 UI 只剩「選集」sheet，畫面上不會有第二份清單）。② `.rail-ep` 由 ~55px 縮到 **max-width 38px**、gap 8/6、radius 10、font 12px（維持使用者指定的 **6 欄**）。③ **新增 `.player-immersive` 區塊**：`padding:0`、播放區 `--jl-video-max-h:100dvh`、舊標題列與簡介隱藏、頂列／底部列改 `position:absolute` 覆蓋在畫面上（z-index 6，低於 rail z-70 與 sheet z-80） |
| `src/js/player.js` | 新增 `isPortraitVideo`／`applyImmersive`／`maybeAutoFullscreen`／`resyncAutoSize`；`watchNativeAspect` 的 `apply()` 在 `applyVideoAspect` 之後套用滿版；`Object.defineProperty(window,'artPlayer',{get,set})`。**只依真實 metadata 判斷**（`videoHeight > videoWidth`），橫式片源與 metadata 未到時完全維持原狀 |

**C. 真實瀏覽器驗證抓到兩個真 bug（都需要 Chrome，Node harness 看不到）**

1. **倍速整條是壞的（v7.5 就壞，harness 一路綠燈）**：`player.js` 的 `let artPlayer` 是**頂層 let，不會成為 `window` 的屬性**（只有 `var`／函式宣告會），但 `player-rail.js` 的倍速正是讀寫 `window.artPlayer` → 真實瀏覽器實測 `typeof window.artPlayer === 'undefined'`、標籤永遠 `1×`、**選 1.5× 只會變成 1.25×**（退回 `changeSpeed()` 依自己的順序跳）。修法：`Object.defineProperty` 用 getter 綁同一個 binding（destroy 後自然變 null，不必在三個 `artPlayer = null` 旁各補一行；setter 保留可寫，harness 才不會壞）。
   **為什麼 harness 沒抓到**：`rail-contract.js` 自己寫了 `W.artPlayer = W.__players[...]` 餵值 —— 那個 bug 就是被這行蓋掉的。本輪把它改成「**驗證產品程式碼自己提供了 `window.artPlayer`**」。
2. **直式畫面被壓成一條細畫面（改動前就存在）**：Artplayer 的 `autoSize` 在**容器還是預設 16:9（390×219）**時就把內層 `.art-video-player` 的 inline width 算成 `31.6406%`；metadata 之後容器變成 693px 高，它**不會自己重算** → 影片只有 123px 寬（外面一大片黑）。A/B 實測證明**與本輪改動無關**：手動移除 `.player-immersive`（＝改動前幾何 342×608）時內層同樣是 `31.6406%`。修法：比例／滿版套用完後呼叫 `resyncAutoSize()` —— 先讀一次 `getBoundingClientRect()` 強制重排，再叫 `art.autoSize()`（實測 `31.6406% → 99.9992%`，內層與容器同寬）。

**D. 工具修正（`_julang-analysis/`，都不是產品程式碼）**

| 工具 | 問題 | 修法 |
|---|---|---|
| `backend-deadcheck.js` | 它會 require `api/server.js`，而 server.js **真的 `app.listen(3001)`** → 跑完不退出（看起來像當掉）；若 API 已在跑則 EADDRINUSE 的 async error 直接炸掉、**連結果都印不出來**。§1.12 註 1 用 `PORT=3215` 繞過前半，但程序仍然不會結束 | 結尾補 `process.exit(0)`（判斷 dead code 的邏輯一字未動） |
| `pg/smoke-controllers.js` | 還在「載入」`canvasController`／`agentController`／`toolsController`／`aiController` —— 這 4 支已在 §1.12 依要求刪除 → **永遠 FAIL**（4/18） | 改成**否定檢查**「這些檔不該存在」→ **18/18 PASS** |
| `pg/http-write-test.js` | 斷言 `GET /ai/tools/models === 200`（AI 線還在時寫的）→ 永遠 FAIL（1/13） | 改成斷言 **404**（與 §1.12 的移除一致）→ **13/13 PASS** |
| `rail-contract.js` | 自己注入 `W.artPlayer`，蓋掉上面的倍速 bug | 改成驗證產品提供；59 → **60 checks** |
| 新增 `_quiet-watch.js`／`_recon-tails.js` | 沒有工具能回答「另一個 session 還在寫嗎」 | 前者監看 repo 樹＋session log 直到靜止；後者逐 zstd frame 解 DSH session log |

**E. 真瀏覽器實測數字（390×844 iframe、headless Chrome、d7《我在盛唐写天下》720×1280）**

`stateBeforeMetadata.immersive=false` → `stateAfterMetadata.immersive=true`；`#player-video` 與內層 `.art-video-player` 都是 **390×693**（= 容器，含 `width:99.9992%`）；頂列 `y=0`、底部列 `bottom=844`、rail 在影片範圍內；`#episode-list`／`#player-head`／`#player-desc` 皆 `display:none`；`boxMaxH=844px`（移除 class 後回到 `607.68px`）；選集 sheet **6 欄、格子 38×38、font 12px**；PiP 縮圖仍 **96×55 / 內層 94×53（比例 1.77）**，滿版變數**沒有外溢**；倍速 `typeof window.artPlayer=object`、選 1.5× → `playbackRate=1.5`、標籤 `1.5×`；`consoleErrors=[]`。截圖／JSON：`_julang-analysis/probe-run/v76/{final-immersive.png,immersive.png,pip.png,ab-inner.png}` 與 `probe-run/reports.jsonl`。

**F. 誠實邊界**

1. **「自動原生全螢幕」實務上不會發生**：瀏覽器只允許在使用者手勢內進原生全螢幕，而 metadata 是非同步事件（手勢早已過期）。所以 `maybeAutoFullscreen()` 先檢查 `navigator.userActivation.isActive`，沒有就**完全不呼叫**（不硬闯、不留 console 錯誤）—— 實測 `autoFullscreenTried=true, fullscreen=false`。真正生效的是 **CSS 滿版**那一層。
2. **9:16 採 contain、不裁切**：390×844（9:19.5）裝 9:16 的片，寬度滿版、上下各留 75px 黑帶（頂列／底部列正好落在黑帶上）。要 **cover（裁切填滿）** 是另一個決定，本輪沒做。
3. **API 已重啟**：原本那台（PID 85744）是 share-reward 之前起的（實測 `/coins/share-reward` **404**）；重啟後變 **401**（路由在、需登入）。前端預覽 4173 與 Postgres 55432 一直沒動。
4. `#episode-list` 是「隱藏但仍在 DOM」，不是刪掉：paywalltest 74 項要讀它的 innerHTML 驗鎖頭。要真正移除得同時改那個 suite。
5. DEAD 4（`config/redis.js`／`server.js`／`socket/syncService.js`／`utils/prisma.js`）**全是誤報**：前三者匯出的物件沒有可列舉屬性，`syncService` 匯出的是 **class**（`Object.keys(SomeClass)` 恆為 `[]`）—— 反證是 `api/server.js:42` 的 `new SyncService(server)` **沒有** try/catch，若真的沒匯出東西 API 根本起不來（實測 health 200）。

---

### 1.14 贈送影片後端（會員送好友免費看）＋ CORS 修正（第十五輪，2026-10-08）

**使用者要求**：把畫面那句「會員可贈送短劇給好友免費觀看」做成真的（先前前端只能誠實顯示「尚未開通」，因為後端沒有贈送碼／領取模型）。

**A. Schema（新增，非破壞性）**

- `prisma/schema.prisma` 新增 `DramaGift`（`code` 唯一／`dramaId`／`senderId`／`claimedById?`／`claimedAt?`／`episodesGranted`／`expiresAt`），`User` 加 `sentGifts`／`claimedGifts` 兩個**具名**關聯，`Drama` 加 `gifts` 反關聯。
- **套用方式刻意不用 `prisma db push`**：先用 `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` 確認真 DB 與**改動前**的 schema 完全同步（結果是 `-- This is an empty migration.`），再取得「只新增」的精確 DDL（`_julang-analysis/gift-ddl.sql`：1 張表 + 3 索引 + 3 FK），用 `pg` 直接套用（新工具 `_julang-analysis/pg/apply-sql.js`）。這樣資料庫只會多一張表，不會被 db push 猜測性變更。
- `prisma generate` 回 **EPERM（DLL rename，§4 陷阱 7）**，但 JS client 其實已寫出 → 用新工具 `pg/check-gift-client.js` **實測** `prisma.dramaGift` 的 `create/findFirst/updateMany/count` 都在，不採信 exit code。

**B. 後端**

| 檔案 | 內容 |
|---|---|
| `api/controllers/giftController.js`（新） | `createGift`（**只認觀眾方案** `AUDIENCE_PLANS`；整齣免費或沒有付費集 → 400「不發空券」；每人每日 5 組 → 429；碼 8 碼 crypto 隨機、只用無歧義字元、撞 `P2002` 重試）／`myGifts`／`previewGift`（**不改狀態**）／`claimGift`（**條件式 `updateMany({where:{code, claimedById:null, expiresAt:{gt:now}}})`** 做單次領取，並在同一個互動式 `$transaction` 內寫 `UnlockedEpisode(cost:0)`，只涵蓋 `episodeNumber > FREE_EPISODES`） |
| `api/routes/gifts.js`（新） | `POST /`、`GET /mine`、`GET /:code`、`POST /:code/claim`；全部 `auth`；**`/mine` 必須在 `/:code` 之前**，否則會被當成一個 code |
| `api/routes/index.js` | 掛 `/gifts`（與 `/giftcodes` 不同：後者是**兌換碼換金幣**，不是送片） |
| `api/controllers/subscriptionController.js` | 匯出 `AUDIENCE_PLANS`（單一來源：前端與後端用同一份方案表判斷會員） |
| `api/server.js` + `.env` | CORS 修正（見下方 F） |

**C. 前端（`src/js/player-rail.js`、`src/styles.css`）**

- **會員判定改成與後端同一條規則**：`/subscription` 有效 **且** 方案屬於 `/subscription/plans` 的 `group:'audience'`（拿不到清單時 **fail-closed**）。先前是 `plan !== 'free'`，創作者工具方案（週卡）會被誤認為會員 → 前端給按鈕、後端 403。
- 贈送籤：會員 → 「產生贈送碼」→ 顯示碼本體（等寬大字、可整段選取）＋「複製贈送連結」。碼**綁劇**（換劇清掉，避免拿 A 劇的碼送 B 劇）；文案裡的集數／到期日**全部來自伺服器回應**，前端不寫死 7 天／5 組（漂移就變假數字）。
- 領取：`#gift=CODE` deep link 進來自動領取並直接開該劇；未登入先記住碼、開登入框，登入成功後由 `doLogin` 的包裝續領。
- 新增 `.rail-gift-code`／`.rail-gift-err` CSS。

**D. 驗收**

| 關卡 | 結果 |
|---|---|
| jest | **11 suites / 231 tests**（新增 `tests/gift.test.js` 33 項：非會員/過期 403、空券 400、每日上限 429、撞號重試、自領 400、已領 409、過期 410、`createMany` 只含付費集且 `cost:0`、條件式 `updateMany` 的 where、並發輸家 409 且不寫解鎖、`$transaction` 用法） |
| `verify-all.js` | **PASS — all 51 checks**（+ `giftController` 匯出契約 + `gifts.js [4 routes]`） |
| `rail-contract.js` | **64/64**（新增：會員判定對照 plans 的 audience 組／真的 POST `/gifts` 且 body 帶 dramaId／碼與複製連結顯示／deep link 形狀／創作者方案不給入口） |
| 真 DB + 真 HTTP（**新工具** `pg/gift-verify.js`） | **26/26**：fixture 8 集付費劇；未登入 401／非會員 403／送禮者自領 400／過期 410／每日上限 429／領取 200 解鎖 3 集／**領取後第 6 集 `unlocked:true` 且拿得到 `videoUrl`（同一條付費牆）**／第 7、8 集一起解鎖／匿名與送禮者自己仍 locked／重複領 409／DB `claimed_by_id`、`episodes_granted`、`unlocked_episodes` 3 筆 `cost=0`、金幣沒被扣／收拾乾淨 |
| 真瀏覽器（Chrome 390×844、**真 API + 真 DB + CORS**） | 送禮者：註冊 200 → 開通 `viewer_weekly` 200 → 贈送籤顯示「產生贈送碼」→ 產生 `UCHWQSST`（3 集）＋複製連結；收禮者：領取前 ep6 `locked`/`null` → **`#gift=CODE` 自動領取（`claimed=true`、`playerOpen=true`）→ ep6 `unlocked` 且有 `videoUrl`、ep7 也解鎖** → 匿名仍 locked → 再領 **409** |
| 全套回歸 | **26/26 關**（14 支前端 suite + rail-contract + verify-all + dep-closure + deadcheck + jest + 7 支真 DB：query-check／smoke 18/18／HTTP 寫入 13/13／unlock 17/17／洩漏 12/12／share-reward 11/11／**gift 26/26**） |

**E. 誠實邊界**

1. 贈送碼是**憑證**、不是指定收件人：拿到碼的人（登入後）就能領。要指定好友得再加邀請/綁定流程。
2. 沒有金幣成本（會員權益），所以也沒有退款／收回流程。
3. Demo（mock）模式沒有這條路由 → UI 明說「Demo 模式沒有贈送後端」，不假裝成功。
4. `previewGift` 需要登入（不開放匿名枚舉；碼本身 40 bits 隨機，但少一個入口少一分風險）。
5. **9:16 是否改 cover（裁切填滿）仍待使用者決定**（目前 contain，見 §1.13 F-2）。

**F. 順手抓到的真缺陷：CORS 讓「`?api=real`」根本接不上**

- 症狀：開 `http://127.0.0.1:4173/?api=real` 時前端每個請求都 `Failed to fetch`（很容易誤判成「後端沒開」）。
- 原因：`api/server.js` 只吃**單一** `FRONTEND_URL`，而 `.env` 是 `http://localhost:3000`。實測 `Origin: http://127.0.0.1:4173` 拿回 `Access-Control-Allow-Origin: http://localhost:3000` → 瀏覽器直接擋掉。也就是 §3 待辦 3「開 `?api=real` 即切到真實 API」這條路**在瀏覽器裡是死的**。
- 修法：`FRONTEND_URL` 支援**逗號分隔多來源**（server.js 拆成陣列；未設定時維持 `'*'`），`.env` 加入 `http://127.0.0.1:4173,http://localhost:4173`。修完實測：三個預覽來源都被 echo，未知來源 `http://evil.example` **沒有** ACAO（仍是白名單，沒有退化成 `*`）。

---

## 2. 每次改完必跑（全部在 `_julang-analysis/`）

```powershell
$src = "C:\Users\chien\OneDrive\Documents\deepseek-harness\default-workspace\julang-platform\src"
$a   = "C:\Users\chien\OneDrive\Documents\deepseek-harness\default-workspace\_julang-analysis"
node "$a\checkids.js"     "$src\js" "$src\index.html"   # 176 個必要 id 是否齊全、有無重複
node "$a\checkdupes.js"   "$src\index.html"             # 全頁 id 有無重複
node "$a\checkhandlers.js" "$src\js" "$src\index.html"  # 每個 inline onclick 的函式是否存在
node "$a\mocktest.js"     "$src\js"                     # 25 支 script 是否都能載入 + 資料層
node "$a\inittest.js"     "$src\js"                     # 只跑 app.js init()，斷言 feed 真的渲染
node "$a\rendertest.js"   "$src\js"                     # 渲染/互動 9 項
node "$a\genrecoverage.js" "$src\js"                    # 21 分類都搜得到 + 每分類有影片
node "$a\migrationtest.js" "$src\js"                    # 孤兒 localStorage 是否清掉
node "$a\featuretest.js"  "$src\js"                     # 3.1-3.4 驗收 33 項（分頁排序/角標、PiP 不 destroy、金幣同步、彈窗記憶）
node "$a\apimodetest.js"  "$src\js"                     # demo/真實資料層切換 14 項（?api=real 不得被 demo 層污染）
node "$a\streamstest.js"  "$src\js"                     # 21 分類是否都有明確、多樣的免費 clip（6 項）
node "$a\vipoffertest.js" "<專案目錄>"                   # VIP 角標是否真的由 /subscription/plans 驅動（13 項，含與後端 PLANS 的價格防漂移比對）
node "$a\backend-deadcheck.js" "<專案目錄>"              # api/ 哪些檔案其實是 dead（require 得動但 exports 為空）
node "$a\handlerprobe.js" "$src\js" "$src\index.html"   # （診斷用）handler 到底定義在哪個檔
```

後端（在 `julang-platform/` 目錄下跑）：

```powershell
# 依賴與 Prisma（要注意沙箱限制，見 §4 第 13-15 點）
& "$env:ProgramFiles\nodejs\npm.cmd" install --cache "<workspace>\_julang-analysis\.npm-cache"
node node_modules\prisma\build\index.js validate      # schema 是否合法
node node_modules\prisma\build\index.js generate      # 產生 typed client
node node_modules\prisma\build\index.js migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > ddl.sql
node node_modules\jest\bin\jest.js --ci --runInBand    # 9 suites / 182 tests（v7.3，AI 相關 suite 已移除）
node "$a\backend-audit.js" .                           # 還缺哪些後端模組（含依賴者）
```

**注意**：測試腳本會自動從 `index.html` 讀 script 清單（`scriptlist.js`），所以新增 script 不用改測試。**但新增 script 一定要真的插進 HTML**——我曾因為註解裡出現 `js/home-rows.js` 字樣，導致守衛誤判、標籤根本沒插進去，三排全空。

`featuretest.js` 的關鍵設計：sandbox 內必須提供 `window.Hls`，否則 `loadPlayerLibs()` 會卡在永不觸發的 CDN `<script>` onload，`initArtPlayer()` 永遠不完成；Artplayer stub 會記錄 `destroy/play/pause` 次數，才能證明 closePlayer 是「停靠」而不是「銷毀」。

### 需要截圖／實機驗證時
本沙箱**無法啟動 Chrome**（連 `chrome --version` 都無輸出；crashpad 被擋），要用 **`danger-full-access`** 升級權限才能跑。範例：

```powershell
& $chrome --headless=new --disable-gpu --no-sandbox --no-first-run --disable-crashpad --hide-scrollbars `
  "--user-data-dir=$out\prof" --virtual-time-budget=25000 --window-size=512,900 `
  --screenshot=$png "http://127.0.0.1:4173/?v=$(Get-Date -Format HHmmss)"
```

驗證用的手法：把 app 放進 **390×844 的 iframe**，由父頁呼叫 `homeTab('new')`／`openPlayer('d1')`＋`closePlayer()`／`switchTab(...)` 把 app 推進某個狀態，再讀 `getBoundingClientRect()` 算重疊、讀 `getComputedStyle()` 看哪個圖層被藏掉，最後 `fetch` POST 到 `_julang-analysis/collector.js`（127.0.0.1:4174）——因為這個環境的 `--dump-dom` **吐不出東西**（實測 0 bytes），POST 比 dump 可靠。可重用的驅動頁存在 `_julang-analysis/probe-pages/_verify.html`（用之前複製進 `src/`，量完刪掉，別留在 src）。

證據在 `_julang-analysis/probe-run/`：`verify-nav.png`／`new.png`／`exclusive.png`／`pip.png`／`final-*.png` 是截圖；`reports.jsonl` 是量測 JSONL，**目前只剩最後兩筆（`nav` 與 `pip`）**——第一輪的五筆在這份 scratch log 被截斷時掉了（原因未查明，可能是 OneDrive 同步），第一輪的數字以 §1.1 表格為準，PNG 都還在。

- 深層連結：`#feed` / `#theater` / `#welfare` / `#manju` / `#follow` / `#rank` / **`#play=d1`**（直接開播放器）
- 頁面會把診斷寫進 `#__diag`（`DIAG {...}`）
- **headless Chrome 最小視窗寬約 512px**：`--window-size=390,844` 會用 512 排版再裁成 390，看起來像「右邊被切掉」——那是截圖假象，不是版面溢出。用 iframe 就沒有這個問題。
- 截圖時機不一定落在互動之後（實測同一頁的 `--screenshot` 與 POST 量測會不同步），**量測數字比截圖可靠**。

### 這個 scratch 目錄有 3 GB 的 Chrome profile 垃圾（無法從 session 內刪除）
`_julang-analysis/` 下有近百個 `prof*` 目錄（前幾輪留下的，約 2.8 GB）＋第二輪的 `probe-run/`（168 MB）。**本 session 刪不掉**：這些是 Chrome 建立、帶 **Low integrity label + No-Write-Up** 的檔案，Medium integrity 的 agent 程序會被 Windows 拒絕（`Access to the path is denied`）。已用 `diagnose-windows-sandbox-acl` skill 驗過：權限本身沒問題（`VERDICT=NOT_THIS_CLASS`、`FIXED=0`、未改動任何東西），所以不是 ACL 也不是 DSH 沙箱問題。要清掉請在檔案總管手動刪（Windows 可能跳 UAC），或用管理員權限的 shell。**未來跑 Chrome 請把 `--user-data-dir` 指到 workspace 之外**（例如 `$env:TEMP`），就不會再累積。

---

## 3. 待辦

**前端預覽已無待辦**（原 3.1–3.5 全部完成，見 §1.1）。後端／資料層這條線的現況見 §1.2，剩下的工作依序是：

1. **備妥 Postgres**。設定與 DDL 都已就緒（`_julang-analysis/prisma-ddl.sql`、`.env` 的 `DATABASE_URL`），但這台機器沒有 Postgres。任一選項：裝本機 Postgres、連遠端實例、或讓 Docker daemon 可用。有了之後：`prisma migrate deploy`（或 `prisma db push`）→ `npm run seed`。
2. **寫出 16 個缺失模組**（12 controllers + 4 AI services，清單見 §1.2）。這是「接真實資料層」的主體工作量。路由檔已把每個端點的 handler 與 schema 名稱寫好，照著實作即可。建議先做 `dramaController` + `authController` + `userController`，就能讓預覽的核心路徑（首頁／分類／詳情／登入／金幣）跑在真實資料上。
   - ⚠️ **v7.3 更新**：這 16 個模組早就補齊了（§1.9），但其中 **4 個 AI service 與 5 個 controller 已依使用者要求刪除**（§1.12）。這條待辦現在只剩「如果有天要把 AI 線接回來，請從 git 歷史還原」，不是現行工作項。
3. **接上前端**：後端起來後開 `http://127.0.0.1:4173/?api=real`（或設 `localStorage.julang_api_mode='real'`）即切到真實 API；預設仍是 demo，不會破壞現有預覽。CORS 由 `.env` 的 `FRONTEND_URL` 控制。
4. **清 scratch 目錄骨架**：見 §2 結尾（Chrome profile 的空目錄骨架需要手動刪）。

---

## 4. 踩過的坑（別再犯）

1. **`//` 註解吃掉整檔**：repo 有 4 個檔案被壓成單行。修復時若把換行插在錯的位置，會讓程式碼留在註解裡（`await Promise.all(...)` 就這樣消失過）。修完必跑 `inittest.js`（它就是為此而生）。
2. **`episodes` 型別**：`render.js` 卡片印 `${drama.episodes}集`，**列表必須保持數字**；只有詳情頁 `/dramas/:id` 才是陣列。把列表改成陣列會出現 `[object Object]集`。
3. **id 契約**：改動 HTML 後必跑 `checkids.js`。我刪過 `#coin-count`、`#ai-done-watch-btn`、`#ag-watch-btn`，三次都是它抓到。第二輪新增的 id（`#pip-card`、`#pip-video-slot`、`#player-video-home`、`#pip-label`、`#coin-pill`、`#coin-pill-count`、`#coin-pill-delta`、`#promo-popup`、`#promo-close`、三個 `row-*-title`）都在契約內。
4. **函式名稱要用真名**：`showAssets`✗→`showAssetLib`、`showFlow`✗→`showFlowCanvas`、`showDirector`✗→`dgOpen`、`showAuth`✗→`showLogin`、`switchAuthTab`✗→`showLoginForm`/`showRegister`。改完跑 `checkhandlers.js`。
5. **PowerShell 引號**：`node -e "…"` 內含 `[`、`"`、`${}` 經常被 PowerShell 解析壞掉（整個指令不會執行）。**一律寫成 `.js` 檔再跑**。
6. **別用 `Measure` 或單字母當函式名**（與內建 alias 衝突）：PowerShell 的解析順序是 **alias > function > cmdlet**，所以 `function R($n,$c){…}` 會被別名 `r`（= `Invoke-History`）蓋掉 —— 本輪的彙總跑分因此印出「0 passed, 0 failed」的假結果（測試其實都跑了，只有回報壞掉）。用 `Show-Res` 這類不會撞名的名字。
7. **快取**：只用 `serve.py`（no-store）。使用者若看到舊畫面，請他 Ctrl+Shift+R。
8. **Tailwind Play CDN 在 styles.css 之後注入**，所以 `body { margin: 0 auto }` 這類會被蓋掉。**同理 `.hidden` 會被蓋**：任何「元素本身有 `display:flex/block`」的 id 要自己補 `#id.hidden { display:none }`（第二輪的 `#coin-pill`／`#promo-popup`／`#pip-card` 都補了）。
9. **這裡的 shell 是 Windows PowerShell 5.1**，`pwsh` 不在 PATH；`.ps1` 直接被 ExecutionPolicy 擋掉。要跑腳本用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File <path>`。
10. **檔案一旦含 NUL 位元組，工具會當成二進位**：`read` 會拒絕、`grep` **靜默跳過**整個檔（不是報錯）。第二輪就是這樣差點誤判 `showCheckin` 不存在。懷疑某檔「查不到」時，用 `handlerprobe.js` 或 Node 直接載入 bundle 求證，別只信 grep。
11. **Chrome 的 `--user-data-dir` 別放 workspace 內**：產生的檔案帶 Low integrity label，之後 session 刪不掉（詳見 §2 結尾）。
12. **底部分頁是「位置綁定」**：`ui.js` 的 `tabMap` 用索引對應 `.nav-item`，任何分頁都要記得列進 `tabMap`，否則點它**完全不會高亮**（`inspire` 就漏過一次，3.5 才補上）。只能改標籤文字，不能改前五個的順序。
13. **npm 的 cache 預設在 workspace 外**（`%LOCALAPPDATA%\npm-cache`），沙箱直接擋（EPERM）→ 一定要加 `--cache <workspace 內路徑>`。但即使改了 cache，npm 仍會 `spawn EPERM`（它用 piped stdio 開子程序），這是**沙箱的既有邊界**，只能對該指令升級權限一次。`npx` 同理會被擋，所以這裡一律直接 `node node_modules\<pkg>\...`。
14. **Prisma 的引擎指令也會 `spawn EPERM`**：`prisma validate` 不需要引擎（可直接跑），但 `generate` 與 `migrate diff` 要啟動 engine binary，需升級一次。反過來說，`migrate diff --from-empty --to-schema-datamodel` **不需要資料庫**，是沒有 DB 時驗證 schema 的最好辦法。
15. **`node_modules` 約 198 MB 且會被 OneDrive 同步**：`.gitignore` 有忽略，但 OneDrive 不看 git；要省空間可以事後刪掉，要跑後端/測試時再裝回來。
16. **串流「回 200」不等於「能播」**：master playlist 200 可能它的 variant 根本沒 segment（實測 longtail 就是）；segments 也可能是 fMP4 而非 MPEG-TS（用 TS 解析器會誤判成壞掉）；還可能是 Dolby Vision／HEVC 這種瀏覽器解不了的編碼。驗證要分層：playlist → variant → segment → **codec**（TS 看 `stream_type 0x1B`；fMP4 看 `avc1`）。工具：`probe-streams.js`、`verify-clips.js`、`verify-segments.js`、`diagnose-risk.js`。
17. **`.view-section` 是絕對定位的覆蓋層**：`position:absolute; inset:0` 讓它蓋住整個 `#app-main`，於是任何放在 `#app-main` 內、view 之前的兄弟節點（例如 `#home-tabs`）都會被壓在底下，而 view 內 `absolute top-0` 的元素（例如 `#home-chips`）會疊在內容上。要「排在影片之上」的東西必須是 flex 項目或正常流，別用 absolute。定位驗證用 iframe 量 `getBoundingClientRect()`（見 §1.4）。
18. **`showPanel` 的第一個參數是「panel 名」不是「分頁名」**：`home-tabs.js` 的 panel 只有 `pick` / `rows`，但底線要比對 `data-tab`（pick/new/rank/genres/exclusive/manju）。兩者混用會讓底線**整排消失**（`tab-active` 全被拿掉）。用 `showPanel(name, activeName)` 分開。
19. **`//` 吃檔的災情不只在前端**：`api/` 也有 3 個檔案被壓成單行、第一個 `//` 之後的程式碼全被註解掉——`controllers/subscriptionController.js`、`socket/syncService.js`、`utils/storage.js`。它們**可以 require、不會報錯，但 exports 是空的**（`routes/subscriptions.js` 因此丟 `Route.get() requires a callback function`）。偵測：`backend-deadcheck.js`（逐一 require 並列出 exports；注意 `config/redis.js`、`utils/prisma.js` 匯出的是「沒有可列舉屬性的物件」，會被誤報為 dead）。修復：`repair-comments.js`——它 **1)** 只搬空白（把「忽略空白後內容完全相同」當成硬性不變式）、**2)** 用 `vm.Script` 先編譯，**不編譯就不寫檔**、**3)** 事後再掃一次「`//` 後面還跟著程式碼」的殘留。**教訓**：第一版只認得 `const/function/if...` 這些關鍵字，漏掉 `await prisma...` 與 `socket.on(...)` 這兩種開頭，結果把 2 個檔案改成語法錯誤（幸好 git checkout 可一鍵還原）——所以守衛比修復本身重要。

---

20. **頂層 `let` 不是 `window` 的屬性**（只有 `var`／函式宣告會）。`src/js/player.js` 的 `let artPlayer` 就是這樣：跨檔的 `player-rail.js` 讀寫 `window.artPlayer` 永遠拿到 `undefined`，於是**倍速整條是壞的**（標籤永遠 1×、選 1.5× 變 1.25×）。要跨檔共用實例就明示 `Object.defineProperty(window, x, { get, set })`（getter 讀同一個 binding，destroy 後自然變 null）。**判斷準則：`typeof window.X` 也要在真實瀏覽器量一次**，見 §1.13 C-1。
21. **`harness 自己補值`＝掩蓋 bug**：`rail-contract.js` 為了測倍速而自己寫 `W.artPlayer = ...`，結果那個 bug 被蓋掉、一路綠燈。harness 只能**驗證產品提供**了什麼，不能**代替產品提供**。同理：harness 的 DOM/CSS stub 看不到的東西（幾何、CSS、真 metadata）**一定要有真實瀏覽器那一關**。
22. **Artplayer 的 `autoSize` 只算一次，而且是在容器比例還沒定案時算的**：它把內層 `.art-video-player` 的 inline `width` 寫死成百分比（實測 `31.6406%`，= metadata 前 390×219 那個 16:9 容器算出來的），容器之後長高也**不會**重算 → 直式成片被壓成一條 123px 細畫面。修法：比例變更後先讀一次 `getBoundingClientRect()` 強制重排、再呼叫 `art.autoSize()`（`resyncAutoSize()`）。**教訓：容器比例對 ≠ 畫面比例對 —— 量 `#player-video` 之餘一定要量內層 `.art-video-player` 的 rect。**
23. **`backend-deadcheck.js` 會真的 listen 而永遠不退出**：它 require `api/server.js`，後者 `app.listen(3001)` → 跑完不結束（看起來像當掉）；API 已在跑時則以 EADDRINUSE 的 **async** error 炸掉、連結果都印不出。判斷 dead code 的邏輯與此無關，所以檔尾補了 `process.exit(0)`。另外它的判準 `Object.keys(mod)` 對**匯出 class 的模組恆為空** → `socket/syncService.js` 是誤報（反證：`server.js:42` 的 `new SyncService(server)` 沒有 try/catch，真沒匯出東西 API 起不來）。
24. **「等寫入者停手」的監看範圍要含整個 repo**：我第一次只掃 `src`／`api`／`prisma`／`tests`，就漏掉 repo 根目錄 `API.md`（00:52:47 那次寫入），差點誤判「已經靜止」。而且**檔案 mtime 不是可靠的活性訊號**（同步、rename 都會動它）—— 要一起看「另一個 session 的 log 有沒有在長」（`_quiet-watch.js`；DSH 的 session log 是**串接多個 zstd frame**，要自己掃 magic `28 B5 2F FD` 逐框解，`zstdDecompressSync` 只給你第一顆）。

---

25. **真 DB 的 HTTP 測試會被自己的 rate limiter 擋掉**：`api/middleware/rateLimit.js` 的 `authLimiter` 是 **15 分鐘 / 20 次**（`apiLimiter` 15 分鐘 / 600 次），而 `pg/http-write-test.js` 與 `pg/http-leak-test.js` **每次都要 `POST /auth/register`**。同一輪驗收把這兩支跑超過 3～4 次就會開始回 **429**，接著整串 FAIL —— 看起來像產品壞了，其實是限流生效（本輪親身踩到：連跑三輪後 `http-write-test` 4/4 FAIL、`http-leak-test` 5/12 FAIL）。**重啟 API 就會歸零**（express-rate-limit 的 MemoryStore，不是 Redis）。所以真 DB 驗收請一次跑完，不要反覆重跑；要重跑就先重啟 API。

---

26. **CORS 只寫一個來源，文件上寫的驗收路徑就是死的**：`FRONTEND_URL` 原本只有 `http://localhost:3000`，但預覽跑在 `127.0.0.1:4173` → 瀏覽器把 `?api=real` 的每個請求擋掉，前端只看到 `Failed to fetch`（極容易誤判成「API 沒開」）。已改成**逗號分隔多來源**（`server.js` 拆陣列，未設定時仍是 `'*'`）。**診斷法**：`Invoke-WebRequest -Headers @{Origin='http://127.0.0.1:4173'} <apiUrl>` 直接看回來的 `Access-Control-Allow-Origin` 是什麼；修好後未知來源應該**完全沒有**這個標頭（白名單，不是退化成 `*`）。
27. **只改 hash 的 iframe 導覽不會重載文件**：探針第一版用 `iframe.src = '/index.html?api=real#gift=CODE'` 想「帶著 deep link 重新載入」，但與當前 URL 只差 fragment → 那是 **fragment 導覽**：不重載、`load` 事件不觸發 → 探針靜靜卡死、連報告都沒送出（看起來像探針邏輯壞了）。要真的重載就加 cache-buster（`&r=<timestamp>`）或先設 `about:blank`。**同場加映**：長流程探針要**分階段 POST** —— headless 的虛擬時間預算一用完整個 process 就結束，最後才送出的那一份會直接消失（第一版就是這樣白跑一趟）。

---

## 5. 參考資料

- 版面參考：DramaBox/DramaWave 短劇 App（全出血豎屏、TikTok 式上滑、分類磚牆、2 欄格狀首頁）
- 分類來源：https://www.dramaboxdb.com/zh/genres → 21 個分類
- 產品拆解：https://www.woshipm.com/evaluating/6102785.html （紅果：底部 首頁/福利/追劇/我的）
