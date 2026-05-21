/**
 * Capabilities provided by the __DISPLAY_NAME__ module.
 *
 * Capabilities are versioned contracts. Other modules, widgets, and AI tools
 * depend on capabilities (`__MODULE_NAME__.example@1`) rather than on this
 * module by name — that's what makes alternative providers swappable.
 *
 * See docs/architecture/04-manifest-and-events.md §4.
 */

export const __MODULE_NAME___CAPABILITIES = {
  // Example shape — replace with real entries:
  // EXAMPLE: '__MODULE_NAME__.example@1',
} as const;

export type __MODULE_NAME___Capability =
  (typeof __MODULE_NAME___CAPABILITIES)[keyof typeof __MODULE_NAME___CAPABILITIES];
