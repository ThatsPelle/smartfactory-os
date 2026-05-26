import type { EventEnvelope } from '@sfos/contracts/envelope';

import { matches } from './matcher.js';
import { ForeignEmissionError } from './ownership.js';

/**
 * In-process event bus.
 *
 * Modules subscribe to event-type patterns at startup (during the
 * `register` lifecycle hook). The outbox publisher (and, in tests, the
 * harness) calls `dispatch(envelope)` to invoke every matching handler.
 *
 * The bus is deliberately tiny. No queueing, no concurrency control
 * beyond sequential per-envelope dispatch, no priority, no filtering
 * beyond pattern match. Modules that need any of that wrap a handler with
 * their own logic — keeping the bus itself one-purpose makes a failed
 * handler diagnose-able from a stack trace alone.
 *
 * Failure isolation: handlers run in sequence, and one handler's throw
 * does NOT prevent the rest from running. Failures are collected into
 * the `DispatchResult` and surfaced to the publisher, which records them
 * against the outbox row.
 */

export type EventHandler = (event: EventEnvelope) => Promise<void>;

export interface Subscription {
  /** Module id that registered the handler. Used for ownership + diagnostics. */
  readonly moduleId: string;
  readonly pattern: string;
  readonly handler: EventHandler;
}

export interface HandlerFailure {
  readonly subscription: Subscription;
  readonly error: Error;
}

export interface DispatchResult {
  readonly event: EventEnvelope;
  readonly invoked: readonly Subscription[];
  readonly failures: readonly HandlerFailure[];
}

export class EventBus {
  readonly #subscriptions: Subscription[] = [];

  /** Register a handler. Idempotency is the handler's responsibility. */
  subscribe(moduleId: string, pattern: string, handler: EventHandler): void {
    this.#subscriptions.push({ moduleId, pattern, handler });
  }

  subscriptions(): readonly Subscription[] {
    return this.#subscriptions;
  }

  /**
   * Ownership-checked emission. The envelope's `source_module` MUST match
   * `emittingModuleId`. This is the only legal path for tenant code to
   * write an event onto the bus directly (without going through the
   * outbox); the outbox publisher uses `dispatch` directly because it has
   * already validated ownership on insert via RLS + manifest checks.
   */
  async emit(emittingModuleId: string, event: EventEnvelope): Promise<DispatchResult> {
    if (event.source_module !== emittingModuleId) {
      throw new ForeignEmissionError(emittingModuleId, event.source_module, event.type);
    }
    return this.dispatch(event);
  }

  /**
   * Run every matching handler. Returns a result with per-handler failure
   * detail; never throws (callers — typically the publisher — decide
   * what to do with failures).
   */
  async dispatch(event: EventEnvelope): Promise<DispatchResult> {
    const invoked: Subscription[] = [];
    const failures: HandlerFailure[] = [];
    for (const sub of this.#subscriptions) {
      if (!matches(sub.pattern, event.type)) continue;
      invoked.push(sub);
      try {
        await sub.handler(event);
      } catch (e) {
        failures.push({
          subscription: sub,
          error: e instanceof Error ? e : new Error(String(e))
        });
      }
    }
    return { event, invoked, failures };
  }
}
