/**
 * Error classes exposed by the public API. Each one carries a stable `.code`.
 * `hint` is a one-line suggestion, `frame` an optional code frame (CSV/JSON input errors).
 */
export class RedirectGuardError extends Error {
  /**
   * @param {string} message
   * @param {{ hint?: string, frame?: string, cause?: unknown }} [extra]
   */
  constructor(message, extra = {}) {
    super(message, extra.cause !== undefined ? { cause: extra.cause } : undefined);
    this.name = new.target.name;
    if (extra.hint) this.hint = extra.hint;
    if (extra.frame) this.frame = extra.frame;
  }
}

export class UsageError extends RedirectGuardError {
  code = 'ERR_USAGE';
}

export class ConfigError extends RedirectGuardError {
  code = 'ERR_CONFIG';
}

export class InputError extends RedirectGuardError {
  code = 'ERR_INPUT';
}

/** Network failure for a single request (not exported as public API). */
export class NetworkError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
  }
}
