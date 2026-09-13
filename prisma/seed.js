const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // ========== 初始化分類 ==========
  const categories = [
    { name: "都市", icon: "🏙️", sortOrder: 1 },
    { name: "甜寵", icon: "💕", sortOrder: 2 },
    { name: "重生", icon: "🔄", sortOrder: 3 },
    { name: "玄幻", icon: "⚡", sortOrder: 4 },
    { name: "穿越", icon: "🌀", sortOrder: 5 },
    { name: "逆襲", icon: "👑", sortOrder: 6 },
    { name: "職場", icon: "💼", sortOrder: 7 },
    { name: "懸疑", icon: "🔍", sortOrder: 8 },
    { name: "古裝", icon: "🏮", sortOrder: 9 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }

  const cats = await prisma.category.findMany();
  const catMap = Object.fromEntries(cats.map(c => [c.name, c.id]));

  // ========== 初始化創作者用戶 ==========
  const creatorUsers = [
    { phone: '13800138001', nickname: '星辰劇場', password: 'creator123' },
    { phone: '13800138002', nickname: '夢幻影業', password: 'creator123' },
    { phone: '13800138003', nickname: '極光短劇', password: 'creator123' },
  ];

  const createdCreators = [];
  for (const cu of creatorUsers) {
    const passwordHash = await bcrypt.hash(cu.password, 10);
    const user = await prisma.user.upsert({
      where: { phone: cu.phone },
      update: {},
      create: {
        phone: cu.phone,
        passwordHash,
        nickname: cu.nickname,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cu.nickname}`,
        isCreator: true,
        coins: 10000,
      },
    });

    const creator = await prisma.creator.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        realName: cu.nickname,
        bio: `專業${cu.nickname}，致力於打造優質短劇內容`,
        avatar: user.avatar,
        verified: true,
        status: 1,
      },
    });

    await prisma.creatorStats.upsert({
      where: { creatorId: creator.id },
      update: {},
      create: {
        creatorId: creator.id,
        totalDramas: 2,
        totalViews: 500000000n,
        totalFollowers: 125000,
        totalEarnings: 850000,
        monthViews: 80000000n,
        monthEarnings: 120000,
      },
    });

    createdCreators.push({ ...creator, user });
  }

  // ========== 初始化短劇（帶創作者關聯）==========
  const dramas = [
    {
      title: "霸道總裁愛上我",
      desc: "平凡女孩意外闖入總裁生活，展開一段甜寵愛情故事",
      cover: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=400&h=600&fit=crop",
      categoryId: catMap["甜寵"],
      creatorIndex: 0,
      totalEpisodes: 3,
      views: 230000000,
      rating: 9.2,
      isFree: true,
      auditStatus: "approved",
      episodes: [
        { episodeNumber: 1, title: "初遇總裁", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 330 },
        { episodeNumber: 2, title: "誤會重重", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 325 },
        { episodeNumber: 3, title: "真心告白", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 340 },
      ]
    },
    {
      title: "重生之復仇女王",
      desc: "前世被陷害致死，重生歸來誓要讓所有人付出代價",
      cover: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop",
      categoryId: catMap["重生"],
      creatorIndex: 1,
      totalEpisodes: 3,
      views: 180000000,
      rating: 9.0,
      isFree: true,
      auditStatus: "approved",
      episodes: [
        { episodeNumber: 1, title: "含恨而終", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 310 },
        { episodeNumber: 2, title: "重回十八歲", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 315 },
        { episodeNumber: 3, title: "第一個目標", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 320 },
      ]
    },
    {
      title: "都市神醫",
      desc: "隱世神醫下山歷練，憑藉絕世醫術縱橫都市",
      cover: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop",
      categoryId: catMap["都市"],
      creatorIndex: 0,
      totalEpisodes: 3,
      views: 310000000,
      rating: 8.8,
      isFree: true,
      auditStatus: "approved",
      episodes: [
        { episodeNumber: 1, title: "神醫下山", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 300 },
        { episodeNumber: 2, title: "救治病患", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 305 },
        { episodeNumber: 3, title: "名揚天下", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 310 },
      ]
    },
    {
      title: "穿越之嫡女歸來",
      desc: "現代女醫生穿越古代，成為相府嫡女，開啟逆襲人生",
      cover: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&h=600&fit=crop",
      categoryId: catMap["穿越"],
      creatorIndex: 2,
      totalEpisodes: 3,
      views: 150000000,
      rating: 9.1,
      isFree: true,
      auditStatus: "approved",
      episodes: [
        { episodeNumber: 1, title: "穿越醒來", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 295 },
        { episodeNumber: 2, title: "嫡女身份", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 300 },
        { episodeNumber: 3, title: "初露鋒芒", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 305 },
      ]
    },
    {
      title: "龍王贅婿",
      desc: "隱藏身份的龍王入贅豪門，被看不起的他終於展露真實實力",
      cover: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=600&fit=crop",
      categoryId: catMap["逆襲"],
      creatorIndex: 1,
      totalEpisodes: 3,
      views: 420000000,
      rating: 8.5,
      isFree: false,
      pricePerEp: 10,
      auditStatus: "approved",
      episodes: [
        { episodeNumber: 1, title: "入贅豪門", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 315 },
        { episodeNumber: 2, title: "身份曝光", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 320 },
        { episodeNumber: 3, title: "龍王歸來", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 325 },
      ]
    },
    {
      title: "仙尊歸來",
      desc: "修仙萬年歸來，發現地球已過百年，曾經的愛人已白髮蒼蒼",
      cover: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=600&fit=crop",
      categoryId: catMap["玄幻"],
      creatorIndex: 2,
      totalEpisodes: 3,
      views: 280000000,
      rating: 9.3,
      isFree: true,
      auditStatus: "approved",
      episodes: [
        { episodeNumber: 1, title: "仙尊降臨", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 330 },
        { episodeNumber: 2, title: "物是人非", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 335 },
        { episodeNumber: 3, title: "逆天改命", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 340 },
      ]
    },
    {
      title: "待審核新劇：職場風雲",
      desc: "職場新人一路逆襲成為行業頂尖",
      cover: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=600&fit=crop",
      categoryId: catMap["職場"],
      creatorIndex: 0,
      totalEpisodes: 2,
      views: 0,
      rating: 0.0,
      isFree: true,
      auditStatus: "pending",
      episodes: [
        { episodeNumber: 1, title: "入職第一天", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 300 },
        { episodeNumber: 2, title: "危機來臨", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 305 },
      ]
    },
    {
      title: "被駁回的劇：古裝奇緣",
      desc: "古裝愛情故事",
      cover: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=600&fit=crop",
      categoryId: catMap["古裝"],
      creatorIndex: 1,
      totalEpisodes: 1,
      views: 0,
      rating: 0.0,
      isFree: true,
      auditStatus: "rejected",
      rejectReason: "內容涉及版權爭議，請修改後重新提交",
      episodes: [
        { episodeNumber: 1, title: "初見", videoUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", duration: 290 },
      ]
    },
  ];

  for (const d of dramas) {
    const { episodes, creatorIndex, ...dramaData } = d;
    const creatorId = createdCreators[creatorIndex]?.id;
    const drama = await prisma.drama.upsert({
      where: { title: dramaData.title },
      update: {},
      create: {
        ...dramaData,
        creatorId,
        status: 1,
        publishedAt: dramaData.auditStatus === 'approved' ? new Date() : null,
      },
    });
    for (const ep of episodes) {
      await prisma.episode.upsert({
        where: { dramaId_episodeNumber: { dramaId: drama.id, episodeNumber: ep.episodeNumber } },
        update: {},
        create: { ...ep, dramaId: drama.id },
      });
    }

    // 為已審核通過的劇添加審核日誌
    if (dramaData.auditStatus === 'approved') {
      await prisma.auditLog.create({
        data: {
          dramaId: drama.id,
          creatorId,
          action: 'approve',
          reason: '內容審核通過',
        },
      });
    } else if (dramaData.auditStatus === 'rejected') {
      await prisma.auditLog.create({
        data: {
          dramaId: drama.id,
          creatorId,
          action: 'reject',
          reason: dramaData.rejectReason,
        },
      });
    }
  }

  // ========== 創作者收益記錄 ==========
  for (const creator of createdCreators) {
    const earnings = [
      { type: 'play', amount: 50000, description: '播放量收益' },
      { type: 'vip_share', amount: 30000, description: 'VIP分成' },
      { type: 'gift', amount: 15000, description: '打賞收益' },
    ];
    for (const e of earnings) {
      await prisma.creatorEarning.create({
        data: {
          creatorId: creator.id,
          type: e.type,
          amount: e.amount,
          description: e.description,
        },
      });
    }
  }

  // ========== v5.0 演示 AI 漫劇 ==========
  const demoPanels = [
    [
      { shot: 'wide', scene: 'bustling city street at dusk, neon lights, cinematic anime style', line: '三年前，我被趕出家門，身無分文。', speaker: '' },
      { shot: 'close', scene: 'close-up of determined young woman eyes, tears glistening, anime style', line: '我發誓，總有一天要讓他們後悔！', speaker: '林晚' },
      { shot: 'medium', scene: 'handsome man in black suit stepping out of luxury car, anime style', line: '這位小姐，我們又見面了。', speaker: '顧沉' },
      { shot: 'medium', scene: 'woman shocked expression, rain falling, dramatic lighting, anime style', line: '是你？當年那個救我的人……', speaker: '林晚' },
      { shot: 'close', scene: 'man smirking mysteriously, city lights bokeh background, anime style', line: '從今天起，我來護你周全。', speaker: '顧沉' },
      { shot: 'full', scene: 'two figures under umbrella, city night, romantic anime style', line: '這一次，命運由我自己改寫。', speaker: '' },
    ],
    [
      { shot: 'wide', scene: 'grand banquet hall, crystal chandelier, anime style', line: '豪門宴會上，所有人的目光都帶著嘲諷。', speaker: '' },
      { shot: 'medium', scene: 'elegant woman in red dress walking confidently, anime style', line: '三年了，我林晚，回來了。', speaker: '林晚' },
      { shot: 'close', scene: 'villain woman shocked face, wine glass trembling, anime style', line: '你……你怎麼敢出現在這裡！', speaker: '林雪' },
      { shot: 'medium', scene: 'woman holding up documents, crowd gasping, anime style', line: '這份證據，足以讓你身敗名裂。', speaker: '林晚' },
      { shot: 'close', scene: 'man watching from afar with approving smile, anime style', line: '不愧是我看中的女人。', speaker: '顧沉' },
      { shot: 'full', scene: 'spotlight on woman, dramatic reveal moment, anime style', line: '好戲，才剛剛開始。', speaker: '' },
    ],
  ];

  const existingComic = await prisma.comicDrama.findFirst({ where: { title: '逆襲：命運重啟' } });
  if (!existingComic) {
    const comic = await prisma.comicDrama.create({
      data: {
        title: '逆襲：命運重啟',
        desc: 'AI 生成演示漫劇：被逐出家門的少女三年後華麗歸來，在豪門宴會上展開復仇。',
        cover: 'https://picsum.photos/seed/jlcover-demo/720/1280',
        categoryId: catMap['逆襲'],
        creatorId: createdCreators[0]?.id,
        artStyle: 'anime',
        theme: '豪門逆襲復仇',
        prompt: '被趕出家門的少女逆襲歸來復仇',
        totalEpisodes: demoPanels.length,
        auditStatus: 'approved',
        publishedAt: new Date(),
        views: 1250000,
        rating: 9.4,
      },
    });

    for (let e = 0; e < demoPanels.length; e++) {
      const panels = demoPanels[e];
      const episode = await prisma.comicEpisode.create({
        data: {
          comicId: comic.id,
          episodeNumber: e + 1,
          title: e === 0 ? '第1集 命運轉折' : '第2集 華麗歸來',
          status: 'published',
          duration: panels.reduce((s, p) => s + Math.max(2, Math.ceil(p.line.length / 5)), 0),
        },
      });
      for (let p = 0; p < panels.length; p++) {
        const panel = panels[p];
        await prisma.comicPanel.create({
          data: {
            episodeId: episode.id,
            panelNumber: p + 1,
            imageUrl: `https://picsum.photos/seed/jldemo-e${e + 1}p${p + 1}/720/1280`,
            imagePrompt: panel.scene,
            shotType: panel.shot,
            transition: ['fade', 'slide', 'zoom'][p % 3],
            dialogue: panel.line,
            speaker: panel.speaker,
            voiceUrl: null, // 前端自動降級 Web Speech 朗讀
            duration: Math.max(2, Math.ceil(panel.line.length / 5)),
          },
        });
      }
    }
    console.log(`   ComicDramas: 1 (演示 AI 漫劇)`);
  }

  console.log("✅ Seed completed!");
  console.log(`   Categories: ${cats.length}`);
  console.log(`   Dramas: ${dramas.length}`);
  console.log(`   Creators: ${createdCreators.length}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
