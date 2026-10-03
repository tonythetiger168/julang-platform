const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/giftCodeController');

// v7.2：移除公開的 /list（此前免登入暴露全部禮品碼）
router.post('/redeem', auth, ctrl.redeemCode);

module.exports = router;
