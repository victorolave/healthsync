import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IntentResponseDto } from '../dto/intent-response.dto';
import { LanguagePort } from '../application/language.port';

/**
 * HTTP adapter implementing the LanguagePort against the FastAPI language
 * service over synchronous REST (ADR-0007). Uses native fetch with a 10s
 * AbortController timeout — kept above language's own 8s request_timeout so
 * language returns its structured 503 first on cold-start delays.
 */
@Injectable()
export class HttpLanguageAdapter implements LanguagePort {
  private readonly languageUrl: string;

  constructor() {
    this.languageUrl = process.env.LANGUAGE_URL ?? 'http://localhost:8000';
  }

  async interprets(message: string): Promise<IntentResponseDto> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.languageUrl}/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException({
          error: 'language_unavailable',
        });
      }

      return response.json() as Promise<IntentResponseDto>;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      throw new ServiceUnavailableException({ error: 'language_unavailable' });
    } finally {
      clearTimeout(timeout);
    }
  }
}
