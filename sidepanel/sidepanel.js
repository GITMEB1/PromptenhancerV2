const state = {
  latest: null,
  activeVariant: 'default'
};

const els = {
  statusBadge: document.getElementById('statusBadge'),
  providerPill: document.getElementById('providerPill'),
  statusText: document.getElementById('statusText'),
  resultSection: document.getElementById('resultSection'),
  resultText: document.getElementById('resultText'),
  assumptionsList: document.getElementById('assumptionsList'),
  constraintsList: document.getElementById('constraintsList'),
  questionsList: document.getElementById('questionsList'),
  taskTypeValue: document.getElementById('taskTypeValue'),
  engineUsedValue: document.getElementById('engineUsedValue'),
  confidenceValue: document.getElementById('confidenceValue'),
  replaceBtn: document.getElementById('replaceBtn'),
  copyBtn: document.getElementById('copyBtn'),
  openOptions: document.getElementById('openOptions'),
  tabs: Array.from(document.querySelectorAll('.tab'))
};

init();

async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_LATEST_RESULT' });
  if (response?.ok) {
    state.latest = response.payload;
    render();
  }

  chrome.storage.session.onChanged?.addListener(() => {});
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'session' || !changes.latestUpgrade) return;
    state.latest = changes.latestUpgrade.newValue;
    render();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      els.tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeVariant = tab.dataset.variant;
      renderText();
    });
  });

  els.copyBtn.addEventListener('click', async () => {
    const text = getActiveText();
    await navigator.clipboard.writeText(text);
    els.statusText.textContent = 'Copied upgraded prompt to clipboard.';
  });

  els.replaceBtn.addEventListener('click', async () => {
    const text = getActiveText();
    const response = await chrome.runtime.sendMessage({ type: 'APPLY_VARIANT', text });
    if (response?.ok) {
      els.statusText.textContent = 'Replaced prompt in the page.';
    } else {
      els.statusText.textContent = response?.error || 'Could not replace directly. The prompt may still be on your clipboard.';
    }
  });

  els.openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function render() {
  if (!state.latest) {
    setStatus('Idle', 'No page', 'Trigger an upgrade from ChatGPT or Gemini to populate this panel.');
    els.resultSection.classList.add('hidden');
    return;
  }

  if (state.latest.status === 'error') {
    setStatus('Error', state.latest.provider || 'Unknown', state.latest.error || 'Unknown error');
    els.resultSection.classList.add('hidden');
    return;
  }

  setStatus('Ready', state.latest.provider || 'Unknown', state.latest.route?.reason || 'Upgrade ready.');
  els.resultSection.classList.remove('hidden');
  els.taskTypeValue.textContent = state.latest.result.task_type;
  els.engineUsedValue.textContent = state.latest.engineUsed;
  els.confidenceValue.textContent = `${Math.round((state.latest.result.confidence || 0) * 100)}%`;
  renderText();
  renderList(els.assumptionsList, state.latest.result.assumptions);
  renderList(els.constraintsList, state.latest.result.missing_constraints);
  renderList(els.questionsList, state.latest.result.clarifying_questions);
}

function renderText() {
  if (!state.latest?.result) return;
  els.resultText.value = getActiveText();
}

function getActiveText() {
  const result = state.latest.result;
  switch (state.activeVariant) {
    case 'concise': return result.variants.concise;
    case 'rigorous': return result.variants.rigorous;
    case 'agent_spec': return result.variants.agent_spec;
    default: return result.improved_prompt;
  }
}

function renderList(el, items) {
  el.innerHTML = '';
  if (!items?.length) {
    const li = document.createElement('li');
    li.textContent = 'None highlighted.';
    el.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    el.appendChild(li);
  }
}

function setStatus(badge, provider, text) {
  els.statusBadge.textContent = badge;
  els.providerPill.textContent = provider;
  els.statusText.textContent = text;
}
