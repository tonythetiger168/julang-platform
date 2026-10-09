# 交接文檔 — 2026-10-08 session（v7.6 輪）

> 對象：接手的人（或下一個 session 的我）。
> 專案：`julang-platform`（劇浪：AI 短劇／漫劇平台，vanilla JS 前端 + Express + Prisma + Postgres）
> 這份是**這次 session 的總結**；長期交接在 `HANDOFF.md`（§1.1–**§1.13** 為歷次紀錄，§2 必跑，§4 陷阱）。**兩份一起看。**

---

## 0. 現在能跑什麼（環境）

| 服務 | 位置 | 狀態 |
|---|---|---|
| 預覽（靜態） | `http://127.0.0.1:4173/` | 執行中（`_julang-analysis/serve.py`，有 HTTP Range、no-store） |
| API | `http://127.0.0.1:3001/` | 執行中（`node api/server.js`）。**本輪已重啟**：舊程序是 `/coins/share-reward` 之前起的（實測 404），重啟後該端點回 **401**（路由在、需登入） |
| PostgreSQL 18.4 | `postgresql://postgres@127.0.0.1:55432/julang?schema=public` | 執行中（可攜式二進位，無需管理員） |
| 真 DB 內容 | 38 張表；seed：8 劇／3 用戶／9 分類／1 漫劇 | 已 `prisma db push` + `seed.js` |

啟動指令（重開機後照貼）：
```powershell
& "<工作區>\_julang-analysis\pg\node_modules\@embedded-postgres\windows-x64\native\bin\postgres.exe" `
  -D "<工作區>\_julang-analysis\pg\data" -p 55432 -c listen_addresses=127.0.0.1
cd <專案>; node api/server.js
python "<工作區>\_julang-analysis\serve.py" "<專案>\src" 4173
```

---

## 1. 這次 session 做了什麼

### A. 接手前先確認「上一個 writer 停手了」
`HANDOFF-SESSION`（舊版）§3.1 說「對齊 DramaBox 那輪可能還沒落地」——**當時確實還在跑**：另一個 session 的 subagent（session `87d35644`）turn 1 / step 84，正在改 `src/js/player-rail.js`。等 **120 秒無寫入且它的 session log 不再成長**才動手。
工具：`_julang-analysis/_quiet-watch.js`（監看整個 repo ＋ session log 直到靜止）、`_recon-tails.js`（讀 DSH session log；它是**串接多個 zstd frame**，要自己掃 magic `28 B5 2F FD` 逐框解）。

### B. v7.5 對齊輪的接手驗收 → 全綠（見 §2）

### C. 使用者本輪要求（原話）與實作
1. 「**集數不用放下面，放在浮出選單裡，格子變更小**」
   - `index.html`：`#episode-list` **保留節點但不再顯示**（它是 ui.js／`renderEpisodeList()` 的渲染目標，也是 `paywalltest` 74 項在讀的 DOM 契約）。
   - `styles.css`：`#episode-list { display:none }`；`.rail-ep` 由 ~55px 縮到 **max-width 38px**、gap 8/6、radius 10、font 12px（維持使用者指定的 **6 欄**）。集數 UI 只剩「選集」bottom sheet。
2. 「**影片豎頻播放如果是 9:16 → 一進播放器就自動全螢幕／直式滿版**」（原句被截斷，已回問確認）
   - `player.js`：`isPortraitVideo`／`applyImmersive`／`maybeAutoFullscreen`／`resyncAutoSize`；**只依真實 metadata**（`videoHeight > videoWidth`），橫式與 metadata 未到時完全維持原狀。
   - `styles.css`：新增 `.player-immersive`（padding 0、播放區 `--jl-video-max-h:100dvh`、舊標題列／簡介隱藏、頂列／底部列改成 absolute 覆蓋在畫面上）。
   - `index.html`：舊標題列加 `id="player-head"`（滿版時整列隱藏；`#player-title` 等 id 仍留著給 ui.js 寫）。

### D. 真實瀏覽器驗證抓到 **兩個真 bug**（Node harness 看不到）
1. **倍速整條是壞的（v7.5 就壞，harness 一直綠燈）**：`player.js` 的 `let artPlayer` 是**頂層 let，不會變成 `window` 屬性**，而 `player-rail.js` 的倍速靠 `window.artPlayer` → 實測 `typeof window.artPlayer === 'undefined'`、標籤永遠 `1×`、**選 1.5× 只會變 1.25×**。修法：`Object.defineProperty(window,'artPlayer',{get,set})` 綁同一個 binding。
   **被掩蓋的原因**：`rail-contract.js` 自己寫 `W.artPlayer = …` 餵值 —— 本輪已改成「驗證產品自己提供」。
2. **直式畫面被壓成一條 123px 細畫面（改動前就存在）**：Artplayer `autoSize` 在容器還是預設 16:9（390×219）時就把內層 `.art-video-player` 的 inline width 寫成 `31.6406%`，之後容器變 693px 高也不會重算。A/B 實測證明與本輪改動無關。修法：比例套用完後 `resyncAutoSize()`（先讀幾何強制重排，再 `art.autoSize()`）→ `31.6406% → 99.9992%`。

### E. 工具修正（`_julang-analysis/`，非產品程式碼）
| 工具 | 修正 |
|---|---|
| `backend-deadcheck.js` | 它 require `api/server.js`（真的 listen）→ 跑完不退出；API 在跑時還 EADDRINUSE 炸掉。檔尾補 `process.exit(0)` |
| `pg/smoke-controllers.js` | 移除 4 支已刪 controller 的載入，改成否定檢查（4/18 → **18/18**） |
| `pg/http-write-test.js` | `/ai/tools/models` 由斷言 200 改 **404**（1/13 → **13/13**） |
| `rail-contract.js` | 不再自行注入 `W.artPlayer`；59 → **60 checks** |
| 新增 `_quiet-watch.js`／`_recon-tails.js` | 「另一個 session 還在寫嗎」的判斷工具 |

---

### F. 贈送影片後端（v7.6，本輪）：把「會員可贈送給好友免費觀看」做成真的

- **Schema**：新增 `DramaGift`（`code` 唯一＋`dramaId`／`senderId`／`claimedById?`／`claimedAt?`／`episodesGranted`／`expiresAt`）＋ `User` 兩個具名關聯 ＋ `Drama` 反關聯。**只用 diff 出的 DDL 手動套用**（改動前先確認真 DB 與 schema 同步＝`-- This is an empty migration.`），沒有讓 `prisma db push` 猜。`prisma generate` 回 EPERM 但 client 有寫出（用 `pg/check-gift-client.js` 實測）。
- **後端**：`api/controllers/giftController.js`、`api/routes/gifts.js`（`POST /gifts`、`GET /gifts/mine`、`GET /gifts/:code`、`POST /gifts/:code/claim`，全部需登入），掛在 `routes/index.js` 的 `/gifts`。領取＝**條件式 `updateMany`** 單次領取 + 同一筆交易內寫 `UnlockedEpisode(cost:0)`（**同一條付費牆**，只涵蓋 `episodeNumber > FREE_EPISODES`）。會員只認 `/subscription/plans` 的 `group:'audience'`。
- **前端**：`player-rail.js` 贈送籤改成真的產生碼＋複製連結（碼綁劇、數字取自伺服器）；`#gift=CODE` deep link 自動領取；未登入先記住碼、登入後由 `doLogin` 包裝續領。
- **細節、驗收數字與誠實邊界見 `HANDOFF.md` §1.14**（26/26 真 DB、真瀏覽器全流程、jest 231、rail-contract 64）。

### G. 順手修掉的真缺陷：CORS 讓 `?api=real` 接不上

`api/server.js` 只吃單一 `FRONTEND_URL`，而 `.env` 是 `http://localhost:3000`；預覽在 `127.0.0.1:4173` → 瀏覽器把每個請求都擋掉（前端只看到 `Failed to fetch`）。已改成**逗號分隔多來源**並把預覽來源加進 `.env`；實測未知來源不會拿到 ACAO（仍白名單）。詳見 `HANDOFF.md` §1.14 F 與 §4 陷阱 26。

---

## 2. 驗證狀態（截至本文件，全部在寫入停止後跑）

| 關卡 | 結果 |
|---|---|
| 前端 14 個 suite | **全 PASS**：checkids／checkhandlers／mocktest／inittest／rendertest／genrecoverage／migrationtest／featuretest(33)／apimodetest(14)／streamstest(6)／checkdupes／vipoffertest(17)／paywalltest(74)／media-verify(34) |
| jest | **11 suites / 231 tests，0 失敗**（+`tests/gift.test.js` 33 項） |
| API 閘門 | `verify-all.js` **51/51**（+giftController 契約 + `gifts.js [4 routes]`）；`dep-closure.js` 相對路徑缺失 **0** |
| 後端健康 | `backend-deadcheck.js` **THREW=0**（DEAD 4 全是誤報，見 `HANDOFF.md` §1.13 F-5） |
| 契約 harness | `rail-contract.js` **64/64**（+贈送流程 4 項） |
| 真 DB（HTTP） | query-check OK、smoke **18/18**、HTTP 寫入 **13/13**、unlock **17/17**、HTTP 洩漏 **12/12**、share-reward **11/11**、**gift 26/26**（新工具 `pg/gift-verify.js`） |
| 真瀏覽器（390×844 iframe + headless Chrome + 真 API + 真 DB） | ① **v7.6 滿版**：9:16（720×1280）→ `immersive=true`；容器與內層都 **390×693**（`width:99.9992%`）；頂列 `y=0`、底部列 `bottom=844`；`#episode-list`／`#player-head`／`#player-desc` 皆 `display:none`；選集 sheet **6 欄、格子 38×38**；PiP 仍 **96×55（比例 1.77）**；倍速選 1.5× → `playbackRate=1.5`、標籤 `1.5×`；`consoleErrors=[]`。② **贈送影片**：送禮者產生碼 `UCHWQSST`（3 集）→ 收禮者開 `#gift=CODE` **自動領取（`claimed=true`、`playerOpen=true`）** → 第 6 集由 `locked/null` 變 `unlocked` 且有 `videoUrl`、第 7 集也解鎖 → 匿名仍 locked → 再領 **409** |

證據：`_julang-analysis/probe-run/v76/{final-immersive.png,immersive.png,pip.png,ab-inner.png}` ＋ `probe-run/reports.jsonl`。

---

## 3. 未完成 / 待決（接手請從這裡開始）

### 3.1 明確未做
| 項目 | 說明 |
|---|---|
| **9:16 是否要 cover（裁切填滿）** | 目前是 **contain**：寬度滿版、上下各留 75px 黑帶（頂列／底部列正好落在黑帶上）。要填滿就得裁切左右，需使用者決定。 |
| **自動「原生」全螢幕** | 瀏覽器只允許在使用者手勢內進原生全螢幕，而 metadata 是 async 事件（手勢已過期）→ 實測 `autoFullscreenTried=true, fullscreen=false`。**實際生效的是 CSS 滿版**；`maybeAutoFullscreen()` 只在 `navigator.userActivation.isActive` 時才呼叫（不硬闯、不留 console 錯）。 |
| **贈送影片的「指定收件人」** | 後端已做完（見 §1）：贈送碼、`POST /gifts`、`GET /gifts/:code`、`POST /gifts/:code/claim`、會員（audience 方案）限定、單次領取、7 天效期、每日上限。**但碼本身即憑證**——拿到碼的人登入後就能領，不能指定給某個好友；要指定得再加邀請/綁定流程。也沒有「收回/退款」流程（送片不扣幣）。 |
| **`CoinTransaction` 唯一約束** | 只有 `@@index([userId,type])`，極端併發可能重複發幣；根治要改 schema。 |
| **真廣告 SDK** | `showRewardedAd()` 是應用內模擬倒數，沒有廣告平台 server-side 驗籤。 |
| **第 3 集續看率埋點** | 研究指出這是最該盯的留存指標，尚未量測。 |
| **`Category.name` 是否加 `@unique`** | 產品決定（會讓重名 insert 直接失敗）。 |
| **`#episode-list` 徹底移除** | 目前是「隱藏但仍在 DOM」；要真移除得同時改 `paywalltest.js`（74 項裡有 3 處讀它）。 |
| **`syncService.js` 的註解災情** | 它仍是單行壓縮檔（`//` 吞掉同一行後面的程式碼、CJK 是 mojibake），只是 `module.exports = SyncService` 剛好在行尾所以還活著。`repair-comments.js` 可修，但**無法在本機用真 socket 客戶端驗證** → 沒動。 |

### 3.2 使用者尚未回答
- 9:16 已回「一進播放器就自動全螢幕／直式滿版」（已實作）。
- 「集數放浮出選單、格子變小」已實作。
- 「贈送影片做成真的」已實作（本輪，見 §1）。
- **仍待決定**：9:16 要不要改成 **cover（裁切填滿）**（目前 contain，上下各留 75px 黑帶）。

---

## 4. 必跑的驗收（複製貼上）

```powershell
$p="<專案>"; $a="<工作區>\_julang-analysis"
# 前端 14 支。注意：checkdupes 只吃 index.html —— 舊版把它跟其他 suite 一起傳
# 「js 目錄 + index.html」兩個參數，會 EISDIR 直接 crash（本輪修正）。
$js="$p\src\js"; $html="$p\src\index.html"
foreach($f in "checkids","checkhandlers","mocktest","inittest","rendertest","genrecoverage","migrationtest","featuretest","apimodetest","streamstest"){ node "$a\$f.js" $js $html }
node "$a\checkdupes.js" $html
node "$a\vipoffertest.js" $p; node "$a\paywalltest.js" $p; node "$a\media-verify.js" $p
node "$a\rail-contract.js" $p        # 外框契約 harness（64 checks，不是那 14 支之一）
# jest（在專案目錄）
node node_modules\jest\bin\jest.js --ci --runInBand
# API 閘門 / 後端健康
node "$a\verify-all.js" $p; node "$a\backend-deadcheck.js" $p; node "$a\dep-closure.js" $p
# 真 DB（Prisma 引擎需要權限升級；DB 要先啟動；HTTP 那幾支要 API 在跑）
node "$a\pg\query-check.js" $p; node "$a\pg\smoke-controllers.js" $p; node "$a\pg\http-write-test.js" $p
node "$a\pg\unlock-verify.js" $p; node "$a\pg\http-leak-test.js" $p; node "$a\pg\share-reward-verify.js" $p
node "$a\pg\gift-verify.js" $p      # v7.6 贈送影片端到端（26 checks；自建 fixture、自己收拾）
```

`backend-deadcheck.js` 本輪已補 `process.exit(0)`（它 require `api/server.js`，不然永遠不退出）。

⚠️ **真 DB 那兩支 HTTP 測試不要反覆重跑**：`authLimiter` 是 **15 分鐘 / 20 次**，而 `http-write-test` 與 `http-leak-test` 每次都要註冊新用戶。同一輪跑超過 3～4 次就會回 **429**，整串看起來像壞掉（本輪踩過）。**重啟 API 就歸零**（MemoryStore，不是 Redis）—— 先重啟再重跑。

瀏覽器驗證：探針頁要**同源**才能 iframe 存取（複製進 `src/`，量完刪掉，別留在 src）；結果 POST 到 `collector.js`（:4174）。**headless Chrome 需要權限升級**（`--user-data-dir` 指到 workspace 之外，別再累積 Low-integrity profile）。本輪的探針腳本沒有留下（只留報告與截圖）；要做同類驗證就照 `probe-run/v76/` 的 JSON 欄位重寫一份。

---

## 5. 陷阱與教訓（這次踩過的，別再踩；完整版見 `HANDOFF.md` §4）

1. **「上一個 writer 停手了嗎」不能只看檔案 mtime**：我第一次只掃 `src`／`api`／`prisma`／`tests`，漏掉 repo 根目錄 `API.md`（00:52:47 那次寫入），差點誤判靜止。要監看整個 repo，並一起看另一個 session 的 log 有沒有成長。
2. **DSH 的 session log 是串接多個 zstd frame**：`zlib.zstdDecompressSync` 只給你第一顆（session header），要自己掃 magic 逐框解。
3. **harness 自己補值＝掩蓋 bug**：`rail-contract.js` 補了 `W.artPlayer`，於是 `window.artPlayer` 其實不存在這件事一路綠燈。harness 只能驗證產品**提供**了什麼。
4. **容器比例對 ≠ 畫面比例對**：Artplayer 會把內層 `.art-video-player` 的 inline width 寫死；量 `#player-video` 之餘**一定要量內層 rect**。
5. **頂層 `let` 不是 `window` 屬性**（只有 `var`／函式宣告會）——跨檔共用實例要用 `Object.defineProperty` getter 或 `var`。
6. **`backend-deadcheck.js` 的 `Object.keys()` 對「匯出 class」的模組恆為空** → `syncService.js` 被誤報 DEAD；反證是 `server.js:42` 的 `new SyncService(server)` 沒有 try/catch，真沒匯出東西 API 起不來。
7. **PowerShell `Get-Content` 讀 UTF-8 中文會亂碼**（別用它判斷檔案內容好壞；用 `read` 工具或 Node）。
8. 舊的：`//` 吃檔、NUL 位元組、`type:'m3u8'` 硬寫、Tailwind Play CDN 在 `styles.css` 之後注入（要 `#id` 選擇器）、Chrome `--user-data-dir` 別放 workspace 內。

---

## 6. 檔案地圖（本輪產出的關鍵檔案）

**修改（產品）**：`src/index.html`（`#player-head`、`#episode-list` 改註解）、`src/styles.css`（`#episode-list` 隱藏、`.rail-ep` 縮小、新增 `.player-immersive`，以及贈送的 `.rail-gift-code`／`.rail-gift-err`）、`src/js/player.js`（滿版 + `resyncAutoSize` + `window.artPlayer` accessor）、`src/js/player-rail.js`（贈送流程：會員判定對照 plans、產生碼、deep link 領取）
**修改（後端）**：`prisma/schema.prisma`（+`DramaGift`）、`api/routes/index.js`（掛 `/gifts`）、`api/controllers/subscriptionController.js`（匯出 `AUDIENCE_PLANS`）、`api/server.js`（CORS 多來源）、`.env`（`FRONTEND_URL` 三個來源）
**新增（後端）**：`api/controllers/giftController.js`、`api/routes/gifts.js`、`tests/gift.test.js`
**新增（工具）**：`_julang-analysis/pg/{gift-verify,gift-browser-fixture,apply-sql,check-gift-client,check-gift-leftovers}.js`、`gift-ddl.sql`
**修改（工具）**：`_julang-analysis/backend-deadcheck.js`、`rail-contract.js`、`pg/smoke-controllers.js`、`pg/http-write-test.js`
**新增（工具）**：`_julang-analysis/_quiet-watch.js`、`_recon-tails.js`
**新增（證據）**：`_julang-analysis/probe-run/v76/*.png`（含 `gift.png` 送禮者畫面）、`probe-run/reports.jsonl`（v76 與 gift 那幾筆）
**文件**：`HANDOFF.md`（新增 §1.13、§1.14、§4 陷阱 20–27）、**本檔**
