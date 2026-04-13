import { heuristicUpgrade, scoreComplexity } from './heuristic-engine.js';
import { validateUpgradeResult, collectSchemaErrors } from './schema.js';

const BUILTIN_AI_CACHE_TTL_MS = 30_000;
const DEFAULT_REMOTE_TIMEOUT_MS = 8_000;

let builtInAiAvailabilityCache = null;

export async function runUpgrade({ draft, settings, context }) {
  const complexityScore = scoreComplexity(draft);
  const taskTypeHint = inferTaskTypeHint(draft);
  const builtInAvailability = await getBuiltInAiAvailability();

  const route = chooseRoute({
    privacyMode: settings.privacyMode,
    localAvailable: builtInAvailability.available,
    remoteEndpoint: settings.remoteEndpoint,
    complexityScore,
    taskTypeHint
  });

  let result;
  let engineUsed = route.engine;
  let fallbackReason = null;
  let schemaErrors = null;

  try {
    if (route.engine === 'local-ai') {
      result = await runBuiltInAiUpgrade(draft, builtInAvailability);
    } else if (route.engine === 'remote' && settings.remoteEndpoint) {
      result = await runRemoteUpgrade(draft, settings, context);
    } else {
      result = heuristicUpgrade(draft);
      engineUsed = 'heuristic';
    }
  } catch (error) {
    result = heuristicUpgrade(draft);
    fallbackReason = error?.message || 'Engine threw an error.';
    engineUsed = route.engine === 'remote' ? 'heuristic-fallback-remote' : 'heuristic-fallback';
  }

  const validation = validateUpgradeResult(result);
  if (!validation.ok) {
    schemaErrors = collectSchemaErrors(result);
    fallbackReason = fallbackReason || `Schema validation failed: ${validation.error}`;
    result = heuristicUpgrade(draft);
    engineUsed = 'heuristic-repair';
  }

  return {
    route,
    engineUsed,
    complexityScore,
    fallbackReason,
    schemaErrors,
    result
  };
}

export function chooseRoute({ privacyMode, localAvailable, complexityScore, taskTypeHint, remoteEndpoint }) {
  const remoteConfigured = isRemoteEndpointConfigured(remoteEndpoint);

  if (privacyMode === 'local-only') {
    return localAvailable
      ? { engine: 'local-ai', decision: 'policy-local-only', reason: 'Local-only policy and built-in AI available.' }
      : { engine: 'heuristic', decision: 'policy-local-only-fallback', reason: 'Local-only policy without built-in AI; heuristic fallback.' };
  }

  if (privacyMode === 'cloud-preferred' && remoteConfigured) {
    return { engine: 'remote', decision: 'policy-cloud-preferred', reason: 'Cloud-preferred policy with remote endpoint configured.' };
  }

  if ((taskTypeHint === 'research' || taskTypeHint === 'build') && complexityScore >= 2 && remoteConfigured) {
    return { engine: 'remote', decision: 'complex-task-remote', reason: 'Complex build/research task routed to remote endpoint.' };
  }

  if (localAvailable) {
    return { engine: 'local-ai', decision: 'local-fast-path', reason: 'Built-in AI available for local upgrade.' };
  }

  if (remoteConfigured) {
    return { engine: 'remote', decision: 'remote-availability-fallback', reason: 'No built-in AI available; using remote endpoint.' };
  }

  return { engine: 'heuristic', decision: 'heuristic-only', reason: 'No built-in or remote route available; heuristic fallback.' };
}

export function isRemoteEndpointConfigured(remoteEndpoint) {
  return typeof remoteEndpoint === 'string' && remoteEndpoint.trim().length > 0;
}

export function isValidRemoteUrl(url) {
  if (typeof url !== 'string' || url.trim().length === 0) return true; // empty is valid (means unconfigured)
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function hasBuiltInAi() {
  const availability = await getBuiltInAiAvailability();
  return availability.available;
}

export async function getBuiltInAiAvailability({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && builtInAiAvailabilityCache && now - builtInAiAvailabilityCache.checkedAt < BUILTIN_AI_CACHE_TTL_MS) {
    return builtInAiAvailabilityCache;
  }

  const rewriter = await probeBuiltInApi('Rewriter');
  const languageModel = await probeBuiltInApi('LanguageModel', {
    expectedInputs: [{ type: 'text', languages: ['en'] }]
  });

  const availability = {
    available: rewriter.available || languageModel.available,
    checkedAt: now,
    rewriter,
    languageModel
  };

  builtInAiAvailabilityCache = availability;
  return availability;
}

export function clearBuiltInAiAvailabilityCache() {
  builtInAiAvailabilityCache = null;
}

async function probeBuiltInApi(apiName, availabilityArgs) {
  const scope = typeof self === 'undefined' ? undefined : self;
  const api = scope?.[apiName];
  if (!api) return { supported: false, available: false, reason: `${apiName} missing` };

  if (typeof api.availability !== 'function' || typeof api.create !== 'function') {
    return { supported: false, available: false, reason: `${apiName} missing required methods` };
  }

  try {
    const status = await api.availability(availabilityArgs);
    if (status === 'unavailable') {
      return { supported: true, available: false, status, reason: `${apiName} unavailable` };
    }

    return { supported: true, available: true, status, reason: `${apiName} ready` };
  } catch (error) {
    return { supported: true, available: false, reason: `${apiName} availability probe failed`, error: String(error?.message || error) };
  }
}

function inferTaskTypeHint(draft) {
  if (/\b(research|latest|sources|citations)\b/i.test(draft)) return 'research';
  if (/\b(build|app|extension|implement|architecture|repo|code)\b/i.test(draft)) return 'build';
  if (/\b(plan|roadmap|outline|strategy)\b/i.test(draft)) return 'plan';
  if (/\b(edit|rewrite|improve)\b/i.test(draft)) return 'edit';
  return 'write';
}

async function runBuiltInAiUpgrade(draft, builtInAvailability) {
  if (builtInAvailability?.rewriter?.available && 'Rewriter' in self) {
    const rewriter = await self.Rewriter.create({ tone: 'more-formal', length: 'medium' });
    const rewritten = await rewriter.rewrite(draft);
    return heuristicUpgrade(rewritten);
  }

  if (builtInAvailability?.languageModel?.available && 'LanguageModel' in self) {
    const expectedInputs = [{ type: 'text', languages: ['en'] }];
    const session = await self.LanguageModel.create({ expectedInputs });
    const prompt = [
      'Rewrite the following rough prompt into a clearer, stronger version while preserving intent.',
      '',
      draft
    ].join('\n');
    const rewritten = await session.prompt(prompt);
    return heuristicUpgrade(rewritten);
  }

  throw new Error('No built-in AI API available');
}

class RemoteTransportError extends Error {
  constructor(message, { code, status, cause } = {}) {
    super(message);
    this.name = 'RemoteTransportError';
    this.code = code || 'remote_transport_error';
    this.status = status;
    this.cause = cause;
  }
}

export async function runRemoteUpgrade(draft, settings, context) {
  const controller = new AbortController();
  const timeoutMs = Number(settings.remoteTimeoutMs) > 0 ? Number(settings.remoteTimeoutMs) : DEFAULT_REMOTE_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(settings.remoteEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.remoteApiKey ? { 'Authorization': `Bearer ${settings.remoteApiKey}` } : {})
      },
      body: JSON.stringify({
        draft,
        context,
        response_schema: 'prompt_upgrader_v1'
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new RemoteTransportError(`Remote request timed out after ${timeoutMs}ms`, { code: 'timeout', cause: error });
    }

    throw new RemoteTransportError('Remote request failed to reach endpoint', { code: 'network', cause: error });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new RemoteTransportError(`Remote endpoint returned HTTP ${response.status}`, {
      code: 'http_status',
      status: response.status
    });
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new RemoteTransportError('Remote endpoint returned non-JSON content type', {
      code: 'invalid_content_type'
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new RemoteTransportError('Remote endpoint returned invalid JSON body', {
      code: 'invalid_json',
      cause: error
    });
  }

  if (!payload || typeof payload !== 'object') {
    throw new RemoteTransportError('Remote endpoint returned empty or non-object JSON', {
      code: 'invalid_payload'
    });
  }

  return payload;
}
