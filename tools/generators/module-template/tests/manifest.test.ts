/**
 * Manifest sanity check.
 *
 * Every module must have a valid manifest. `defineManifest` already validates
 * at import time; this test asserts the module's manifest exists and parses
 * cleanly, surfacing the failure in the test suite rather than only at
 * registry startup.
 *
 * Test runner (vitest) is wired in a later phase. Until then, this file
 * documents the required test shape; CI's per-module manifest validator
 * provides equivalent guarantees in the meantime.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import manifest from '../manifest.js';

// Example shape — uncomment once vitest is wired:
//
// import { describe, expect, test } from 'vitest';
// import { ManifestSchema } from '@sfos/contracts/manifest';
//
// describe('__MODULE_NAME__ manifest', () => {
//   test('parses against the platform schema', () => {
//     expect(() => ManifestSchema.parse(manifest)).not.toThrow();
//   });
//
//   test('namespace matches identity id', () => {
//     expect(manifest.schema.namespace).toMatch(/^module_/);
//   });
// });
