// ===== v6.0 開放平台路由 =====
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/openapiController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const { aiLimiter } = require('../middleware/rateLimit');

// AccessKey 管理（站內登入）
router.post('/keys', auth, validate(ctrl.createKeySchema), ctrl.createApiKey);
router.get('/keys', auth, ctrl.listApiKeys);
router.delete('/keys/:id', auth, ctrl.revokeApiKey);

// OpenAPI 生成接口（X-Api-Key 鑒權 + 配額計費）
router.get('/v1/models', apiKeyAuth, ctrl.openapiModels);
router.get('/v1/usage', apiKeyAuth, ctrl.openapiUsage);
router.post('/v1/generate/script', apiKeyAuth, aiLimiter, validate(ctrl.genScriptSchema), ctrl.openapiScript);
router.post('/v1/generate/image', apiKeyAuth, aiLimiter, validate(ctrl.genImageSchema), ctrl.openapiImage);
router.post('/v1/generate/video', apiKeyAuth, aiLimiter, validate(ctrl.genVideoSchema), ctrl.openapiVideo);

module.exports = router;
