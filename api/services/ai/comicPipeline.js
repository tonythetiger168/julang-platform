// ===== v5.0 AI 漫劇生成流水線 =====
// 編排：劇本生成 → 分鏡圖生成 → 配音合成 → 入庫發布
// 全流程任務化，通過 AiTask 表上報進度供前端輪詢


const prisma = require('../../utils/prisma');
const llmService = require('./llmService');
const imageService = require('./imageService');
const ttsService = require('./ttsService');

async function updateTask(taskId, patch) {
  try {
    await prisma.aiTask.update({ where: { id: taskId }, data: patch });
  } catch (e) {
    console.error('[AI] 任務狀態更新失敗:', e.message);
  }
}

// 進度分配：劇本 0-20%，分鏡圖 20-70%，配音 70-90%，入庫 90-100%
async function runPipeline(taskId) {
  const task = await prisma.aiTask.findUnique({ where: { id: taskId } });
  if (!task) return;
  const input = task.input;
  const {
    theme,
    style = 'anime',
    genre = '都市',
    episodeCount = 1,
    panelsPerEpisode = 6,
    voiceId = '',
    withVoice = true,
    withImages = true,
    categoryId = null,
  } = input;

  try {
    await updateTask(taskId, { status: 'processing', progress: 2, stage: '初始化生成任務' });

    // ---------- 階段一：AI 劇本生成 ----------
    await updateTask(taskId, { progress: 5, stage: 'AI 正在創作劇本...' });
    const script = await llmService.generateScript({ theme, style, genre, episodeCount, panelsPerEpisode });
    await updateTask(taskId, { progress: 20, stage: `劇本完成：《${script.title}》` });

    // ---------- 創建漫劇主記錄 ----------
    const comic = await prisma.comicDrama.create({
      data: {
        title: script.title,
        desc: script.desc,
        theme,
        prompt: theme,
        artStyle: style,
        voiceId: voiceId || null,
        categoryId,
        totalEpisodes: script.episodes.length,
        auditStatus: 'approved',
        publishedAt: new Date(),
        isPublic,
        remixOfId,
      },
    });
    await updateTask(taskId, { comicId: comic.id, progress: 25, stage: '漫劇檔案已建立' });

    // v6.0：Agent 模式保存角色卡；復刻來源計數 +1
    if (characterCards?.length) {
      try {
        await require('./agentService').saveCharacters(comic.id, characterCards);
      } catch (e) { console.warn('[AI] 角色卡保存失敗:', e.message); }
    }
    if (remixOfId) {
      prisma.comicDrama.update({ where: { id: remixOfId }, data: { remixCount: { increment: 1 } } }).catch(() => {});
    }

    // ---------- 階段二：逐集生成分鏡 ----------
    const totalPanels = script.episodes.reduce((s, e) => s + e.panels.length, 0);
    let donePanels = 0;
    const characters = script.characters || [];

    for (const ep of script.episodes) {
      const episode = await prisma.comicEpisode.create({
        data: {
          comicId: comic.id,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          script: ep,
          status: 'generated',
          duration: ep.panels.length * 3,
        },
      });

      for (const p of ep.panels) {
        // 分鏡圖
        let image = { imageUrl: null, imagePrompt: p.scene, mock: true };
        if (withImages) {
          await updateTask(taskId, {
            progress: 25 + Math.round((donePanels / totalPanels) * 45),
            stage: `繪製分鏡 ${donePanels + 1}/${totalPanels}...`,
          });
          image = await imageService.generatePanelImage({
            scene: p.scene,
            artStyle: style,
            characters,
            seedText: `${comic.id}-${ep.episodeNumber}-${p.panelNumber}`,
          });
        }

        // 配音
        let voice = { voiceUrl: null, mock: true };
        if (withVoice && p.dialogue) {
          await updateTask(taskId, {
            progress: 70 + Math.round((donePanels / totalPanels) * 18),
            stage: `合成配音 ${donePanels + 1}/${totalPanels}...`,
          });
          voice = await ttsService.synthesize({
            text: p.dialogue,
            speaker: p.speaker,
            voiceId: voiceId || ttsService.pickVoice(p.speaker),
            comicId: comic.id,
            panelRef: `${ep.episodeNumber}-${p.panelNumber}`,
          });
        }

        await prisma.comicPanel.create({
          data: {
            episodeId: episode.id,
            panelNumber: p.panelNumber,
            imageUrl: image.imageUrl,
            imagePrompt: image.imagePrompt,
            shotType: p.shotType || 'medium',
            transition: ['fade', 'slide', 'zoom', 'none'][p.panelNumber % 4] || 'fade',
            dialogue: p.dialogue || '',
            speaker: p.speaker || '',
            voiceUrl: voice.voiceUrl,
            duration: p.dialogue ? Math.max(2, Math.ceil(p.dialogue.length / 5)) : 3,
          },
        });
        donePanels++;
      }

      await prisma.comicEpisode.update({
        where: { id: episode.id },
        data: { status: 'published', duration: ep.panels.reduce((s, x) => s + Math.max(2, Math.ceil((x.dialogue || '').length / 5)), 0) },
      });
    }

    // ---------- 階段三：封面 ----------
    await updateTask(taskId, { progress: 90, stage: '生成封面與收尾...' });
    const cover = await imageService.generateCover({ title: script.title, theme, artStyle: style });
    await prisma.comicDrama.update({
      where: { id: comic.id },
      data: { cover: cover.imageUrl },
    });

    // ---------- 完成 ----------
    await updateTask(taskId, {
      status: 'success',
      progress: 100,
      stage: '生成完成',
      finishedAt: new Date(),
      output: {
        comicId: comic.id,
        title: script.title,
        episodes: script.episodes.length,
        panels: totalPanels,
        usedMock: {
          script: !!script._mock,
        },
      },
    });
  } catch (e) {
    console.error('[AI] 流水線失敗:', e);
    await updateTask(taskId, {
      status: 'failed',
      stage: '生成失敗',
      errorMsg: e.message,
      finishedAt: new Date(),
    });
  }
}

// 創建任務並異步啟動流水線
async function createComicTask(userId, input) {
  const task = await prisma.aiTask.create({
    data: {
      userId,
      type: 'full',
      status: 'pending',
      input,
    },
  });
  // 異步執行，不阻塞響應
  setImmediate(() => runPipeline(task.id));
  return task;
}

// 查詢任務
async function getTask(taskId, userId = null) {
  const task = await prisma.aiTask.findUnique({ where: { id: taskId } });
  if (!task) return null;
  if (userId && task.userId !== userId) return null;
  return task;
}

// 用戶任務列表
async function getUserTasks(userId, limit = 10) {
  return prisma.aiTask.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, type: true, status: true, progress: true, stage: true,
      comicId: true, errorMsg: true, createdAt: true, finishedAt: true,
      input: true, output: true,
    },
  });
}

module.exports = { createComicTask, getTask, getUserTasks, runPipeline };
