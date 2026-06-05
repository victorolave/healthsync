import { ServiceUnavailableException } from '@nestjs/common';
import { HttpLanguageAdapter } from './http-language.adapter';

describe('HttpLanguageAdapter', () => {
  let adapter: HttpLanguageAdapter;
  const originalFetch = global.fetch;
  const originalEnv = process.env.LANGUAGE_URL;

  beforeEach(() => {
    process.env.LANGUAGE_URL = 'http://localhost:8000';
    adapter = new HttpLanguageAdapter();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.LANGUAGE_URL;
    } else {
      process.env.LANGUAGE_URL = originalEnv;
    }
  });

  it('calls LANGUAGE_URL/interpret and returns the parsed body', async () => {
    const mockResponse = {
      intent: { kind: 'DELAY', params: { minutes: 15 } },
      confidence: 1.0,
    };

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValueOnce(mockResponse),
    } as unknown as Response);

    const result = await adapter.interprets('push my 3pm back');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/interpret',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message: 'push my 3pm back' }),
      }),
    );
    expect(result).toEqual(mockResponse);
  });

  it('throws ServiceUnavailableException when response is non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValueOnce({}),
    } as unknown as Response);

    await expect(adapter.interprets('test')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException when fetch rejects (connection refused)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Connection refused'));

    await expect(adapter.interprets('test')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('throws ServiceUnavailableException when AbortController timeout fires', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), {
        name: 'AbortError',
      }),
    );

    await expect(adapter.interprets('test')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
