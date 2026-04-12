export const DEFAULT_SETTINGS = {
  privacyMode: 'hybrid',
  diagnosticsEnabled: false,
  saveLocalHistory: false,
  remoteEndpoint: '',
  remoteApiKey: '',
  remoteModelLabel: 'custom-remote',
  inlineButtonEnabled: true
};

export const EMPTY_RESULT = {
  task_type: 'write',
  improved_prompt: '',
  assumptions: [],
  missing_constraints: [],
  clarifying_questions: [],
  variants: {
    concise: '',
    rigorous: '',
    agent_spec: ''
  },
  safety_notes: [],
  confidence: 0.0
};
