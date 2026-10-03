const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/creatorController');

router.post('/apply', auth, ctrl.apply);
router.get('/dashboard', auth, ctrl.getDashboard);
router.post('/withdraw', auth, ctrl.withdraw);

module.exports = router;
