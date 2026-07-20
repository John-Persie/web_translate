const DEFAULT_SETTINGS = {
  apiUrl: '',
  apiKey: '',
  modelName: '',
  sourceLang: 'auto',
  targetLang: 'zh-CN'
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'translate') {
    handleTranslate(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'getSettings') {
    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => sendResponse(settings));
    return true;
  }
});

async function handleTranslate({ texts, sourceLang, targetLang }) {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);

  if (!settings.apiUrl) {
    throw new Error('请先在插件设置中配置 API 地址');
  }

  const systemPrompt = sourceLang === 'auto'
    ? `You are a professional translator. Translate each text in the JSON array to ${getLangName(targetLang)}. Return ONLY a JSON array of the same length with translated texts. Do not include any explanations, markdown formatting, or code blocks.`
    : `You are a professional translator. Translate each text in the JSON array from ${getLangName(sourceLang)} to ${getLangName(targetLang)}. Return ONLY a JSON array of the same length with translated texts. Do not include any explanations, markdown formatting, or code blocks.`;

  const headers = { 'Content-Type': 'application/json' };
  if (settings.apiKey) {
    headers['Authorization'] = `Bearer ${settings.apiKey}`;
  }

  const body = JSON.stringify({
    model: settings.modelName || undefined,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(texts) }
    ],
    temperature: 0.2
  });

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(settings.apiUrl, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const content = extractContent(data);
      const translations = parseTranslations(content, texts.length);

      if (translations) {
        return { translations };
      }
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  throw lastError || new Error('翻译失败');
}

function extractContent(data) {
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  if (data.content) return data.content;
  if (data.response) return data.response;
  if (typeof data === 'string') return data;
  return JSON.stringify(data);
}

function parseTranslations(content, expectedLen) {
  let cleaned = content.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```$/i, '');

  try {
    const arr = JSON.parse(cleaned);
    if (Array.isArray(arr) && arr.length === expectedLen) {
      return arr.map(String);
    }
  } catch (e) {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr) && arr.length === expectedLen) {
          return arr.map(String);
        }
      } catch (e2) { /* fall through */ }
    }
  }
  return null;
}

function getLangName(code) {
  const map = {
    'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese',
    'en': 'English', 'ja': 'Japanese', 'ko': 'Korean',
    'fr': 'French', 'de': 'German', 'es': 'Spanish',
    'pt': 'Portuguese', 'ru': 'Russian', 'ar': 'Arabic',
    'th': 'Thai', 'vi': 'Vietnamese', 'it': 'Italian',
    'nl': 'Dutch', 'pl': 'Polish', 'tr': 'Turkish',
    'id': 'Indonesian', 'ms': 'Malay', 'hi': 'Hindi'
  };
  return map[code] || code;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
