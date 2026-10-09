const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/giftController');

/* v7.6 贈送影片：會員產生贈送碼 → 好友領取 → 免費解鎖該劇的付費集。
 * 全部需要登入（`/giftcodes` 是另一條線：那是**兌換碼換金幣**，不是送片）。
 * 路由順序：`/mine` 一定要在 `/:code` 之前，否則會被當成一個 code。 */
router.post('/', auth, ctrl.createGift);
router.get('/mine', auth, ctrl.myGifts);
router.get('/:code', auth, ctrl.previewGift);
router.post('/:code/claim', auth, ctrl.claimGift);

module.exports = router;
