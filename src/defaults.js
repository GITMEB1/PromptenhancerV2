export const DEFAULT_SETTINGS = {
  privacyMode: 'hybrid',
  cloudProvider: 'openai',
  openaiModel: 'gpt-5.6-terra',
  openrouterModel: 'openai/gpt-5.6-terra',
  managedEndpoint: '',
  managedModelLabel: 'managed-clarity-engine',
  reasoningEffort: 'medium',
  clarificationPolicy: 'balanced',
  maxClarifyingQuestions: 3,
  remoteTimeoutMs: 30000,
  diagnosticsEnabled: false,
  saveLocalHistory: false,
  inlineButtonEnabled: true
};

export const SECRET_SETTING_KEYS = [
  'openaiApiKey',
  'openrouterApiKey',
  'managedApiKey'
];
