require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit');
const http = require('http');
const SyncService = require('./socket/syncService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(apiLimiter);

// v6.2：素材庫靜態訪問（/uploads/assets/<filename>）
app.use('/uploads', express.static(require('path').join(__dirname, '..', 'uploads'), { maxAge: '7d' }));
app.use('/uploads/assets', express.static(require('path').join(__dirname, '..', 'uploads', 'assets'), { maxAge: '30d' }));

app.get('/health', (req, res) => res.json({
  status: 'ok',
  version: '7.2.0',
  ai: {
    llm: !!process.env.AI_LLM_API_KEY,
    image: !!process.env.AI_IMAGE_API_KEY,
    tts: !!process.env.AI_TTS_API_KEY,
  },
  time: new Date().toISOString(),
}));

app.use('/api/v1', routes);

// v7.1：硬幣經濟系統（參考 DramaBox）
// 注意：subscription/coins/checkin/ads/giftcodes 路由已統一在 routes/index.js 中掛載

// v7.2: 統一錯誤處理中間件（Prisma/JWT/驗證錯誤自動識別）
const { errorHandler } = require('./middleware/errorHandler');
app.use(errorHandler);

// v7.0：啟動 Socket.io 實時同步
const syncService = new SyncService(server);

server.listen(PORT, () => {
  console.log(`🎬 劇浪 API v7.2 運行中: http://localhost:${PORT}`);
  console.log(`📖 健康檢查: http://localhost:${PORT}/health`);
  console.log(`⚡ Redis 緩存 + 推薦算法引擎 已啟用`);
  console.log(`🔌 Socket.io 實時同步 已啟用`);
  console.log(`💳 訂閱制變現系統 已啟用`);
  console.log(`🤖 AI 漫劇生成: LLM=${!!process.env.AI_LLM_API_KEY ? 'API' : '內置模板'} 繪圖=${!!process.env.AI_IMAGE_API_KEY ? 'API' : '占位圖'} TTS=${!!process.env.AI_TTS_API_KEY ? 'API' : 'Web Speech 降級'}`);
});
