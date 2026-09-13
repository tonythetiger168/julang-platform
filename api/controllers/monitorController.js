const { success, error } = require('../utils/response');

// POST /monitor/error
async function reportError(req, res) {
  try {
    console.error('[Monitor]', {
      userId: req.user?.userId,
      ...req.body,
      receivedAt: new Date().toISOString(),
    });
    success(res, null, '已記錄');
  } catch (e) {
    console.error('[Monitor] reportError error:', e);
    error(res, 500, '記錄失敗');
  }
}

// POST /monitor/vitals
async function reportVitals(req, res) {
  try {
    console.log('[Vitals]', {
      userId: req.user?.userId,
      ...req.body,
      receivedAt: new Date().toISOString(),
    });
    success(res, null, '已記錄');
  } catch (e) {
    console.error('[Monitor] reportVitals error:', e);
    error(res, 500, '記錄失敗');
  }
}

module.exports = { reportError, reportVitals };