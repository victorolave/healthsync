import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IntentResponseDto } from './dto/intent-response.dto';

@Injectable()
export class LanguageClient {
  private readonly languageUrl: string;

  constructor() {
    this.languageUrl =
      process.env.LANGUAGE_URL ?? 'http://localhost:8000';
  }

  async interprets(message: string): Promise<IntentResponseDto> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${this.languageUrl}/interpret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException({ error: 'language_unavailable' });
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
