import { IntentResponseDto } from '../dto/intent-response.dto';

/**
 * Outbound port (owned by the application) for interpreting a doctor's message
 * into a structured intent. The HTTP/FastAPI implementation is an adapter in
 * the infrastructure layer — the application depends on this interface, never
 * on the concrete transport (ADR-0002 hexagonal).
 */
export interface LanguagePort {
  interprets(message: string): Promise<IntentResponseDto>;
}

/** DI token: the port is an interface, so it cannot be injected by type. */
export const LANGUAGE_PORT = Symbol('LANGUAGE_PORT');
