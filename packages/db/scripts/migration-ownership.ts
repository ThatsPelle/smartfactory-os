import type { MigrationOwner } from './migration-plan.js';

const stripNonExecutableText = (sql: string): string =>
  sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\$[a-z0-9_]*\$[\s\S]*?\$[a-z0-9_]*\$/gi, ' ')
    .replace(/'(?:''|[^'])*'/g, ' ');

interface TargetPattern {
  readonly label: string;
  readonly pattern: RegExp;
}

const TARGET_PATTERNS: readonly TargetPattern[] = [
  {
    label: 'CREATE SCHEMA',
    pattern: /\bCREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z][a-z0-9_]*)/gi
  },
  {
    label: 'CREATE TABLE',
    pattern: /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  },
  {
    label: 'ALTER TABLE',
    pattern: /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  },
  {
    label: 'DROP TABLE',
    pattern: /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  },
  {
    label: 'CREATE TYPE',
    pattern: /\bCREATE\s+TYPE\s+([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  },
  {
    label: 'ALTER TYPE',
    pattern: /\bALTER\s+TYPE\s+([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  },
  {
    label: 'DROP TYPE',
    pattern: /\bDROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  },
  {
    label: 'CREATE FUNCTION',
    pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*\s*\(/gi
  },
  {
    label: 'ALTER FUNCTION',
    pattern: /\bALTER\s+FUNCTION\s+([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*\s*\(/gi
  },
  {
    label: 'DROP FUNCTION',
    pattern: /\bDROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*\s*\(/gi
  },
  {
    label: 'CREATE INDEX',
    pattern:
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+[a-z][a-z0-9_]*\s+ON\s+([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  },
  {
    label: 'CREATE TRIGGER',
    pattern:
      /\bCREATE\s+TRIGGER\s+[a-z][a-z0-9_]*[\s\S]*?\bON\s+([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  },
  {
    label: 'CREATE POLICY',
    pattern: /\bCREATE\s+POLICY\s+[a-z][a-z0-9_]*\s+ON\s+([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  },
  {
    label: 'DROP POLICY',
    pattern:
      /\bDROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?[a-z][a-z0-9_]*\s+ON\s+([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/gi
  }
];

const UNQUALIFIED_MODULE_TARGET_PATTERNS: readonly TargetPattern[] = [
  {
    label: 'CREATE TABLE',
    pattern: /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-z][a-z0-9_]*(?!\s*\.)\s*\(/gi
  },
  {
    label: 'ALTER TABLE',
    pattern: /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?[a-z][a-z0-9_]*(?!\s*\.)\s+/gi
  },
  {
    label: 'DROP TABLE',
    pattern: /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[a-z][a-z0-9_]*(?!\s*\.)\s*(?:;|,)/gi
  },
  {
    label: 'CREATE TYPE',
    pattern: /\bCREATE\s+TYPE\s+[a-z][a-z0-9_]*(?!\s*\.)\s+AS\b/gi
  },
  {
    label: 'ALTER TYPE',
    pattern: /\bALTER\s+TYPE\s+[a-z][a-z0-9_]*(?!\s*\.)\s+/gi
  },
  {
    label: 'DROP TYPE',
    pattern: /\bDROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?[a-z][a-z0-9_]*(?!\s*\.)\s*(?:;|,)/gi
  },
  {
    label: 'CREATE FUNCTION',
    pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+[a-z][a-z0-9_]*(?!\s*\.)\s*\(/gi
  },
  {
    label: 'ALTER FUNCTION',
    pattern: /\bALTER\s+FUNCTION\s+[a-z][a-z0-9_]*(?!\s*\.)\s*\(/gi
  },
  {
    label: 'DROP FUNCTION',
    pattern: /\bDROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?[a-z][a-z0-9_]*(?!\s*\.)\s*\(/gi
  }
];

const schemaAllowed = (owner: MigrationOwner, schema: string): boolean =>
  owner.kind === 'core' ? schema === 'core' || schema === 'app' : schema === owner.schema;

export const validateMigrationOwnership = (
  sql: string,
  owner: MigrationOwner
): readonly string[] => {
  const executable = stripNonExecutableText(sql);
  const errors: string[] = [];

  for (const { label, pattern } of TARGET_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of executable.matchAll(pattern)) {
      const schema = match[1];
      if (schema && !schemaAllowed(owner, schema)) {
        errors.push(`${owner.id}: ${label} targets foreign schema ${schema}`);
      }
    }
  }

  if (owner.kind === 'module') {
    for (const { label, pattern } of UNQUALIFIED_MODULE_TARGET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(executable)) {
        errors.push(`${owner.id}: ${label} target must be schema-qualified`);
      }
    }
  }

  return [...new Set(errors)].sort();
};
