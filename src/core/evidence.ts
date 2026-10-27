/**
 * Evidence and Epistemic Provenance primitives.
 * Distinguishes observations, derivations, inferences, and unknowns.
 */

export type EvidenceKind = 'observation' | 'derivation' | 'inference' | 'unknown';

export interface Evidence<T = unknown> {
  readonly kind: EvidenceKind;
  readonly description: string;
  readonly data?: T;
  readonly source?: string;
  readonly confidence?: number; // 0.0 - 1.0 (for inferences)
}

export function observe<T>(description: string, data?: T, source?: string): Evidence<T> {
  return {
    kind: 'observation',
    description,
    ...(data !== undefined ? { data } : {}),
    ...(source ? { source } : {})
  };
}

export function derive<T>(description: string, data?: T, source?: string): Evidence<T> {
  return {
    kind: 'derivation',
    description,
    ...(data !== undefined ? { data } : {}),
    ...(source ? { source } : {})
  };
}

export function infer<T>(
  description: string,
  confidence: number,
  data?: T,
  source?: string
): Evidence<T> {
  return {
    kind: 'inference',
    description,
    confidence: Math.max(0, Math.min(1, confidence)),
    ...(data !== undefined ? { data } : {}),
    ...(source ? { source } : {})
  };
}

export function unknown(description: string, source?: string): Evidence<undefined> {
  return {
    kind: 'unknown',
    description,
    ...(source ? { source } : {})
  };
}
