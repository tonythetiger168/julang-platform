const express = require('express');
const router = express.Router();
const dramaController = require('../controllers/dramaController');
const communityController = require('../controllers/communityController');
const cache = require('../middleware/cache');

router.use('/auth', require('./auth'));
router.use('/dramas', require('./drama'));
// v7.7 劇集留言的刪除端點（列表／新增在 ./drama 的 /:id/comments）
router.use('/comments', require('./comments'));
router.use('/user', require('./user'));
router.use('/creators', require('./creator'));
// v7.3：/ai、/ai/agent、/ai/tools、/openapi 整條線已移除（連同其 controller 與 services/ai）
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
// v7.6 贈送影片（會員送給好友免費看）：與上面的 giftcodes 不同——那是兌換碼換金幣
router.use('/gifts', require('./gifts'));
router.use('/subscription', require('./subscriptions'));

// 頂層快捷路由（與文檔保持一致）
router.get('/categories', cache('cat', 600), dramaController.getCategories);
router.get('/rankings/:type', cache('rank', 300), dramaController.getRankings);

// v6.0 聚合搜索（參考 LibreTV）
router.get('/search/all', communityController.searchAll);

module.exports = router;
