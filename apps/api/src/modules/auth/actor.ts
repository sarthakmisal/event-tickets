import type { Role } from '@et/shared';
import { forbidden } from '../../shared/errors';

/** The authenticated caller, attached to every protected request. */
export interface Actor {
  id: string;
  name: string;
  role: Role;
  /** Set for organisers and organiser-scoped gate staff; null for the platform owner. */
  organiserId: string | null;
}

/** Resolves which organiser's data the actor may touch: their own, or any (owner) when null. */
export function organiserScope(actor: Actor): string | null {
  if (actor.role === 'OWNER') return null;
  if (!actor.organiserId) throw forbidden();
  return actor.organiserId;
}
