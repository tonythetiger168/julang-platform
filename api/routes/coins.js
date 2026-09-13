const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/coinController');

router.get('/packages', ctrl.getPackages);
router.get('/balance', auth, ctrl.getBalance);
router.post('/purchase', auth, ctrl.purchaseCoins);
router.post('/unlock', auth, ctrl.unlockEpisode);
// v7.2：連看獎勵
router.post('/binge-reward', auth, ctrl.bingeReward);
router.get('/unlocked/:dramaId', auth, ctrl.getUnlockStatus);

module.exports = router;
