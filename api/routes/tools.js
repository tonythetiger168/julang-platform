// ===== v6.0 LibTV 參考：創作工具路由 =====
const express = require('express');
const router = express.Router();
const toolsController = require('../controllers/toolsController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { aiLimiter } = require('../middleware/rateLimit');

// 模型庫（公開）
router.get('/models', toolsController.listModels);
// Agent 自動選型推薦（公開，僅元數據計算）
router.post('/models/recommend', validate(toolsController.recommendSchema), toolsController.recommendModels);

// 創作工具（需登入 + AI 限流）
router.post('/script-table', auth, aiLimiter, validate(toolsController.scriptTableSchema), toolsController.scriptTable);
router.post('/image-op', auth, aiLimiter, validate(toolsController.imageOpSchema), toolsController.imageOp);
router.post('/slash', auth, aiLimiter, validate(toolsController.slashSchema), toolsController.slashCommand);
router.post('/compose', auth, aiLimiter, validate(toolsController.composeSchema), toolsController.composeVideo);
router.get('/compose/:taskId', auth, toolsController.getComposeTask);
// v6.1 編劇工作台：AI 續寫 / 對白潤色
router.post('/script-assist', auth, aiLimiter, validate(toolsController.scriptAssistSchema), toolsController.scriptAssist);

module.exports = router;
