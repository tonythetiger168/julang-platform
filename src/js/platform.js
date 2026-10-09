/* ===== Platform layer (reconstruction-only) =====
 *
 * The product ships as two apps — iOS and Android — that must look and behave
 * the SAME. There is one shared design system; the stylesheet deliberately does
 * NOT branch on platform. (An earlier revision gave each platform its native
 * chrome — iOS blur, Android Material elevation/ripple — which made the two
 * builds diverge, so that was removed.)
 *
 * Detection is kept only for platform plumbing: status-bar / PWA meta, native
 * bridges, and build diagnostics. It is exposed as <html data-platform> and
 * window.__platform.
 */
(function () {
  var ua = navigator.userAgent || '';
  var touch = navigator.maxTouchPoints || 0;
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && touch > 1);
  var isAndroid = /Android/.test(ua) && !isIOS;
  var platform = isIOS ? 'ios' : (isAndroid ? 'android' : 'web');

  var root = document.documentElement;
  root.setAttribute('data-platform', platform);
  root.classList.add('platform-' + platform);
  window.__platform = platform;

  // Shared interaction only: no ripple on one platform and press-scale on the
  // other. The single press feedback lives in styles.css for both.
})();
