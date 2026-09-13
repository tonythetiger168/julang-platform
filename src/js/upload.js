// ===== v6.1 文件上傳與解析（劇本文件 → 劇本結構）=====
// @ts-check
// 支持 .txt / .md 直接讀取；.docx 經 mammoth.js；.pdf 經 pdf.js（CDN 動態加載）

// ---------- 動態加載 CDN 庫 ----------
const jlLibCache = {};
function jlLoadScript(url, globalName) {
  if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
  if (jlLibCache[url]) return jlLibCache[url];
  jlLibCache[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve(globalName ? window[globalName] : true);
    s.onerror = () => { delete jlLibCache[url]; reject(new Error('LIB_LOAD_FAIL')); };
    document.head.appendChild(s);
  });
  return jlLibCache[url];
}

// ---------- 文本規一化：轉成劇本格式 ----------
function jlNormalizeScript(raw) {
  return raw
    .replace(/\r\n?/g, '\n')
    // 半形冒號的中文對白 → 全形
    .replace(/^([ \t]*[一-龥A-Za-z·]{2,8}):/gm, '$1：')
    // 「第3場」「場3」統一為【場景】前綴
    .replace(/^[ \t]*(第[0-9一二三四五六七八九十百]+場[^\n]*)$/gm, '【場景】$1')
    // Markdown 標題當場景
    .replace(/^[ \t]*#{1,3}[ \t]+([^\n#]+)$/gm, '【場景】$1')
    // 去掉 Markdown 強調標記
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- 文件解析主入口 ----------
async function jlParseScriptFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let text = '';
  if (ext === 'txt' || ext === 'md') {
    text = await file.text();
  } else if (ext === 'docx') {
    await jlLoadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js', 'mammoth');
    const buf = await file.arrayBuffer();
    const res = await window.mammoth.extractRawText({ arrayBuffer: buf });
    text = res.value || '';
  } else if (ext === 'pdf') {
    await jlLoadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'pdfjsLib');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      pages.push(tc.items.map(it => it.str).join(''));
    }
    text = pages.join('\n\n');
  } else {
    throw new Error('UNSUPPORTED');
  }
  text = jlNormalizeScript(text);
  if (text.length < 10) throw new Error('EMPTY');
  return text;
}

// ---------- 上傳入口：解析後送入編劇工作台 ----------
async function jlUploadScriptFile(input, target) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const toast = (typeof swToast === 'function') ? swToast : (m) => alert(m);
  toast('📂 解析文件中...');
  try {
    const text = await jlParseScriptFile(file);
    if (target === 'agent') {
      // 直接填入 Agent 工作流第 1 步
      document.getElementById('ag-script').value = text;
      if (typeof showAgentStudio === 'function' && document.getElementById('agent-modal').classList.contains('hidden')) {
        showAgentStudio();
      }
      toast('✅ 文件已解析並填入 Agent 劇本');
    } else {
      // 新建劇本進編劇工作台
      const title = file.name.replace(/\.(txt|md|docx|pdf)$/i, '');
      if (typeof swCreateScript === 'function') {
        swCreateScript(title, text, '都市');
        showScriptwriter();
        swToast(`✅ 《${title}》已解析（${text.length} 字），可在編劇台繼續修改`);
      }
    }
  } catch (e) {
    const msg = e.message === 'UNSUPPORTED' ? '僅支持 .txt / .md / .docx / .pdf'
      : e.message === 'EMPTY' ? '文件內容為空或無法提取文字'
      : e.message === 'LIB_LOAD_FAIL' ? '解析引擎加載失敗（docx/pdf 需聯網加載解析庫）'
      : '文件解析失敗';
    alert('❌ ' + msg);
  }
}

function jlPickScriptFile(target) {
  const inp = document.getElementById('jl-script-file-input');
  inp.onchange = () => jlUploadScriptFile(inp, target);
  inp.click();
}

window.jlPickScriptFile = jlPickScriptFile;
window.jlParseScriptFile = jlParseScriptFile;
window.jlNormalizeScript = jlNormalizeScript;
window.jlLoadScript = jlLoadScript;
