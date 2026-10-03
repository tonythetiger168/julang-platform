/* ===== 播放器模塊 ===== */
// @ts-check

let artPlayer = null;
let currentDrama = null;
let currentEpIndex = 0;

// 動態加載播放器庫（僅在首次播放時加載，減少首屏 80KB+）
let playerLibsLoaded = false;
async function loadPlayerLibs() {
  if (playerLibsLoaded) return;
  if (window.Artplayer && window.Hls) {
    playerLibsLoaded = true;
    return;
  }
  const loadScript = (url) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  await Promise.all([
    loadScript('https://cdn.jsdelivr.net/npm/artplayer@5.1.1/dist/artplayer.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js')
  ]);
  playerLibsLoaded = true;
}

async function initArtPlayer(url, poster) {
  await loadPlayerLibs(); // 確保庫已加載
  if (artPlayer) {
    artPlayer.destroy();
    artPlayer = null;
  }
  const container = document.getElementById('player-video');
  if (!container) return;
  container.innerHTML = '';
  artPlayer = new Artplayer({
    container: container,
    url: url,
    poster: poster,
    type: 'm3u8',
    autoSize: true,
    playbackRate: true,
    aspectRatio: true,
    pip: true,
    fullscreen: true,
    fullscreenWeb: true,
    miniProgressBar: true,
    setting: true,
    theme: CONFIG.player.theme,
    lang: CONFIG.player.lang,
    moreVideoAttr: {
      'webkit-playsinline': true,
      playsinline: true,
    },
    customType: {
      m3u8: function (video, url) {
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
        }
      },
    },
  });
}

function selectEp(index) {
  currentEpIndex = index;
  const eps = currentDrama?.episodes || [];
  document.querySelectorAll('#episode-list button').forEach((b, i) => {
    b.classList.remove('bg-rose-500', 'text-white');
    b.classList.add('bg-white/10', 'text-white/70');
    if (i === index) {
      b.classList.remove('bg-white/10', 'text-white/70');
      b.classList.add('bg-rose-500', 'text-white');
    }
  });
  if (eps[index]?.videoUrl && artPlayer) {
    artPlayer.switchUrl(eps[index].videoUrl);
  }
}

function prevEp() {
  if (currentEpIndex > 0) {
    selectEp(currentEpIndex - 1);
  }
}

function nextEp() {
  const eps = currentDrama?.episodes || [];
  if (currentEpIndex < eps.length - 1) {
    const nextIndex = currentEpIndex + 1;
    const nextEpisode = eps[nextIndex];
    // v7.1: 檢查是否需要扣幣（前 5 集免費）
    if (nextIndex >= 5 && !nextEpisode?.unlocked) {
      const cost = nextIndex >= 20 ? 8 : 5;
      showUnlockModal(nextIndex, cost);
      return;
    }
    selectEp(nextIndex);
  }
}

// v7.1: 解鎖確認彈窗（參考 DramaBox 改進版）
function showUnlockModal(episodeIndex, cost) {
  const modal = document.createElement('div');
  modal.id = 'unlock-modal';
  modal.className = 'fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm';
  modal.innerHTML = `
    <div class='bg-gray-900 border border-white/10 rounded-2xl max-w-sm w-[90%] p-6 shadow-2xl text-center'>
      <div class='text-4xl mb-3'>🔒</div>
      <h3 class='text-white font-bold text-lg mb-2'>解鎖第 ${episodeIndex + 1} 集</h3>
      <p class='text-white/60 text-sm mb-4'>本集需要 ${cost} 硬幣解鎖</p>
      <div class='flex items-center justify-center gap-2 text-amber-400 font-bold text-lg mb-5'>
        <span>🪙</span><span>${cost}</span>
      </div>
      <div class='space-y-2'>
        <button id='btn-unlock-coin' class='w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium hover:opacity-90 transition'>使用硬幣解鎖</button>
        <button id='btn-unlock-ad' class='w-full py-3 rounded-xl bg-white/10 text-white/80 font-medium hover:bg-white/20 transition'>📺 觀看廣告免費解鎖</button>
        <button id='btn-unlock-cancel' class='w-full py-2.5 rounded-xl text-white/40 text-sm hover:text-white/60 transition'>稍後再看</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector('#btn-unlock-coin').onclick = async () => {
    modal.remove();
    const res = await api.post('/coins/unlock', { dramaId: currentDrama.id, episodeId: currentDrama.episodes[episodeIndex].id });
    if (res.code === 200) {
      currentDrama.episodes[episodeIndex].unlocked = true;
      selectEp(episodeIndex);
      showToast(`✅ 解鎖成功！`);
      updateCoinDisplay();
    } else {
      showToast(`❌ ${res.message}`);
    }
  };

  modal.querySelector('#btn-unlock-ad').onclick = async () => {
    modal.remove();
    showToast('📺 加載廣告中...');
    // TODO: 接入廣告 SDK
    setTimeout(() => {
      currentDrama.episodes[episodeIndex].unlocked = true;
      selectEp(episodeIndex);
      showToast('✅ 廣告觀看完畢，已解鎖');
    }, 3000);
  };

  modal.querySelector('#btn-unlock-cancel').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

// v7.1: 更新硬幣顯示
function updateCoinDisplay() {
  const el = document.getElementById('coin-amount');
  if (el && api.isLoggedIn()) {
    api.get('/coins/balance').then(res => {
      if (res.code === 200) el.textContent = res.data.coins;
    });
  }
}

function closePlayer() {
  document.getElementById('player-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
  if (artPlayer) {
    artPlayer.destroy();
    artPlayer = null;
  }
}

function togglePlay() {
  if (!artPlayer) return;
  artPlayer.toggle();
}

function toggleMute() {
  if (!artPlayer) return;
  artPlayer.muted = !artPlayer.muted;
}

function toggleFullscreen() {
  if (!artPlayer) return;
  artPlayer.fullscreen = !artPlayer.fullscreen;
}

function togglePip() {
  if (!artPlayer) return;
  artPlayer.pip = !artPlayer.pip;
}

function seekForward() {
  if (!artPlayer) return;
  artPlayer.currentTime += 10;
}

function seekBackward() {
  if (!artPlayer) return;
  artPlayer.currentTime -= 10;
}

function changeSpeed() {
  if (!artPlayer) return;
  const rates = [0.75, 1, 1.25, 1.5, 2];
  const next = rates[(rates.indexOf(artPlayer.playbackRate) + 1) % rates.length];
  artPlayer.playbackRate = next;
  showToast('倍速：' + next + 'x');
}

function openPlayer(drama) {
  currentDrama = drama;
  currentEpIndex = 0;
  document.getElementById('player-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  initArtPlayer(drama.episodes[0]?.videoUrl, drama.cover);
  renderEpisodeList();
}

function renderEpisodeList() {
  const list = document.getElementById('episode-list');
  if (!list) return;
  const eps = currentDrama?.episodes || [];
  list.innerHTML = eps
    .map(
      (ep, i) =>
        `<button onclick="selectEp(${i})" class="flex-shrink-0 w-14 h-14 rounded-xl ${i === 0 ? 'bg-rose-500 text-white' : 'bg-white/10 text-white/70'} flex items-center justify-center text-sm font-medium hover:bg-white/20 transition">${ep.episodeNumber}</button>`,
    )
    .join('');
}

window.initArtPlayer = initArtPlayer;
window.selectEp = selectEp;
window.prevEp = prevEp;
window.nextEp = nextEp;
window.closePlayer = closePlayer;
window.togglePlay = togglePlay;
window.toggleMute = toggleMute;
window.toggleFullscreen = toggleFullscreen;
window.togglePip = togglePip;
window.seekForward = seekForward;
window.seekBackward = seekBackward;
window.changeSpeed = changeSpeed;
window.openPlayer = openPlayer;
