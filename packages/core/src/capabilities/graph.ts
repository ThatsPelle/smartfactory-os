import type { RegisteredModule } from '@sfos/module-sdk';

import { parseCapabilityKey, satisfies, type CapabilityRequirement } from './version.js';

/**
 * Capability graph.
 *
 * Built from the set of registered manifests. Nodes are module ids; edges
 * are "X requires a capability provided by Y". Used to:
 *
 *   1. Detect missing required capabilities (no provider).
 *   2. Detect ambiguous requirements (multiple providers — we forbid this
 *      in v1; modules must pick a specific provider via manifest if/when
 *      we add that).
 *   3. Compute a topological order for initialization.
 *   4. Detect cycles (which are always a packaging mistake — capabilities
 *      are contracts, not bidirectional channels).
 */

export interface CapabilityResolution {
  /** Init order: leaves first, roots last. */
  readonly order: readonly string[];
  /**
   * For each module, the set of provider module ids that satisfy its
   * `requires`. A missing requirement is in `unresolvedByModule` instead.
   */
  readonly providersByModule: ReadonlyMap<string, readonly string[]>;
  /** Module id → list of requirements with no provider. */
  readonly unresolvedByModule: ReadonlyMap<string, readonly CapabilityRequirement[]>;
  /** Cycle detection: each entry is a list of ids forming a cycle. */
  readonly cycles: readonly (readonly string[])[];
}

/**
 * Map each provided capability key to the modules providing it. Both
 * `provides` and `provides_optional` participate.
 */
const indexProviders = (
  modules: readonly RegisteredModule[]
): Map<string, readonly RegisteredModule[]> => {
  const byKey = new Map<string, RegisteredModule[]>();
  for (const m of modules) {
    const all = [...m.manifest.capabilities.provides, ...m.manifest.capabilities.provides_optional];
    for (const cap of all) {
      // Sanity-check the cap key format up front so a malformed manifest
      // surfaces here, not deep in resolution.
      parseCapabilityKey(cap.key);
      const arr = byKey.get(cap.key) ?? [];
      arr.push(m);
      byKey.set(cap.key, arr);
    }
  }
  return byKey;
};

const tarjanSCC = (
  ids: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>
): readonly (readonly string[])[] => {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  // Tarjan's invariant: any node `v` written to `indices`/`lowlink` always
  // has values present afterward. `getNumber` centralizes that invariant
  // so the algorithm body reads cleanly and a violation surfaces loudly
  // (a thrown invariant is better than `undefined` propagating silently).
  const getNumber = (m: Map<string, number>, v: string): number => {
    const n = m.get(v);
    if (n === undefined) {
      throw new Error(`tarjanSCC invariant violated: missing entry for "${v}"`);
    }
    return n;
  };

  const strongconnect = (v: string): void => {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(getNumber(lowlink, v), getNumber(lowlink, w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(getNumber(lowlink, v), getNumber(indices, w)));
      }
    }
    if (lowlink.get(v) === indices.get(v)) {
      const component: string[] = [];
      for (;;) {
        const w = stack.pop();
        if (w === undefined) {
          throw new Error(`tarjanSCC invariant violated: stack empty while popping SCC for "${v}"`);
        }
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      sccs.push(component);
    }
  };

  for (const v of ids) {
    if (!indices.has(v)) strongconnect(v);
  }
  // Cycles are SCCs of size > 1, or self-loops (size 1 with a self-edge).
  return sccs.filter((c) => {
    if (c.length > 1) return true;
    const only = c[0];
    return only !== undefined && (edges.get(only) ?? []).includes(only);
  });
};

const topoSort = (
  ids: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>
): readonly string[] => {
  // Kahn's algorithm. edges[v] = providers v depends on. We want providers
  // before dependents → emit nodes with no outgoing-required edges first.
  const remaining = new Map<string, Set<string>>();
  for (const v of ids) remaining.set(v, new Set(edges.get(v) ?? []));
  const order: string[] = [];
  const queue: string[] = [];
  for (const [v, deps] of remaining) if (deps.size === 0) queue.push(v);

  while (queue.length > 0) {
    const v = queue.shift();
    if (v === undefined) break;
    order.push(v);
    for (const [w, deps] of remaining) {
      if (deps.delete(v) && deps.size === 0) queue.push(w);
    }
  }
  // If a cycle exists, some nodes won't be ordered — caller has already
  // detected the cycle via tarjanSCC and reported it; we still surface a
  // best-effort partial order so diagnostics aren't empty.
  for (const v of ids) {
    if (!order.includes(v)) order.push(v);
  }
  return order;
};

export const resolveCapabilities = (modules: readonly RegisteredModule[]): CapabilityResolution => {
  const providersByKey = indexProviders(modules);
  const providersByModule = new Map<string, string[]>();
  const unresolvedByModule = new Map<string, CapabilityRequirement[]>();
  const edges = new Map<string, string[]>();
  const ids = modules.map((m) => m.manifest.identity.id);

  for (const m of modules) {
    const id = m.manifest.identity.id;
    edges.set(id, []);
    providersByModule.set(id, []);
    const reqs = m.manifest.dependencies.requires;
    for (const rawReq of reqs) {
      // Manifest fields are snake_case; the internal CapabilityRequirement
      // type is camelCase. Normalize at the boundary so satisfies/diagnostics
      // can rely on the canonical shape.
      const req: CapabilityRequirement = {
        capability: rawReq.capability,
        versionRange: rawReq.version_range
      };
      const candidates = providersByKey.get(req.capability) ?? [];
      const matches = candidates.filter((c) =>
        satisfies(req, req.capability, c.manifest.identity.version)
      );
      if (matches.length === 0) {
        const arr = unresolvedByModule.get(id) ?? [];
        arr.push(req);
        unresolvedByModule.set(id, arr);
      } else {
        // v1 policy: a requirement must resolve to exactly one provider.
        // Multiple providers is a configuration error a deployment must
        // resolve explicitly; we surface it as unresolved for now.
        if (matches.length > 1) {
          const arr = unresolvedByModule.get(id) ?? [];
          arr.push(req);
          unresolvedByModule.set(id, arr);
        } else {
          const winner = matches[0];
          if (winner === undefined) continue;
          const providerId = winner.manifest.identity.id;
          if (providerId !== id) {
            const edgeList = edges.get(id);
            const provList = providersByModule.get(id);
            if (edgeList === undefined || provList === undefined) {
              throw new Error(
                `resolveCapabilities invariant violated: missing bookkeeping for "${id}"`
              );
            }
            edgeList.push(providerId);
            provList.push(providerId);
          }
        }
      }
    }
  }

  const cycles = tarjanSCC(ids, edges);
  const order = topoSort(ids, edges);

  return {
    order,
    providersByModule: new Map([...providersByModule].map(([k, v]) => [k, v as readonly string[]])),
    unresolvedByModule: new Map(
      [...unresolvedByModule].map(([k, v]) => [k, v as readonly CapabilityRequirement[]])
    ),
    cycles
  };
};
