const DEFAULT_SETTINGS = {
  apiUrl: '',
  apiKey: '',
  modelName: '',
  sourceLang: 'auto',
  targetLang: 'zh-CN'
};

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    document.getElementById('apiUrl').value = settings.apiUrl || '';
    document.getElementById('apiKey').value = settings.apiKey || '';
    document.getElementById('modelName').value = settings.modelName || '';
    document.getElementById('sourceLang').value = settings.sourceLang || 'auto';
    document.getElementById('targetLang').value = settings.targetLang || 'zh-CN';
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const apiUrl = document.getElementById('apiUrl').value.trim();
    if (!apiUrl) {
      showStatus('请输入 API 地址', 'error');
      return;
    }

    const settings = {
      apiUrl,
      apiKey: document.getElementById('apiKey').value.trim(),
      modelName: document.getElementById('modelName').value.trim(),
      sourceLang: document.getElementById('sourceLang').value,
      targetLang: document.getElementById('targetLang').value
    };

    chrome.storage.local.set(settings, () => {
      if (chrome.runtime.lastError) {
        showStatus('保存失败: ' + chrome.runtime.lastError.message, 'error');
      } else {
        showStatus('设置已保存', 'success');
      }
    });
  });
});

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + type;
  setTimeout(() => { el.className = 'status'; }, 3000);
}
