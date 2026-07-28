import { heuristicUpgrade, scoreComplexity } from './heuristic-engine.js';
import { validateUpgradeResult, collectSchemaErrors } from './schema.js';
import { runCloudClarity } from './clarity-provider.js';

export async function runUpgrade({ draft, settings, context }) {
  const complexityScore = scoreComplexity(draft);
  const route = chooseRoute({
    privacyMode: settings.privacyMode,
    cloudProvider: settings.cloudProvider,
    hasOpenAIKey: Boolean(settings.openaiApiKey),
    hasOpenRouterKey: Boolean(settings.openrouterApiKey),
    remoteEndpoint: settings.remoteEndpoint,
    complexityScore
  });

  let result;
  let engineUsed = route.engine;
  let fallbackReason = null;
  let schemaErrors = null;

  try {
    if (route.engine === 'cloud') {
      result = await runCloudClarity({ draft, settings, context });
      result = normalizeCloudResult(result);
    } else {
      result = heuristicUpgrade(draft, settings);
      engineUsed = 'deterministic-clarity';
    }
  } catch (error) {
    result = heuristicUpgrade(draft, settings);
    fallbackReason = error?.message || 'Clarity provider failed.';
    engineUsed = 'deterministic-clarity-fallback';
  }

  const validation = validateUpgradeResult(result);
  if (!validation.ok) {
    schemaErrors = collectSchemaErrors(result);
    fallbackReason = fallbackReason || `Schema validation failed: ${validation.error}`;
    result = heuristicUpgrade(draft, settings);
    engineUsed = 'deterministic-schema-repair';
  }

  return { route, engineUsed, complexityScore, fallbackReason, schemaErrors, result };
}

export function chooseRoute({ privacyMode, cloudProvider = 'openai', hasOpenAIKey, hasOpenRouterKey, remoteEndpoint }) {
  if (privacyMode === 'local-only') {
    return { engine: 'deterministic', decision: 'policy-local-only', reason: 'Local-only policy blocks API providers.' };
  }

  const available = cloudProvider === 'openrouter'
    ? hasOpenRouterKey
    : cloudProvider === 'managed'
      ? Boolean(remoteEndpoint)
      : hasOpenAIKey;

  if (available) {
    return { engine: 'cloud', provider: cloudProvider, decision: `cloud-${cloudProvider}`, reason: `Using the configured ${cloudProvider} clarity provider.` };
  }

  if (hasOpenAIKey) return { engine: 'cloud', provider: 'openai', decision: 'cloud-openai-fallback', reason: 'Selected provider was unavailable; using configured OpenAI access.' };
  if (hasOpenRouterKey) return { engine: 'cloud', provider: 'openrouter', decision: 'cloud-openrouter-fallback', reason: 'Selected provider was unavailable; using configured OpenRouter access.' };
  if (remoteEndpoint) return { engine: 'cloud', provider: 'managed', decision: 'cloud-managed-fallback', reason: 'Using configured managed endpoint.' };

  return { engine: 'deterministic', decision: 'deterministic-only', reason: 'No API provider is configured; using the honest deterministic clarity engine.' };
}

export function isValidRemoteUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return true;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeCloudResult(result) {
  const compiled = result.compiled_prompt || result.improved_prompt || '';
  const assumptions = Array.isArray(result.assumptions) ? result.assumptions : [];
  const ambiguities = Array.isArray(result.ambiguities) ? result.ambiguities : [];
  const variants = result.variants || {};
  const confidenceLevel = result.confidence?.level || 'medium';

  return {
    ...result,
    version: result.version || 'clarity_contract_v1',
    improved_prompt: compiled,
    missing_constraints: ambiguities.map(item => item.topic).filter(Boolean),
    clarifying_questions: ambiguities.filter(item => item.resolution === 'ask').map(item => item.question).filter(Boolean),
    assumptions: assumptions,
    variants: {
      ...variants,
      concise: variants.concise || compiled,
      rigorous: variants.deep || variants.rigorous || compiled,
      agent_spec: variants.implementation_spec || variants.agent_spec || compiled,
      deep: variants.deep || variants.rigorous || compiled,
      implementation_spec: variants.implementation_spec || variants.agent_spec || compiled
    },
    safety_notes: Array.isArray(result.safety_notes) ? result.safety_notes : [],
    confidence: confidenceLevel === 'high' ? 0.85 : confidenceLevel === 'low' ? 0.4 : 0.65,
    clarity_confidence: result.confidence
  };
}
