import { ServiceUnavailableException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { LanguageClient } from './language.client';
import { MessageDto } from './dto/message.dto';

describe('MessagesService', () => {
  let service: MessagesService;
  let languageClient: jest.Mocked<LanguageClient>;

  const mockIntentResponse = {
    intent: { kind: 'DELAY', params: { minutes: 15 } },
    confidence: 1.0,
  };

  beforeEach(() => {
    languageClient = {
      interprets: jest.fn(),
    } as unknown as jest.Mocked<LanguageClient>;

    service = new MessagesService(languageClient);
  });

  it('returns the language response unchanged', async () => {
    languageClient.interprets.mockResolvedValueOnce(mockIntentResponse);

    const dto: MessageDto = { message: 'push my 3pm back 30 min' };
    const result = await service.process(dto);

    expect(languageClient.interprets).toHaveBeenCalledWith(dto.message);
    expect(result).toEqual(mockIntentResponse);
  });

  it('re-throws ServiceUnavailableException when client throws', async () => {
    languageClient.interprets.mockRejectedValueOnce(
      new ServiceUnavailableException({ error: 'language_unavailable' }),
    );

    const dto: MessageDto = { message: 'test' };
    await expect(service.process(dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
