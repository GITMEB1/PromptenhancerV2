const state = {
  latest: null,
  activeVariant: 'default',
  diagnosticsEnabled: false
};

const els = {
  statusBadge: document.getElementById('statusBadge'),
  providerPill: document.getElementById('providerPill'),
  statusText: document.getElementById('statusText'),
  processingSection: document.getElementById('processingSection'),
  processingDraftText: document.getElementById('processingDraftText'),
  resultSection: document.getElementById('resultSection'),
  resultText: document.getElementById('resultText'),
  originalDraftText: document.getElementById('originalDraftText'),
  assumptionsList: document.getElementById('assumptionsList'),
  constraintsList: document.getElementById('constraintsList'),
  questionsList: document.getElementById('questionsList'),
  taskTypeValue: document.getElementById('taskTypeValue'),
  engineUsedValue: document.getElementById('engineUsedValue'),
  routeDecisionRow: document.getElementById('routeDecisionRow'),
  routeDecisionValue: document.getElementById('routeDecisionValue'),
  modelLabelRow: document.getElementById('modelLabelRow'),
  modelLabelValue: document.getElementById('modelLabelValue'),
  confidenceValue: document.getElementById('confidenceValue'),
  engineBlock: document.getElementById('engineBlock'),
  replaceBtn: document.getElementById('replaceBtn'),
  copyBtn: document.getElementById('copyBtn'),
  openOptions: document.getElementById('openOptions'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  fallbackNotice: document.getElementById('fallbackNotice'),
  fallbackReasonText: document.getElementById('fallbackReasonText'),
  schemaErrorsList: document.getElementById('schemaErrorsList')
};

init();

async function init() {
  // Load diagnostics setting
  const settings = await chrome.storage.sync.get(['diagnosticsEnabled']);
  state.diagnosticsEnabled = Boolean(settings.diagnosticsEnabled);

  const response = await chrome.runtime.sendMessage({ type: 'GET_LATEST_RESULT' });
  if (response?.ok) {
    state.latest = response.payload;
    render();
  }

  // Listen for session storage changes (upgrade lifecycle state transitions)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.latestUpgrade) {
      state.latest = changes.latestUpgrade.newValue;
      render();
    }
    if (area === 'sync' && changes.diagnosticsEnabled) {
      state.diagnosticsEnabled = Boolean(changes.diagnosticsEnabled.newValue);
      render();
    }
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
    try {
      await navigator.clipboard.writeText(text);
      showCopyFeedback();
    } catch {
      els.statusText.textContent = 'Copy failed. Try selecting the text manually.';
    }
  });

  els.replaceBtn.addEventListener('click', async () => {
    const text = getActiveText();
    els.replaceBtn.disabled = true;
    const response = await chrome.runtime.sendMessage({ type: 'APPLY_VARIANT', text });
    els.replaceBtn.disabled = false;
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
    setBadgeState('idle');
    setStatus('Idle', 'No page', 'Trigger an upgrade from ChatGPT or Gemini to populate this panel.');
    els.processingSection.classList.add('hidden');
    els.resultSection.classList.add('hidden');
    setActionButtons(false);
    return;
  }

  if (state.latest.status === 'processing') {
    setBadgeState('processing');
    setStatus('Processing', state.latest.provider || 'Unknown', 'Upgrading your prompt…');
    els.processingSection.classList.remove('hidden');
    els.processingDraftText.textContent = state.latest.sourceDraft || '';
    els.resultSection.classList.add('hidden');
    setActionButtons(false);
    return;
  }

  if (state.latest.status === 'error') {
    setBadgeState('error');
    setStatus('Error', state.latest.provider || 'Unknown', state.latest.error || 'Unknown error');
    els.processingSection.classList.add('hidden');
    els.resultSection.classList.add('hidden');
    setActionButtons(false);
    return;
  }

  // status === 'ready'
  setBadgeState('ready');
  setStatus('Ready', state.latest.provider || 'Unknown', state.latest.route?.reason || 'Upgrade ready.');
  els.processingSection.classList.add('hidden');
  els.resultSection.classList.remove('hidden');
  setActionButtons(true);

  els.taskTypeValue.textContent = state.latest.result.task_type;
  els.engineUsedValue.textContent = state.latest.engineUsed;
  els.confidenceValue.textContent = `${Math.round((state.latest.result.confidence || 0) * 100)}%`;

  // Original draft
  els.originalDraftText.textContent = state.latest.sourceDraft || '';

  // Route decision — show when diagnostics enabled
  if (state.diagnosticsEnabled && state.latest.route?.decision) {
    els.routeDecisionRow.classList.remove('hidden');
    els.routeDecisionValue.textContent = state.latest.route.decision;
  } else {
    els.routeDecisionRow.classList.add('hidden');
  }

  // Model label — show when remote was used and label exists
  const isRemoteEngine = (state.latest.engineUsed || '').includes('remote') ||
    state.latest.route?.engine === 'remote';
  if (isRemoteEngine && state.latest.remoteModelLabel) {
    els.modelLabelRow.classList.remove('hidden');
    els.modelLabelValue.textContent = state.latest.remoteModelLabel;
  } else {
    els.modelLabelRow.classList.add('hidden');
  }

  renderText();
  renderList(els.assumptionsList, state.latest.result.assumptions);
  renderList(els.constraintsList, state.latest.result.missing_constraints);
  renderList(els.questionsList, state.latest.result.clarifying_questions);
  renderFallbackNotice();
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

function renderFallbackNotice() {
  const fallbackReason = state.latest?.fallbackReason;
  const schemaErrors = state.latest?.schemaErrors;

  if (!fallbackReason && !schemaErrors?.length) {
    els.fallbackNotice.classList.add('hidden');
    return;
  }

  els.fallbackNotice.classList.remove('hidden');
  els.fallbackReasonText.textContent = fallbackReason || '';

  els.schemaErrorsList.innerHTML = '';
  if (schemaErrors?.length) {
    els.schemaErrorsList.classList.remove('hidden');
    for (const err of schemaErrors) {
      const li = document.createElement('li');
      li.textContent = err;
      els.schemaErrorsList.appendChild(li);
    }
  } else {
    els.schemaErrorsList.classList.add('hidden');
  }
}

function setBadgeState(badgeState) {
  els.statusBadge.className = `badge badge-${badgeState}`;
}

function setStatus(badge, provider, text) {
  els.statusBadge.textContent = badge;
  els.providerPill.textContent = provider;
  els.statusText.textContent = text;
}

function setActionButtons(enabled) {
  els.replaceBtn.disabled = !enabled;
  els.copyBtn.disabled = !enabled;
}

function showCopyFeedback() {
  const original = els.copyBtn.textContent;
  els.copyBtn.textContent = 'Copied ✓';
  els.copyBtn.classList.add('btn-success');
  setTimeout(() => {
    els.copyBtn.textContent = original;
    els.copyBtn.classList.remove('btn-success');
  }, 1800);
}
