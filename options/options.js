import { DEFAULT_SETTINGS } from '../src/defaults.js';
import { isValidRemoteUrl } from '../src/engines.js';

const fields = {
  privacyMode: document.getElementById('privacyMode'),
  remoteEndpoint: document.getElementById('remoteEndpoint'),
  remoteApiKey: document.getElementById('remoteApiKey'),
  remoteModelLabel: document.getElementById('remoteModelLabel'),
  remoteTimeoutMs: document.getElementById('remoteTimeoutMs'),
  diagnosticsEnabled: document.getElementById('diagnosticsEnabled'),
  saveLocalHistory: document.getElementById('saveLocalHistory'),
  inlineButtonEnabled: document.getElementById('inlineButtonEnabled')
};

const statusEl = document.getElementById('status');
const endpointErrorEl = document.getElementById('endpointError');

document.getElementById('saveBtn').addEventListener('click', saveSettings);
document.getElementById('resetBtn').addEventListener('click', resetSettings);

void loadSettings();

async function loadSettings() {
  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.sync.get(null)) };
  for (const [key, el] of Object.entries(fields)) {
    if (el.type === 'checkbox') el.checked = Boolean(settings[key]);
    else if (el.type === 'number') el.value = settings[key] ?? '';
    else el.value = settings[key] || '';
  }
  clearEndpointError();
}

async function saveSettings() {
  const endpointValue = fields.remoteEndpoint.value.trim();
  if (!isValidRemoteUrl(endpointValue)) {
    showEndpointError();
    return;
  }
  clearEndpointError();

  const next = {};
  for (const [key, el] of Object.entries(fields)) {
    if (el.type === 'checkbox') {
      next[key] = el.checked;
    } else if (el.type === 'number') {
      const num = Number(el.value);
      next[key] = num > 0 ? Math.max(1000, Math.min(60000, num)) : DEFAULT_SETTINGS[key];
    } else {
      next[key] = el.value.trim();
    }
  }
  await chrome.storage.sync.set(next);
  setStatus('Settings saved.');
}

async function resetSettings() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  await loadSettings();
  setStatus('Defaults restored.');
}

function setStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => {
    if (statusEl.textContent === text) statusEl.textContent = '';
  }, 2500);
}

function showEndpointError() {
  endpointErrorEl.classList.add('visible');
}

function clearEndpointError() {
  endpointErrorEl.classList.remove('visible');
}
