import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CREATE_TABLE_PATTERN =
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:core|module_[a-z0-9_]+)\.[a-z][a-z0-9_]*)\s*\(([\s\S]*?)\);/gi;

const REQUIRED_RLS_TABLES = [
  'core.companies',
  'core.memberships',
  'core.company_modules',
  'core.audit_logs',
  'core.outbox_events',
  'module_iam.credentials',
  'module_iam.sessions',
  'module_iam.invitations',
  'module_iam.password_reset_tokens'
];

const normalizeSql = (sql) => sql.replace(/--.*$/gm, ' ').replace(/\s+/g, ' ').trim();

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const hasStatement = (sql, table, clause) =>
  new RegExp(`\\bALTER\\s+TABLE\\s+${escapePattern(table)}\\s+${clause}\\s*;`, 'i').test(sql);

const tablePolicyBlocks = (sql, table) => {
  const escaped = escapePattern(table);
  return [
    ...sql.matchAll(
      new RegExp(
        `\\bCREATE\\s+POLICY\\s+[a-z0-9_]+\\s+ON\\s+${escaped}\\b[\\s\\S]*?(?=\\bCREATE\\s+POLICY\\b|\\bALTER\\s+TABLE\\b|\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\b|\\bCREATE\\s+TRIGGER\\b|\\bCOMMIT\\b|$)`,
        'gi'
      )
    )
  ].map((match) => match[0]);
};

export const validateRlsCorpus = (files, options = {}) => {
  const errors = [];
  const rawSql = files
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => file.content)
    .join('\n');
  const sql = normalizeSql(rawSql);
  const tables = [];

  for (const match of rawSql.matchAll(CREATE_TABLE_PATTERN)) {
    const table = match[1];
    const body = match[2];
    tables.push({
      table,
      tenantScoped: /\bcompany_id\b/i.test(body)
    });
  }

  const discoveredTables = new Set(tables.map(({ table }) => table));
  for (const table of options.requiredTables ?? []) {
    if (!discoveredTables.has(table)) {
      errors.push(`${table}: required table not found`);
    }
  }

  for (const { table, tenantScoped } of tables.sort((left, right) =>
    left.table.localeCompare(right.table)
  )) {
    if (!hasStatement(sql, table, 'ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY')) {
      errors.push(`${table}: missing ENABLE ROW LEVEL SECURITY`);
    }
    if (!hasStatement(sql, table, 'FORCE\\s+ROW\\s+LEVEL\\s+SECURITY')) {
      errors.push(`${table}: missing FORCE ROW LEVEL SECURITY`);
    }

    if (tenantScoped) {
      const policies = tablePolicyBlocks(sql, table);
      if (!policies.some((policy) => /\bapp\.current_company_id\s*\(\s*\)/i.test(policy))) {
        errors.push(`${table}: no policy binds tenant context`);
      }
    }
  }

  for (const helper of ['app.current_company_id', 'app.current_user_id', 'app.current_user_has']) {
    if (
      !new RegExp(
        `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${escapePattern(helper)}\\s*\\(`,
        'i'
      ).test(sql)
    ) {
      errors.push(`missing tenant helper ${helper}`);
    }
  }

  const auditRequirements = [
    ['audit_logs_update_none', /\bCREATE\s+POLICY\s+audit_logs_update_none\b/i],
    ['audit_logs_delete_none', /\bCREATE\s+POLICY\s+audit_logs_delete_none\b/i],
    [
      'audit_logs_block_mutation',
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+app\.audit_logs_block_mutation\s*\(/i
    ],
    [
      'audit_logs_block_update',
      /\bCREATE\s+TRIGGER\s+audit_logs_block_update\s+BEFORE\s+UPDATE\s+ON\s+core\.audit_logs\b/i
    ],
    [
      'audit_logs_block_delete',
      /\bCREATE\s+TRIGGER\s+audit_logs_block_delete\s+BEFORE\s+DELETE\s+ON\s+core\.audit_logs\b/i
    ]
  ];
  for (const [label, pattern] of auditRequirements) {
    if (!pattern.test(sql)) {
      errors.push(`missing audit append-only guard ${label}`);
    }
  }

  return [...new Set(errors)].sort();
};

const collectSqlFiles = async (directory) => {
  const files = [];
  const visit = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'templates') continue;
        await visit(target);
      } else if (entry.isFile() && entry.name.endsWith('.sql')) {
        files.push({
          path: target,
          content: await readFile(target, 'utf8')
        });
      }
    }
  };
  await visit(directory);
  return files;
};

export const runRlsValidation = async (rootDirectory) => {
  const files = [
    ...(await collectSqlFiles(path.join(rootDirectory, 'packages', 'db', 'drizzle'))),
    ...(await collectSqlFiles(path.join(rootDirectory, 'modules')))
  ].map((file) => ({
    path: path.relative(rootDirectory, file.path).split(path.sep).join('/'),
    content: file.content
  }));

  if (files.length === 0) return ['no SQL migrations discovered'];
  return validateRlsCorpus(files, { requiredTables: REQUIRED_RLS_TABLES });
};

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const errors = await runRlsValidation(rootDirectory);
  if (errors.length > 0) {
    process.stderr.write(
      `RLS validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`
    );
    process.exitCode = 1;
  } else {
    process.stdout.write('RLS validation passed.\n');
  }
}
