import type { ModuleLogger } from '@sfos/module-sdk';

/**
 * Tiny structured logger.
 *
 * The platform does not pick a logging framework for modules. Modules
 * receive a `ModuleLogger` (defined in @sfos/module-sdk) and the runtime
 * provides a minimal default that writes JSON lines to stdout. Apps that
 * want pino / pino-pretty / OpenTelemetry-correlated logs swap this out
 * by passing their own `ModuleLogger` factory to `bootstrap`.
 *
 * The default is intentionally minimal: stable JSON shape, no
 * dependencies, no global side effects beyond `process.stdout.write`.
 */

interface DefaultLoggerOptions {
  readonly moduleId: string;
  readonly fields?: Record<string, unknown>;
  /** stdout / stderr sink. Tests inject a fake. */
  readonly write?: (line: string) => void;
}

const writeLine = (sink: (line: string) => void, payload: object): void => {
  sink(`${JSON.stringify(payload)}\n`);
};

const _defaultWrite = (line: string): void => {
  process.stdout.write(line);
};

export const createDefaultLogger = (opts: DefaultLoggerOptions): ModuleLogger => {
  const baseFields = { module: opts.moduleId, ...(opts.fields ?? {}) };
  const sink = opts.write ?? _defaultWrite;

  const log = (level: string, message: string, fields?: Record<string, unknown>): void => {
    writeLine(sink, {
      level,
      ts: new Date().toISOString(),
      message,
      ...baseFields,
      ...(fields ?? {})
    });
  };

  return {
    debug: (m, f) => log('debug', m, f),
    info: (m, f) => log('info', m, f),
    warn: (m, f) => log('warn', m, f),
    error: (m, f) => log('error', m, f),
    child: (f) =>
      createDefaultLogger({
        moduleId: opts.moduleId,
        fields: { ...baseFields, ...f },
        write: sink
      })
  };
};
