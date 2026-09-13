// ===== v6.0 創作畫布雲端保存路由 =====
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/canvasProjectController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

router.get('/projects', auth, ctrl.listProjects);
router.post('/projects', auth, validate(ctrl.saveSchema), ctrl.saveProject);
router.get('/projects/:id', auth, ctrl.getProject);
router.delete('/projects/:id', auth, ctrl.deleteProject);
router.get('/projects/:id/versions', auth, ctrl.listVersions);
router.post('/projects/:id/restore/:versionId', auth, ctrl.restoreVersion);

module.exports = router;
