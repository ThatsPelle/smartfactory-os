import { ManifestSchema, type Manifest } from '@sfos/contracts/manifest';

/**
 * Helper for module authors to declare a manifest with full type-checking and
 * runtime validation at import time.
 *
 * Modules write:
 *
 *   import { defineManifest } from '@sfos/module-sdk';
 *   export default defineManifest({ ... });
 *
 * Benefits:
 *   - TypeScript checks the shape against the canonical schema.
 *   - Zod re-validates at runtime when the module loads.
 *   - The platform's registry receives a guaranteed-valid manifest.
 *
 * Throws (at import time) if the manifest is invalid. This is intentional:
 * a malformed manifest should prevent module loading.
 */
export const defineManifest = (manifest: Manifest): Manifest => {
  const result = ManifestSchema.safeParse(manifest);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid manifest for "${manifest.identity?.id ?? '<unknown>'}":\n${issues}`
    );
  }
  return result.data;
};
