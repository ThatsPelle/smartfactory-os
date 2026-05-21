import { ulid as generateUlid } from 'ulid';
import { asULID, type ULID } from '@sfos/contracts/brands';

/**
 * ULID generation.
 *
 * ULIDs are time-sortable, globally unique, 26-character base32 strings.
 * Used for event ids, audit entry ids, and outbox row ids.
 */
export const newULID = (): ULID => asULID(generateUlid());

/** Generate a ULID for a specific timestamp (test fixtures, replay scenarios). */
export const newULIDAt = (timestampMs: number): ULID => asULID(generateUlid(timestampMs));
