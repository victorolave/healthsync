import { UnsupportedIntentError } from './unsupported-intent.error';

describe('UnsupportedIntentError', () => {
  let error: UnsupportedIntentError;

  beforeEach(() => {
    error = new UnsupportedIntentError('UNKNOWN');
  });

  it('is an instance of Error', () => {
    expect(error).toBeInstanceOf(Error);
  });

  it('is an instance of UnsupportedIntentError', () => {
    expect(error).toBeInstanceOf(UnsupportedIntentError);
  });

  it('carries the kind on the .kind property', () => {
    expect(error.kind).toBe('UNKNOWN');
  });

  it('message contains the kind string', () => {
    expect(error.message).toContain('UNKNOWN');
  });

  it('works with different kind values', () => {
    const e2 = new UnsupportedIntentError('RESCHEDULE');
    expect(e2.kind).toBe('RESCHEDULE');
    expect(e2.message).toContain('RESCHEDULE');
  });
});
