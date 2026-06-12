import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEventCatalog } from './index.mjs';

const event = (type) => ({
  type,
  version: '1.0',
  audit_required: true,
  ai_readable: false,
  since_module_version: '0.1.0'
});

const record = (overrides = {}) => ({
  modulePath: 'modules/module-iam',
  slug: 'iam',
  manifest: {
    identity: { id: 'sfos.iam' },
    events_produced: [event('iam.session.created')]
  },
  eventConstants: ['iam.session.created'],
  ...overrides
});

test('accepts declared events owned by the full manifest module id', () => {
  assert.deepEqual(validateEventCatalog([record()]), []);
});

test('rejects malformed, duplicate, and foreign-owned manifest events', () => {
  const errors = validateEventCatalog([
    record({
      manifest: {
        identity: { id: 'sfos.iam' },
        events_produced: [
          event('iam.session.created'),
          event('iam.session.created'),
          event('warehouse.item.created'),
          event('invalid')
        ]
      },
      eventConstants: ['iam.session.created', 'warehouse.item.created', 'invalid']
    })
  ]).join('\n');

  assert.match(errors, /duplicate event/);
  assert.match(errors, /foreign event ownership/);
  assert.match(errors, /invalid event type/);
});

test('rejects undeclared constants and declarations without constants', () => {
  const errors = validateEventCatalog([
    record({
      manifest: {
        identity: { id: 'sfos.iam' },
        events_produced: [event('iam.session.created'), event('iam.session.revoked')]
      },
      eventConstants: ['iam.session.created', 'iam.invitation.created']
    })
  ]).join('\n');

  assert.match(errors, /constant not declared/);
  assert.match(errors, /declaration missing from event constants/);
});
