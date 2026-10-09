/* ===== Coin pill (3.3, reconstruction-only) =====
 *
 * A floating balance chip pinned to the bottom-right corner, above the tab bar,
 * mirroring the header's #coin-count — the same value the 福利 card already
 * shadows. A MutationObserver keeps it in step, which is the mechanism
 * index.html already uses for #welfare-coins. The writers of #coin-count are
 * render.js loadUserCoins() (seeds the demo balance) and ui.js showCheckin()
 * (adds the daily reward), so listening to that one node covers both.
 *
 * updateCoinPill() is exported so any flow (or the test suite) can force a
 * resync without depending on the observer firing. When the balance grows, the
 * delta is flashed above the pill — the "+802" affordance from the reference
 * screenshot.
 */
(function () {
  function readBalance() {
    var cc = document.getElementById('coin-count');
    var txt = cc ? String(cc.textContent == null ? '' : cc.textContent).trim() : '';
    return txt || '0';
  }

  function flashDelta(from, to) {
    var badge = document.getElementById('coin-pill-delta');
    if (!badge) return;
    var a = parseInt(String(from).replace(/[^0-9-]/g, ''), 10);
    var b = parseInt(String(to).replace(/[^0-9-]/g, ''), 10);
    if (isNaN(a) || isNaN(b) || b <= a) return;
    badge.textContent = '+' + (b - a);
    badge.classList.remove('hidden');
    setTimeout(function () { badge.classList.add('hidden'); }, 2600);
  }

  var last = null;

  function updateCoinPill() {
    var host = document.getElementById('coin-pill-count');
    var pill = document.getElementById('coin-pill');
    if (pill) pill.classList.remove('hidden');
    if (!host) return false;
    var now = readBalance();
    if (last !== null && now !== last) flashDelta(last, now);
    host.textContent = now;
    last = now;
    return true;
  }

  function start() {
    updateCoinPill();
    var cc = document.getElementById('coin-count');
    if (cc && window.MutationObserver) {
      try {
        new MutationObserver(updateCoinPill).observe(cc, {
          childList: true, characterData: true, subtree: true,
        });
      } catch (e) { /* observer is an optimisation, not the only path */ }
    }
  }

  window.updateCoinPill = updateCoinPill;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
