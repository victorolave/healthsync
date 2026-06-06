export class UnsupportedIntentError extends Error {
  readonly kind: string;

  constructor(kind: string) {
    super(`Unsupported intent kind: "${kind}"`);
    this.kind = kind;
    this.name = 'UnsupportedIntentError';
    // Required for proper instanceof checks when targeting ES5/CommonJS
    Object.setPrototypeOf(this, UnsupportedIntentError.prototype);
  }
}
