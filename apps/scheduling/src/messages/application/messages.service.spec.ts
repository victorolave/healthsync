import { ServiceUnavailableException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { LanguagePort } from './language.port';
import { MessageDto } from '../dto/message.dto';

describe('MessagesService', () => {
  let service: MessagesService;
  let language: jest.Mocked<LanguagePort>;

  const mockIntentResponse = {
    intent: { kind: 'DELAY', params: { minutes: 15 } },
    confidence: 1.0,
  };

  beforeEach(() => {
    language = { interprets: jest.fn() };
    service = new MessagesService(language);
  });

  it('returns the language response unchanged', async () => {
    language.interprets.mockResolvedValueOnce(mockIntentResponse);

    const dto: MessageDto = { message: 'push my 3pm back 30 min' };
    const result = await service.process(dto);

    expect(language.interprets).toHaveBeenCalledWith(dto.message);
    expect(result).toEqual(mockIntentResponse);
  });

  it('re-throws ServiceUnavailableException when the port throws', async () => {
    language.interprets.mockRejectedValueOnce(
      new ServiceUnavailableException({ error: 'language_unavailable' }),
    );

    const dto: MessageDto = { message: 'test' };
    await expect(service.process(dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
