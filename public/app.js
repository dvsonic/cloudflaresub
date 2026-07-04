const form = document.getElementById('generator-form');
const submitBtn = document.getElementById('submitBtn');
const fillDemoBtn = document.getElementById('fillDemoBtn');
const resultSection = document.getElementById('resultSection');
const warningBox = document.getElementById('warningBox');
const previewBody = document.getElementById('previewBody');

const autoUrl = document.getElementById('autoUrl');
const rawUrl = document.getElementById('rawUrl');
const clashUrl = document.getElementById('clashUrl');
const surgeUrl = document.getElementById('surgeUrl');
const singboxUrl = document.getElementById('singboxUrl');
const emptyState = document.getElementById('emptyState');
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const qrModal = document.getElementById('qrModal');
const qrCanvas = document.getElementById('qrCanvas');
const qrText = document.getElementById('qrText');
const closeQrModal = document.getElementById('closeQrModal');

const demoVmess = [
  'vmess://ewogICJ2IjogIjIiLAogICJwcyI6ICJkZW1vLXdzLXRscyIsCiAgImFkZCI6ICJlZGdlLmV4YW1wbGUuY29tIiwKICAicG9ydCI6ICI0NDMiLAogICJpZCI6ICIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLAogICJzY3kiOiAiYXV0byIsCiAgIm5ldCI6ICJ3cyIsCiAgInRscyI6ICJ0bHMiLAogICJwYXRoIjogIi93cyIsCiAgImhvc3QiOiAiZWRnZS5leGFtcGxlLmNvbSIsCiAgInNuaSI6ICJlZGdlLmV4YW1wbGUuY29tIiwKICAiZnAiOiAiY2hyb21lIiwKICAiYWxwbiI6ICJoMixodHRwLzEuMSIKfQ=='
].join('\n');

const demoIps = [
  '104.16.1.2#HK-01',
  '104.17.2.3#HK-02',
  '104.18.3.4:2053#US-Edge'
].join('\n');

fillDemoBtn.addEventListener('click', () => {
  document.getElementById('nodeLinks').value = demoVmess;
  document.getElementById('preferredIps').value = demoIps;
  document.getElementById('namePrefix').value = 'CF';
  document.getElementById('keepOriginalHost').checked = true;
});

loadHistory();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  warningBox.classList.add('hidden');
  previewBody.innerHTML = '';

  const payload = {
    nodeLinks: document.getElementById('nodeLinks').value,
    preferredIps: document.getElementById('preferredIps').value,
    namePrefix: document.getElementById('namePrefix').value,
    keepOriginalHost: document.getElementById('keepOriginalHost').checked,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = '生成中...';

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await parseApiResponse(response, '生成失败');

    autoUrl.value = data.urls.auto;
    rawUrl.value = data.urls.raw;
    document.getElementById('rocketUrl').value = data.urls.raw;
    clashUrl.value = data.urls.clash;
    surgeUrl.value = data.urls.surge;
    singboxUrl.value = data.urls.singbox;

    emptyState.classList.add('hidden');

    document.getElementById('statInputNodes').textContent = data.counts.inputNodes;
    document.getElementById('statEndpoints').textContent = data.counts.preferredEndpoints;
    document.getElementById('statOutputNodes').textContent = data.counts.outputNodes;

    previewBody.innerHTML = data.preview
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.type)}</td>
            <td>${escapeHtml(item.server)}</td>
            <td>${escapeHtml(String(item.port))}</td>
            <td>${escapeHtml(item.host || '-')}</td>
            <td>${escapeHtml(item.sni || '-')}</td>
          </tr>`,
      )
      .join('');

    if (Array.isArray(data.warnings) && data.warnings.length) {
      warningBox.textContent = data.warnings.join('\n');
      warningBox.classList.remove('hidden');
    }

    renderHistory(data.history || []);

    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    warningBox.textContent = error.message || '请求失败';
    warningBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '生成订阅';
  }
});

document.addEventListener('click', async (event) => {
  const copyButton = event.target.closest('[data-copy-target]');
  if (copyButton) {
    const input = document.getElementById(copyButton.dataset.copyTarget);
    if (!input?.value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(input.value);
      const originalText = copyButton.textContent;
      copyButton.textContent = '已复制';
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 1200);
    } catch {
      input.select();
      document.execCommand('copy');
    }
    return;
  }

  const qrButton = event.target.closest('[data-qrcode-target]');
  if (qrButton) {
    warningBox.classList.add('hidden');

    const input = document.getElementById(qrButton.dataset.qrcodeTarget);
    if (!input?.value) {
      warningBox.textContent = '请先生成订阅链接，再显示二维码。';
      warningBox.classList.remove('hidden');
      return;
    }

    if (!window.QRCode) {
      warningBox.textContent = '二维码组件加载失败，请刷新页面后重试。';
      warningBox.classList.remove('hidden');
      return;
    }

    const qrValue = formatQrValue(input.value, qrButton.dataset.qrcodeClient);

    qrCanvas.innerHTML = '';
    qrText.textContent = qrValue;
    qrModal.classList.remove('hidden');
    qrModal.setAttribute('aria-hidden', 'false');

    new window.QRCode(qrCanvas, {
      text: qrValue,
      width: 220,
      height: 220,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    return;
  }

  if (event.target.closest('[data-close-modal="true"]')) {
    closeQrDialog();
  }
});

closeQrModal.addEventListener('click', closeQrDialog);

clearHistoryBtn.addEventListener('click', clearHistory);

function closeQrDialog() {
  qrModal.classList.add('hidden');
  qrModal.setAttribute('aria-hidden', 'true');
  qrCanvas.innerHTML = '';
}

async function loadHistory() {
  try {
    const response = await fetch('/api/history');
    const data = await parseApiResponse(response, '历史记录加载失败');
    renderHistory(data.history || []);
  } catch {
    renderHistory([]);
  }
}

async function clearHistory() {
  clearHistoryBtn.disabled = true;
  try {
    const response = await fetch('/api/history', { method: 'DELETE' });
    await parseApiResponse(response, '历史记录清空失败');
    renderHistory([]);
  } catch (error) {
    warningBox.textContent = error.message || '历史记录清空失败';
    warningBox.classList.remove('hidden');
    clearHistoryBtn.disabled = false;
  }
}

async function parseApiResponse(response, fallbackMessage) {
  const bodyText = await response.text();
  let data;

  try {
    data = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    const isHtml = bodyText.trim().startsWith('<');
    if (isHtml) {
      throw new Error(`${fallbackMessage}：接口返回了 HTML。请确认 Cloudflare 已重新部署 Worker，且 /api/* 路由进入 Worker。`);
    }
    throw new Error(`${fallbackMessage}：接口返回不是合法 JSON。`);
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || fallbackMessage);
  }
  return data;
}

function renderHistory(history = []) {
  historyEmpty.classList.toggle('hidden', history.length > 0);
  clearHistoryBtn.disabled = history.length === 0;

  historyList.innerHTML = history
    .map((item, index) => {
      const urls = item.urls || {};
      return `
        <article class="history-card">
          <div class="history-head">
            <div>
              <strong>${escapeHtml(item.shortId || '历史订阅')}</strong>
              <p>${escapeHtml(formatDate(item.createdAt))}</p>
            </div>
            <span>${escapeHtml(String(item.counts?.outputNodes ?? 0))} 个节点</span>
          </div>
          ${renderHistoryUrl(index, 'raw', '原始订阅', urls.raw)}
          ${renderHistoryUrl(index, 'clash', 'Clash', urls.clash)}
          ${renderHistoryUrl(index, 'singbox', 'Sing-box', urls.singbox)}
          ${renderHistoryUrl(index, 'surge', 'Surge', urls.surge)}
        </article>`;
    })
    .join('');
}

function renderHistoryUrl(index, key, label, value) {
  if (!value) {
    return '';
  }
  const inputId = `history-${index}-${key}`;
  const qrClient = key === 'singbox' ? ' data-qrcode-client="singbox"' : '';
  return `
    <div class="history-url">
      <label for="${inputId}">${escapeHtml(label)}</label>
      <input id="${inputId}" value="${escapeHtml(value)}" readonly />
      <button data-copy-target="${inputId}" type="button" class="secondary small">复制</button>
      <button data-qrcode-target="${inputId}"${qrClient} type="button" class="secondary small">二维码</button>
    </div>`;
}

function formatQrValue(value, client) {
  if (client === 'singbox') {
    return `sing-box://import-remote-profile?url=${encodeURIComponent(value)}#${encodeURIComponent('CloudflareSub')}`;
  }
  return value;
}

function formatDate(value) {
  if (!value) {
    return '未知时间';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
