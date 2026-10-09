const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/commentController');

/* v7.7 劇集留言：刪除端點。
 *
 * 列表與新增掛在 /dramas/:id/comments（api/routes/drama.js）——資源層級在那裡，
 * 而且列表要 optionalAuth（未登入可看）。這裡只放「跨劇」的單則留言操作。
 *
 * 與社群漫劇留言（DELETE /community/comments/:commentId，ComicComment）是
 * **不同資源**，路徑刻意分開，別互相 require。 */
router.delete('/:commentId', auth, ctrl.removeDramaComment);

module.exports = router;
