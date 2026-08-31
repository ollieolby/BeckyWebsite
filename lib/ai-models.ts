export const AI_MODELS = [
  { id: 'gpt-5.4-nano', label: 'Fast · GPT-5.4 nano' },
  { id: 'gpt-5.4-mini', label: 'Balanced · GPT-5.4 mini' },
  { id: 'gpt-5-mini', label: 'Original · GPT-5 mini' },
] as const;

export const DEFAULT_AI_MODEL = 'gpt-5.4-nano';

export function isAllowedAiModel(value: unknown): value is (typeof AI_MODELS)[number]['id'] {
  return typeof value === 'string' && AI_MODELS.some((model) => model.id === value);
}
