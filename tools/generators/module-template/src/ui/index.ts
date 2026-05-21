/**
 * __DISPLAY_NAME__ module — UI registration entry point.
 *
 * Exports route components, widget components, and any UI-side hooks used by
 * the web app's module registry. The platform's web app composes its router
 * and widget catalog from each module's UI exports.
 *
 * Rules:
 *   - UI never accesses the database directly. All data fetches go through
 *     the module's API client (typed). The React preset's `no-restricted-imports`
 *     blocks `@sfos/db` and `**/server/db/*` from UI files.
 *   - Widgets register themselves via the manifest's `widgets` block (added
 *     when the platform's widget runtime lands).
 */

// Placeholder export — replace with real widget/route exports once UI lands.
export const moduleName = '__MODULE_NAME__';
