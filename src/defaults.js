export const DEFAULT_SETTINGS = {
  privacyMode: 'hybrid',
  cloudProvider: 'openai',
  openaiApiKey: '',
  openaiModel: 'gpt-5.6-terra',
  openrouterApiKey: '',
  openrouterModel: 'openai/gpt-5.6-terra',
  remoteEndpoint: '',
  remoteApiKey: '',
  remoteModelLabel: 'managed-clarity-engine',
  remoteTimeoutMs: 30000,
  reasoningEffort: 'medium',
  clarificationPolicy: 'balanced',
  maxClarifyingQuestions: 3,
  diagnosticsEnabled: false,
  saveLocalHistory: false,
  inlineButtonEnabled: true
};

export const EMPTY_RESULT = {
  version: 'clarity_contract_v1',
  task_type: 'write',
  intent: {
    primary_goal: '',
    desired_outcome: '',
    user_context: '',
    target_audience: '',
    quality_bar: '',
    success_criteria: [],
    hard_constraints: [],
    soft_preferences: [],
    non_goals: []
  },
  interpretation: { summary: '', important_cues: [] },
  ambiguities: [],
  assumptions: [],
  clarified_brief: '',
  compiled_prompt: '',
  improved_prompt: '',
  missing_constraints: [],
  clarifying_questions: [],
  variants: { concise: '', rigorous: '', agent_spec: '' },
  safety_notes: [],
  confidence: 0
};
