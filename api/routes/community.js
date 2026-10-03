const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const auth = require('../middleware/auth');
const { optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

// 靈感社區（公開瀏覽）
router.get('/works', communityController.listWorks);
router.get('/works/:id', communityController.getWorkDetail);
router.get('/works/:id/comments', optionalAuth, communityController.listComments);

// 互動（需登入）
router.post('/works/:id/like', auth, communityController.toggleLike);
router.post('/works/:id/favorite', auth, communityController.toggleFavorite);
router.post('/works/:id/remix', auth, communityController.remix);
router.post('/works/:id/comments', auth, validate(communityController.commentSchema), communityController.addComment);
router.delete('/comments/:commentId', auth, communityController.deleteComment);
router.get('/favorites', auth, communityController.myFavorites);

module.exports = router;
