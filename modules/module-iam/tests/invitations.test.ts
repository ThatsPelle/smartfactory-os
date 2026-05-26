import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIamDb } from '../src/server/db/client.js';
import { createInvitation, acceptInvitation, revokeInvitation } from '../src/server/api/invitations.js';
import { makeIamCtx, seedUser, cleanup } from './helpers.js';
import type { IamServiceCtx } from '../src/server/context.js';

const DB_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!DB_URL)('invitations service — integration', () => {
  let iamClient: ReturnType<typeof createIamDb>;
  let adminUserId: string;

  beforeAll(async () => {
    iamClient = createIamDb(DB_URL!);
    ({ userId: adminUserId } = await seedUser(iamClient.db, 'admin@test.example', 'AdminPass123!'));
  });

  afterAll(async () => {
    await cleanup(iamClient.db);
    await iamClient.close();
  });

  it('createInvitation returns a token and invite view', async () => {
    const { ctx } = makeIamCtx(iamClient.db, {
      actorUserId: adminUserId as IamServiceCtx['actorUserId']
    });
    const result = await createInvitation(ctx, { email: 'invite1@test.example', role: 'member' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toBeTruthy();
    expect(result.value.invitation.status).toBe('pending');
    expect(result.value.invitation.email).toBe('invite1@test.example');
  });

  it('acceptInvitation succeeds once and returns already_accepted on repeat', async () => {
    const { ctx } = makeIamCtx(iamClient.db, {
      actorUserId: adminUserId as IamServiceCtx['actorUserId']
    });
    const created = await createInvitation(ctx, { email: 'invite2@test.example', role: 'member' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const { userId: acceptorId } = await seedUser(iamClient.db, 'acceptor@test.example', 'Pass123!');

    const first = await acceptInvitation(ctx, {
      token: created.value.token,
      acceptingUserId: acceptorId
    });
    expect(first.ok).toBe(true);

    const second = await acceptInvitation(ctx, {
      token: created.value.token,
      acceptingUserId: acceptorId
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('invitation_already_accepted');
  });

  it('revokeInvitation succeeds and blocks subsequent accept', async () => {
    const { ctx } = makeIamCtx(iamClient.db, {
      actorUserId: adminUserId as IamServiceCtx['actorUserId']
    });
    const created = await createInvitation(ctx, { email: 'invite3@test.example', role: 'member' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const revoked = await revokeInvitation(ctx, { invitationId: created.value.invitation.id });
    expect(revoked.ok).toBe(true);

    const accepted = await acceptInvitation(ctx, {
      token: created.value.token,
      acceptingUserId: adminUserId
    });
    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted.error.code).toBe('invitation_already_revoked');
  });
});
