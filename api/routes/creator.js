const express = require('express');
const router = express.Router();
const creatorController = require('../controllers/creatorController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// 公開接口

// 需登入接口
router.post('/register', authenticate, validate(creatorController.registerSchema), creatorController.register);
router.get('/me/profile', authenticate, creatorController.getProfile);
router.patch('/me/profile', authenticate, validate(creatorController.registerSchema.partial()), creatorController.updateProfile);
router.get('/me/dramas', authenticate, creatorController.getMyDramas);
router.post('/me/dramas', authenticate, validate(creatorController.createDramaSchema), creatorController.createDrama);
router.patch('/me/dramas/:id', authenticate, validate(creatorController.updateDramaSchema), creatorController.updateDrama);
router.post('/me/dramas/:id/episodes', authenticate, validate(creatorController.addEpisodeSchema), creatorController.addEpisode);
router.delete('/me/dramas/:dramaId/episodes/:episodeId', authenticate, creatorController.deleteEpisode);
router.get('/me/dashboard', authenticate, creatorController.getDashboard);
router.get('/me/audit-logs', authenticate, creatorController.getAuditLogs);

router.get('/:id/profile', creatorController.getPublicProfile);
router.post('/:id/follow', authenticate, creatorController.toggleFollow);

module.exports = router;
