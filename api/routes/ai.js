const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { aiLimiter } = require('../middleware/rateLimit');

// 公開接口
router.get('/capabilities', aiController.getCapabilities);
router.get('/comics', aiController.listComics);
router.get('/comics/:id', aiController.getComic);
router.get('/comics/:id/episodes/:n', aiController.getEpisodePanels);

// 需登入接口（AI 生成，獨立限流）
router.post('/tasks', auth, aiLimiter, validate(aiController.createTaskSchema), aiController.createTask);
router.get('/tasks', auth, aiController.getMyTasks);
router.get('/tasks/:id', auth, aiController.getTaskStatus);

module.exports = router;
