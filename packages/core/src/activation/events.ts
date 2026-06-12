export const CORE_RUNTIME_MODULE_ID = 'sfos.core' as const;

export const CORE_MODULE_ACTIVATION_EVENTS = {
  ACTIVATED: 'core.module.activated',
  ACTIVATION_FAILED: 'core.module.activation_failed',
  DEACTIVATED: 'core.module.deactivated',
  DEACTIVATION_FAILED: 'core.module.deactivation_failed'
} as const;
