// ===== v6.0 ffmpeg 視頻合成 Worker（真出片） =====
// 進程內任務隊列：compose 請求入隊 → 後台逐任務執行
// 流程：下載片段 → 逐段裁剪+變速標準化 → concat 合併 →（可選）混 BGM → 輸出 mp4
// ffmpeg 不可用或片段下載失敗時降級：任務標記 done，outputUrl 回退首片段地址

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');


const prisma = require('../utils/prisma');
const OUT_DIR = process.env.COMPOSE_OUT_DIR || path.join(__dirname, '..', '..', 'uploads', 'compose');
const TMP_DIR = path.join(OUT_DIR, 'tmp');
const MAX_TOTAL_SECONDS = parseInt(process.env.COMPOSE_MAX_SECONDS || '120', 10);

const queue = [];
let running = false;

function enqueue(taskId) {
  queue.push(taskId);
  setImmediate(drain);
}

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const id = queue.shift();
    try { await processTask(id); }
    catch (e) {
      console.error('[compose] 任務失敗', id, e.message);
      await prisma.composeTask.update({ where: { id }, data: { status: 'failed', error: e.message.slice(0, 300) } }).catch(() => {});
    }
  }
  running = false;
}

function run(cmd, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg 超時')); }, timeoutMs);
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-300)}`));
    });
    p.on('error', reject);
  });
}

function ffmpegAvailable() {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-version']);
    p.on('close', (c) => resolve(c === 0));
    p.on('error', () => resolve(false));
  });
}

function download(url, dest, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (!/^https?:\/\//i.test(url)) return reject(new Error('僅支持 http(s) 片段地址'));
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlink(dest, () => {});
        return download(new URL(res.headers.location, url).toString(), dest, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) { file.close(); fs.unlink(dest, () => {}); return reject(new Error(`下載失敗 ${res.statusCode}`)); }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('下載超時')));
    req.on('error', (e) => { file.close(); fs.unlink(dest, () => {}); reject(e); });
  });
}

async function processTask(id) {
  const task = await prisma.composeTask.update({ where: { id }, data: { status: 'processing' } });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const clips = (task.clips || []).slice(0, 50);
  // 總時長上限保護
  let total = 0;
  for (const c of clips) {
    const dur = c.duration != null ? c.duration / (c.speed || 1) : ((c.end ?? 5) - (c.start || 0)) / (c.speed || 1);
    total += dur;
    if (total > MAX_TOTAL_SECONDS) throw new Error(`總時長超過 ${MAX_TOTAL_SECONDS}s 上限`);
  }

  if (!(await ffmpegAvailable())) {
    // 降級：無 ffmpeg 環境
    return prisma.composeTask.update({
      where: { id },
      data: { status: 'done', outputUrl: clips[0]?.url || '', error: '環境無 ffmpeg，已降級返回首片段' },
    });
  }

  const workDir = path.join(TMP_DIR, id);
  fs.mkdirSync(workDir, { recursive: true });
  const segs = [];
  try {
    // 1) 下載 + 標準化（裁剪 / 變速 / 補靜音音軌 / 統一編碼）
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const raw = path.join(workDir, `raw_${i}.mp4`);
      const seg = path.join(workDir, `seg_${i}.mp4`);
      await download(c.url, raw);
      const speed = c.speed || 1;
      const start = c.start || 0;
      const endArgs = c.end != null ? ['-to', String(c.end)] : (c.duration != null ? ['-t', String(c.duration)] : []);
      await run('ffmpeg', [
        '-y', '-ss', String(start), ...endArgs, '-i', raw,
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-filter_complex',
        `[0:v]setpts=PTS/${speed},scale=720:-2,fps=24[v];[0:a]atempo=${Math.min(2, Math.max(0.5, speed))}[a]`,
        '-map', '[v]', '-map', '[a]',
        '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart', seg,
      ]);
      segs.push(seg);
    }
    // 2) concat 合併
    const listFile = path.join(workDir, 'list.txt');
    fs.writeFileSync(listFile, segs.map((s) => `file '${s}'`).join('\n'));
    const merged = path.join(workDir, 'merged.mp4');
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', merged]);
    // 3) 可選混 BGM
    let finalFile = merged;
    if (task.bgm) {
      const bgm = path.join(workDir, 'bgm');
      await download(task.bgm, bgm);
      finalFile = path.join(workDir, 'final.mp4');
      await run('ffmpeg', [
        '-y', '-i', merged, '-i', bgm,
        '-filter_complex', '[1:a]volume=0.25,aloop=loop=-1:size=2e+09[b];[0:a][b]amix=inputs=2:duration=first[aout]',
        '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', finalFile,
      ]);
    }
    // 4) 出庫
    const outName = `${id}.mp4`;
    fs.copyFileSync(finalFile, path.join(OUT_DIR, outName));
    await prisma.composeTask.update({
      where: { id },
      data: { status: 'done', outputUrl: `/uploads/compose/${outName}` },
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { enqueue };
