/* ===== 超值優惠 promo popup (3.4, reconstruction-only) =====
 *
 * The floating offer card from the reference screenshot: a gradient card in the
 * bottom-right corner with a × in the top-right. It shows on load, and once the
 * visitor closes it the choice is remembered in localStorage so it does not come
 * back on the next visit.
 *
 * The markup ships with .hidden so a slow load never flashes the card before
 * this module decides whether it should be visible.
 */
(function () {
  var DISMISS_KEY = 'julang_promo_dismissed';

  function wasDismissed() {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch (e) {
      return false; // private mode / storage disabled: treat as "not dismissed"
    }
  }

  function showPromo() {
    var card = document.getElementById('promo-popup');
    if (!card) return false;
    if (wasDismissed()) {
      card.classList.add('hidden');
      return false;
    }
    card.classList.remove('hidden');
    return true;
  }

  function dismissPromo() {
    var card = document.getElementById('promo-popup');
    if (card) card.classList.add('hidden');
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch (e) { /* still hidden for this session */ }
  }

  window.showPromo = showPromo;
  window.dismissPromo = dismissPromo;
  window.PROMO_DISMISS_KEY = DISMISS_KEY;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showPromo);
  else showPromo();
})();
