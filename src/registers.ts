export type RegisterId =
  | 'formal'
  | 'literary'
  | 'neutral'
  | 'casual'
  | 'colloquial'
  | 'vulgar';

export const REGISTER_LABEL: Record<RegisterId, string> = {
  formal: 'Formal',
  literary: 'Literary',
  neutral: 'Neutral',
  casual: 'Casual',
  colloquial: 'Colloquial',
  vulgar: 'Vulgar',
};

export const REGISTER_CSS_VAR: Record<RegisterId, string> = {
  formal: 'var(--register-formal)',
  literary: 'var(--register-literary)',
  neutral: 'var(--register-neutral)',
  casual: 'var(--register-casual)',
  colloquial: 'var(--register-colloquial)',
  vulgar: 'var(--register-vulgar)',
};
