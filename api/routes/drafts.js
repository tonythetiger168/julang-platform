const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const draftController = require('../controllers/draftController');

router.get('/', auth, draftController.list);
router.post('/', auth, draftController.create);
router.put('/:id', auth, draftController.update);
router.delete('/:id', auth, draftController.remove);

module.exports = router;
