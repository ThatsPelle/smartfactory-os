import type { RuntimeDiagnostics } from './state.js';

/**
 * Human-readable rendering of a `RuntimeDiagnostics` snapshot.
 *
 * The output is plain ASCII with stable column-ish layout. Goals:
 *   - copy-pasteable into a bug report
 *   - greppable for a module id
 *   - the most important facts (failures, unresolved caps) appear first
 *
 * For programmatic consumption use `JSON.stringify(diagnostics)` directly.
 */
export const renderDiagnostics = (d: RuntimeDiagnostics): string => {
  const lines: string[] = [];
  lines.push('SmartFactory OS runtime diagnostics');
  lines.push(
    `  platform=${d.platformVersion}  mode=${d.runtimeMode}  ` +
      `ready=${d.ready ? 'yes' : 'no'}  startedAt=${d.startedAt.toISOString()}`
  );

  const phases = Object.entries(d.phaseDurations);
  if (phases.length > 0) {
    lines.push('  phases:');
    for (const [k, v] of phases) lines.push(`    ${k.padEnd(20)} ${v} ms`);
  }

  if (d.loadIssues.length > 0) {
    lines.push('');
    lines.push('Manifest load issues:');
    for (const i of d.loadIssues) {
      lines.push(`  [${i.kind}] ${i.moduleId ?? '<unknown>'}: ${i.detail}`);
    }
  }

  if (d.capabilityCycles.length > 0) {
    lines.push('');
    lines.push('Capability cycles (always a packaging mistake):');
    for (const c of d.capabilityCycles) {
      lines.push(`  ${c.join(' → ')} → ${c[0]}`);
    }
  }

  if (d.modules.length > 0) {
    lines.push('');
    lines.push('Modules:');
    for (const m of d.modules) {
      lines.push(`  ${m.moduleId}@${m.version}  state=${m.state}`);
      if (m.unresolved.length > 0) {
        for (const u of m.unresolved) {
          lines.push(`    unresolved: ${u.capability} (${u.versionRange})`);
        }
      }
      if (m.providers.length > 0) {
        lines.push(`    providers: ${m.providers.join(', ')}`);
      }
    }
  }

  return lines.join('\n');
};
