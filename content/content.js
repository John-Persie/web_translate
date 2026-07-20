(function () {
  'use strict';

  const EXCLUDED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CODE', 'PRE',
    'TEXTAREA', 'INPUT', 'CANVAS', 'VIDEO', 'AUDIO', 'OBJECT', 'EMBED'
  ]);
  const MAX_BATCH_CHARS = 3000;
  const ROOT_ID = 'tr-ext-root';

  const originalTexts = new Map();
  const translatedNodes = new WeakSet();
  let isTranslating = false;
  let currentAbort = null;

  const LANG_MAP = {
    'auto': '自动检测', 'zh-CN': '简体中文', 'zh-TW': '繁体中文',
    'en': 'English', 'ja': '日本語', 'ko': '한국어',
    'fr': 'Français', 'de': 'Deutsch', 'es': 'Español',
    'pt': 'Português', 'ru': 'Русский', 'ar': 'العربية',
    'th': 'ไทย', 'vi': 'Tiếng Việt', 'it': 'Italiano',
    'nl': 'Nederlands', 'pl': 'Polski', 'tr': 'Türkçe',
    'id': 'Bahasa Indonesia', 'hi': 'हिन्दी'
  };

  function createElement(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') el.className = v;
        else if (k === 'innerHTML') el.innerHTML = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      }
    }
    if (children) {
      for (const child of children) {
        el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      }
    }
    return el;
  }

  function buildUI() {
    if (document.getElementById(ROOT_ID)) return;
    const root = createElement('div', { id: ROOT_ID });

    // FAB
    const fab = createElement('button', {
      id: 'tr-ext-fab',
      title: '网页翻译',
      onclick: () => toolbar.classList.add('visible')
    }, [
      createElement('span', { innerHTML: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2v20M7 4.5a15 15 0 000 15M17 4.5a15 15 0 010 15"/></svg>' })
    ]);

    // Toolbar
    const toolbar = createElement('div', { id: 'tr-ext-toolbar' });
    const sourceOpts = Object.entries(LANG_MAP).map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
    const targetOpts = sourceOpts;

    toolbar.innerHTML = `
      <div class="tr-inner">
        <span class="tr-logo">
          <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="#4285f4"/><ellipse cx="12" cy="12" rx="4" ry="10" fill="none" stroke="#fff" stroke-width="1"/><line x1="3" y1="12" x2="21" y2="12" stroke="#fff" stroke-width="1"/></svg>
          网页翻译
        </span>
        <span class="tr-lang-group">
          <select id="tr-ext-source">${sourceOpts}</select>
          <span class="tr-arrow">→</span>
          <select id="tr-ext-target">${targetOpts}</select>
        </span>
        <button class="tr-btn tr-btn-translate" id="tr-ext-translate-btn">翻译页面</button>
        <button class="tr-btn tr-btn-restore" id="tr-ext-restore-btn">恢复原文</button>
        <span class="tr-progress-wrap">
          <div class="tr-progress-bar"><div class="tr-progress-fill" id="tr-ext-progress-fill"></div></div>
          <div class="tr-progress-text" id="tr-ext-progress-text"></div>
        </span>
        <span class="tr-status" id="tr-ext-status"></span>
        <button class="tr-btn tr-btn-close" id="tr-ext-close-btn" title="收起">✕</button>
      </div>
    `;

    root.appendChild(fab);
    root.appendChild(toolbar);
    document.body.appendChild(root);

    loadSettings().then(() => {
      document.getElementById('tr-ext-translate-btn').addEventListener('click', startTranslation);
      document.getElementById('tr-ext-restore-btn').addEventListener('click', restoreOriginal);
      document.getElementById('tr-ext-close-btn').addEventListener('click', () => toolbar.classList.remove('visible'));
    });
  }

  async function loadSettings() {
    const settings = await chrome.runtime.sendMessage({ type: 'getSettings' });
    if (settings.sourceLang) document.getElementById('tr-ext-source').value = settings.sourceLang;
    if (settings.targetLang) document.getElementById('tr-ext-target').value = settings.targetLang;
  }

  function setStatus(msg, cls) {
    const el = document.getElementById('tr-ext-status');
    if (el) { el.textContent = msg; el.className = 'tr-status ' + (cls || ''); }
  }

  function setProgress(current, total) {
    const fill = document.getElementById('tr-ext-progress-fill');
    const text = document.getElementById('tr-ext-progress-text');
    if (fill) fill.style.width = total ? Math.round((current / total) * 100) + '%' : '0%';
    if (text) text.textContent = total ? `${current}/${total}` : '';
  }

  function shouldSkip(el) {
    if (!el || !el.parentNode) return true;
    if (EXCLUDED_TAGS.has(el.tagName)) return true;
    if (el.closest('#' + ROOT_ID)) return true;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    if (parseFloat(style.opacity) === 0) return true;
    if (el.tagName === 'OPTION' || el.tagName === 'TITLE' || el.tagName === 'META') return true;
    return false;
  }

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
        const text = node.textContent.trim();
        if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    return nodes;
  }

  function buildBatches(nodes) {
    const batches = [];
    let currentBatch = [];
    let currentChars = 0;

    for (const node of nodes) {
      const text = node.textContent.trim();
      if (!text) continue;
      if (currentChars + text.length > MAX_BATCH_CHARS && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentChars = 0;
      }
      currentBatch.push(node);
      currentChars += text.length;
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    return batches;
  }

  async function translateBatch(nodes, sourceLang, targetLang) {
    const texts = nodes.map(n => n.textContent.trim());
    const response = await chrome.runtime.sendMessage({
      type: 'translate',
      texts,
      sourceLang,
      targetLang
    });
    if (response.error) throw new Error(response.error);
    return response.translations;
  }

  async function startTranslation() {
    if (isTranslating) return;
    isTranslating = true;

    const sourceLang = document.getElementById('tr-ext-source').value;
    const targetLang = document.getElementById('tr-ext-target').value;
    const translateBtn = document.getElementById('tr-ext-translate-btn');
    const restoreBtn = document.getElementById('tr-ext-restore-btn');

    translateBtn.disabled = true;
    restoreBtn.disabled = true;
    setStatus('正在收集文本...');
    setProgress(0, 1);

    try {
      const nodes = collectTextNodes(document.body);
      const untranslated = nodes.filter(n => !translatedNodes.has(n));

      if (untranslated.length === 0) {
        setStatus('没有需要翻译的文本', 'success');
        return;
      }

      const batches = buildBatches(untranslated);
      let completed = 0;

      for (let i = 0; i < batches.length; i++) {
        setStatus('正在翻译...');
        setProgress(completed, batches.length);

        const batchNodes = batches[i];
        const translations = await translateBatch(batchNodes, sourceLang, targetLang);

        for (let j = 0; j < batchNodes.length; j++) {
          const node = batchNodes[j];
          if (!originalTexts.has(node)) {
            originalTexts.set(node, node.textContent);
          }
          node.textContent = translations[j];
          translatedNodes.add(node);
        }

        completed++;
      }

      setProgress(completed, batches.length);
      setStatus('翻译完成', 'success');
    } catch (err) {
      setStatus('翻译失败: ' + err.message, 'error');
      console.error('[网页翻译] 翻译失败:', err);
    } finally {
      isTranslating = false;
      translateBtn.disabled = false;
      restoreBtn.disabled = false;
    }
  }

  function restoreOriginal() {
    const restoreBtn = document.getElementById('tr-ext-restore-btn');
    restoreBtn.disabled = true;
    setStatus('正在恢复原文...');

    let count = 0;
    for (const [node, original] of originalTexts) {
      if (node.parentNode && translatedNodes.has(node)) {
        node.textContent = original;
        count++;
      }
      translatedNodes.delete(node);
    }

    setStatus(`已恢复 ${count} 处文本`, 'success');
    setProgress(0, 0);
    restoreBtn.disabled = false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
