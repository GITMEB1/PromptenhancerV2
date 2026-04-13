(function initProviderCore(globalScope) {
  const PROVIDER_NAMES = {
    CHATGPT: 'chatgpt',
    GEMINI: 'gemini',
    GENERIC: 'generic'
  };

  const PROVIDER_SELECTOR_PLAN = {
    [PROVIDER_NAMES.CHATGPT]: [
      'form textarea',
      '#prompt-textarea[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      'form [contenteditable="true"]'
    ],
    [PROVIDER_NAMES.GEMINI]: [
      'rich-textarea [contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      'textarea'
    ],
    [PROVIDER_NAMES.GENERIC]: [
      'textarea',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]'
    ]
  };

  function inferProviderFromHostname(hostname) {
    const normalized = String(hostname || '').toLowerCase();
    if (/chatgpt\.com|chat\.openai\.com/.test(normalized)) return PROVIDER_NAMES.CHATGPT;
    if (/gemini\.google\.com/.test(normalized)) return PROVIDER_NAMES.GEMINI;
    return PROVIDER_NAMES.GENERIC;
  }

  function getProviderSelectorPlan(provider) {
    return PROVIDER_SELECTOR_PLAN[provider] || PROVIDER_SELECTOR_PLAN[PROVIDER_NAMES.GENERIC];
  }

  function normalizeComparableText(value) {
    return String(value || '')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
  }

  function verifyWritebackText(actual, expected) {
    return normalizeComparableText(actual) === normalizeComparableText(expected);
  }

  function rankEditableCandidate(candidate) {
    if (!candidate || !candidate.isEditable || !candidate.isVisible) return Number.NEGATIVE_INFINITY;

    let score = 0;
    if (candidate.isActive) score += 50;
    if (candidate.withinForm) score += 10;
    if (candidate.hasPromptHints) score += 25;

    if (candidate.kind === 'textarea') score += 18;
    if (candidate.kind === 'contenteditable') score += 16;
    if (candidate.kind === 'input') score -= 30;

    const area = Number(candidate.area || 0);
    if (area > 20000) score += 12;
    else if (area > 4000) score += 6;

    if (candidate.providerAffinity) score += 30;

    return score;
  }

  function chooseBestCandidate(candidates) {
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates || []) {
      const score = rankEditableCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  const api = {
    PROVIDER_NAMES,
    inferProviderFromHostname,
    getProviderSelectorPlan,
    normalizeComparableText,
    verifyWritebackText,
    rankEditableCandidate,
    chooseBestCandidate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  globalScope.PromptEnhancerProviderCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
