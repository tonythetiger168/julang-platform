const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const canvasController = require('../controllers/canvasController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { aiLimiter } = require('../middleware/rateLimit');

// ===== 短劇 Agent 工作流（需登入 + AI 限流） =====
router.post('/blueprint', auth, aiLimiter, validate(agentController.blueprintSchema), agentController.createBlueprint);
router.post('/characters', auth, aiLimiter, validate(agentController.characterSchema), agentController.createCharacterCards);
router.post('/produce', auth, aiLimiter, validate(agentController.produceSchema), agentController.produce);
router.get('/comics/:comicId/characters', agentController.getCharacters);

// ===== v6.0 深化：多輪改稿 + 角色卡編輯 =====
router.post('/blueprint/revise', auth, aiLimiter, validate(agentController.reviseSchema), agentController.reviseBlueprint);
router.patch('/comics/:comicId/characters/:charId', auth, validate(agentController.updateCharacterSchema), agentController.updateCharacter);
router.post('/comics/:comicId/characters/:charId/avatar', auth, aiLimiter, agentController.regenerateAvatar);

// ===== 智能畫布編輯（需登入） =====
router.get('/canvas/:comicId', auth, canvasController.getCanvasData);
router.patch('/panels/:panelId', auth, validate(canvasController.editPanelSchema), canvasController.editPanel);
router.post('/panels/:panelId/redraw', auth, aiLimiter, validate(canvasController.redrawSchema), canvasController.redrawPanel);
router.post('/panels/:panelId/undo', auth, canvasController.undoPanel);
router.post('/canvas/batch-redraw', auth, aiLimiter, validate(canvasController.batchRedrawSchema), canvasController.batchRedraw);
router.post('/comics/:comicId/restyle', auth, aiLimiter, validate(canvasController.redrawSchema), canvasController.restyleComic);

module.exports = router;
