const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const monitorController = require('../controllers/monitorController');

router.post('/error', optionalAuth, monitorController.reportError);
router.post('/vitals', optionalAuth, monitorController.reportVitals);

module.exports = router;
