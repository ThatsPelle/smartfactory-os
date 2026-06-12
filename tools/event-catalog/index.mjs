import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  EventEnvelopeSchema,
  EventTypeSchema
} from '@sfos/contracts/envelope';
import { assertOwnership, buildEnvelope } from '@sfos/events';

import {
  discoverManifestRecords,
  validateManifestRecords
} from '../manifest-validator/index.mjs';

const duplicateValues = (values) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
};

export const validateEventCatalog = (records) => {
  const errors = [];
  const allDeclared = [];

  for (const record of records) {
    const moduleId = record.manifest.identity.id;
    const declaredEvents = record.manifest.events_produced.map(
      (event) => event.type
    );
    const constants = [...new Set(record.eventConstants)].sort();

    for (const duplicate of duplicateValues(declaredEvents)) {
      errors.push(`${record.modulePath}: duplicate event "${duplicate}"`);
    }

    for (const produced of record.manifest.events_produced) {
      if (!EventTypeSchema.safeParse(produced.type).success) {
        errors.push(
          `${record.modulePath}: invalid event type "${produced.type}"`
        );
        continue;
      }

      try {
        assertOwnership(produced.type, moduleId);
      } catch {
        errors.push(
          `${record.modulePath}: foreign event ownership "${produced.type}" for "${moduleId}"`
        );
        continue;
      }

      try {
        const envelope = buildEnvelope({
          type: produced.type,
          version: produced.version,
          source_module: moduleId,
          company_id: null,
          emitted_by: { kind: 'system', id: moduleId },
          correlation_id: 'event-validator',
          payload: {},
          audit_required: produced.audit_required
        });
        EventEnvelopeSchema.parse(envelope);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(
          `${record.modulePath}: incompatible event envelope "${produced.type}": ${message}`
        );
      }
    }

    const declaredSet = new Set(declaredEvents);
    const constantSet = new Set(constants);
    for (const eventType of constants) {
      if (!declaredSet.has(eventType)) {
        errors.push(
          `${record.modulePath}: event constant not declared in manifest "${eventType}"`
        );
      }
    }
    for (const eventType of declaredEvents) {
      if (!constantSet.has(eventType)) {
        errors.push(
          `${record.modulePath}: event declaration missing from event constants "${eventType}"`
        );
      }
    }

    allDeclared.push(
      ...declaredEvents.map((value) => ({
        modulePath: record.modulePath,
        value
      }))
    );
  }

  const grouped = new Map();
  for (const entry of allDeclared) {
    const paths = grouped.get(entry.value) ?? new Set();
    paths.add(entry.modulePath);
    grouped.set(entry.value, paths);
  }
  for (const [value, paths] of grouped) {
    if (paths.size > 1) {
      errors.push(
        `duplicate event "${value}" across ${[...paths].sort().join(', ')}`
      );
    }
  }

  return [...new Set(errors)].sort();
};

export const runEventValidation = async (rootDirectory) => {
  const records = await discoverManifestRecords(rootDirectory);
  const manifestErrors = validateManifestRecords(records);
  if (manifestErrors.length > 0) {
    return manifestErrors.map((error) => `manifest prerequisite: ${error}`);
  }
  return validateEventCatalog(records);
};

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const rootDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  );
  const errors = await runEventValidation(rootDirectory);
  if (errors.length > 0) {
    process.stderr.write(
      `Event validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`
    );
    process.exitCode = 1;
  } else {
    process.stdout.write('Event validation passed.\n');
  }
}
