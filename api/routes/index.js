const express = require('express');
const router = express.Router();
const dramaController = require('../controllers/dramaController');
const communityController = require('../controllers/communityController');
const cache = require('../middleware/cache');

router.use('/auth', require('./auth'));
router.use('/dramas', require('./drama'));
router.use('/user', require('./user'));
router.use('/creators', require('./creator'));
router.use('/ai', require('./ai'));
router.use('/ai/agent', require('./agent'));
router.use('/ai/tools', require('./tools'));
router.use('/openapi', require('./openapi'));
router.use('/canvas', require('./canvas'));
router.use('/community', require('./community'));

// v7.2 修復：掛載素材庫 / 草稿 / 監控路由（此前檔案存在但未掛載，API 全部 404）
router.use('/assets', require('./assets'));
router.use('/drafts', require('./drafts'));
router.use('/monitor', require('./monitor'));

// v7.1 DramaBox 硬幣經濟系統
router.use('/coins', require('./coins'));
router.use('/checkin', require('./checkins'));
router.use('/ads', require('./ads'));
router.use('/giftcodes', require('./giftcodes'));
router.use('/subscription', require('./subscriptions'));

// 頂層快捷路由（與文檔保持一致）
router.get('/categories', cache('cat', 600), dramaController.getCategories);
router.get('/rankings/:type', cache('rank', 300), dramaController.getRankings);

// v6.0 聚合搜索（參考 LibreTV）
router.get('/search/all', communityController.searchAll);

module.exports = router;
