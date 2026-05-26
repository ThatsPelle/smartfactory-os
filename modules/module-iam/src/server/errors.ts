export type IamError =
  | { code: 'invalid_credentials' }
  | { code: 'account_locked'; lockedUntil: Date }
  | { code: 'session_not_found' }
  | { code: 'session_expired' }
  | { code: 'session_revoked' }
  | { code: 'invitation_not_found' }
  | { code: 'invitation_expired' }
  | { code: 'invitation_already_accepted' }
  | { code: 'invitation_already_revoked' }
  | { code: 'email_already_member' }
  | { code: 'reset_token_invalid' }
  | { code: 'reset_token_expired' }
  | { code: 'reset_token_consumed' }
  | { code: 'user_not_found' }
  | { code: 'permission_denied' };
