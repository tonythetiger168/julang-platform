/* ===== 劇浪平台全局配置 v6.2 ===== */
// @ts-check

const API_BASE = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3001/api/v1';
  }
  return window.location.origin + '/api/v1';
})();

const CONFIG = {
  version: '6.2.0',
  appName: '劇浪',
  apiBase: API_BASE,

  // v6.2 新增：API 重試與超時配置
  api: {
    retries: 2,
    retryDelay: 1000,
    timeout: 15000,
  },

  storageKeys: {
    token: 'julang_token',
    searchHistory: 'searchHistory',
    userPrefs: 'julang_prefs',
    offlineQueue: 'julang_offline_queue',
    drafts: 'julang_drafts',
    assets: 'julang_assets',
  },

  player: {
    theme: '#f43f5e',
    lang: 'zh-cn',
  },

  pagination: {
    feedLimit: 50,
    theaterLimit: 6,
    manjuLimit: 4,
  },

  // v6.2 新增：功能開關
  features: {
    cloudSync: false,
    autoSave: true,
    sentry: false,
    analytics: false,
  },
};

window.CONFIG = CONFIG;
