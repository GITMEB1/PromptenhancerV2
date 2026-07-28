const SYSTEM_INSTRUCTIONS = `You are a clarity and goal-extraction engine. Your job is not merely to make a prompt longer. Identify the user's real objective, desired outcome, quality bar, constraints, assumptions, non-goals, and only the ambiguities that could materially change the result. Treat words such as master, best, ultimate, professional, perfect, and production-grade as ambition signals: translate them into concrete quality dimensions rather than parroting them. Ask no more than three high-value questions. Return JSON only.`;

export async function runCloudClarity({ draft, settings, context }) {
  const provider = settings.cloudProvider || 'openai';
  if (provider === 'openrouter') return runOpenRouter({ draft, settings, context });
  if (provider === 'managed') return runManaged({ draft, settings, context });
  return runOpenAI({ draft, settings, context });
}

async function runOpenAI({ draft, settings, context }) {
  if (!settings.openaiApiKey) throw new Error('OpenAI API key is not configured.');
  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify({
      model: settings.openaiModel || 'gpt-5.6-terra',
      reasoning: { effort: settings.reasoningEffort || 'medium' },
      instructions: SYSTEM_INSTRUCTIONS,
      input: buildInput(draft, context, settings),
      text: {
        format: {
          type: 'json_schema',
          name: 'clarity_contract_v1',
          strict: true,
          schema: CLARITY_SCHEMA
        }
      }
    })
  }, settings.remoteTimeoutMs);

  const payload = await readJson(response);
  const text = payload.output_text || payload.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
  if (!text) throw new Error('OpenAI returned no structured clarity output.');
  return JSON.parse(text);
}

async function runOpenRouter({ draft, settings, context }) {
  if (!settings.openrouterApiKey) throw new Error('OpenRouter API key is not configured.');
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.openrouterApiKey}`,
      'HTTP-Referer': 'https://github.com/GITMEB1/PromptenhancerV2',
      'X-Title': 'Prompt Enhancer V3'
    },
    body: JSON.stringify({
      model: settings.openrouterModel || 'openai/gpt-5.6-terra',
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTIONS },
        { role: 'user', content: buildInput(draft, context, settings) }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'clarity_contract_v1', strict: true, schema: CLARITY_SCHEMA }
      }
    })
  }, settings.remoteTimeoutMs);

  const payload = await readJson(response);
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned no structured clarity output.');
  return JSON.parse(text);
}

async function runManaged({ draft, settings, context }) {
  if (!settings.remoteEndpoint) throw new Error('Managed endpoint is not configured.');
  const response = await fetchWithTimeout(settings.remoteEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.remoteApiKey ? { Authorization: `Bearer ${settings.remoteApiKey}` } : {})
    },
    body: JSON.stringify({ draft, context, settings: publicSettings(settings), response_schema: 'clarity_contract_v1' })
  }, settings.remoteTimeoutMs);
  return readJson(response);
}

function buildInput(draft, context, settings) {
  return JSON.stringify({
    rough_request: draft,
    context,
    clarification_policy: settings.clarificationPolicy || 'balanced',
    maximum_questions: Number(settings.maxClarifyingQuestions) || 3
  });
}

function publicSettings(settings) {
  return {
    clarificationPolicy: settings.clarificationPolicy,
    maxClarifyingQuestions: settings.maxClarifyingQuestions,
    reasoningEffort: settings.reasoningEffort
  };
}

async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeoutMs) || 30000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    return response;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Provider request timed out after ${timeoutMs}ms.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) throw new Error('Provider returned a non-JSON response.');
  return response.json();
}

export const CLARITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['task_type','intent','interpretation','ambiguities','assumptions','clarified_brief','compiled_prompt','variants','safety_notes','confidence'],
  properties: {
    task_type: { type: 'string', enum: ['explain','research','write','edit','build','plan','analyse','decide'] },
    intent: {
      type: 'object', additionalProperties: false,
      required: ['primary_goal','desired_outcome','user_context','target_audience','quality_bar','success_criteria','hard_constraints','soft_preferences','non_goals'],
      properties: {
        primary_goal: { type: 'string' }, desired_outcome: { type: 'string' }, user_context: { type: 'string' }, target_audience: { type: 'string' }, quality_bar: { type: 'string' },
        success_criteria: { type: 'array', items: { type: 'string' } }, hard_constraints: { type: 'array', items: { type: 'string' } }, soft_preferences: { type: 'array', items: { type: 'string' } }, non_goals: { type: 'array', items: { type: 'string' } }
      }
    },
    interpretation: {
      type: 'object', additionalProperties: false, required: ['summary','important_cues'],
      properties: {
        summary: { type: 'string' },
        important_cues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['phrase','meaning','certainty'], properties: { phrase: { type: 'string' }, meaning: { type: 'string' }, certainty: { type: 'string', enum: ['low','medium','high'] } } } }
      }
    },
    ambiguities: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['topic','why_it_matters','materiality','resolution','question'], properties: { topic: { type: 'string' }, why_it_matters: { type: 'string' }, materiality: { type: 'string', enum: ['critical','important','optional'] }, resolution: { type: 'string', enum: ['ask','assume','ignore'] }, question: { type: 'string' } } } },
    assumptions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['assumption','reason','risk'], properties: { assumption: { type: 'string' }, reason: { type: 'string' }, risk: { type: 'string', enum: ['low','medium','high'] } } } },
    clarified_brief: { type: 'string' }, compiled_prompt: { type: 'string' },
    variants: { type: 'object', additionalProperties: false, required: ['concise','deep','implementation_spec'], properties: { concise: { type: 'string' }, deep: { type: 'string' }, implementation_spec: { type: 'string' } } },
    safety_notes: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'object', additionalProperties: false, required: ['level','rationale'], properties: { level: { type: 'string', enum: ['low','medium','high'] }, rationale: { type: 'string' } } }
  }
};
