import { Err, OkVoid } from '@sfos/contracts/result';
import type { ModuleLifecycle } from '@sfos/module-sdk';

export const lifecycle: ModuleLifecycle = {
  async preFlight(_ctx) {
    if (!process.env['DATABASE_IAM_URL']) {
      return Err('DATABASE_IAM_URL is not set');
    }
    return OkVoid();
  }
};
