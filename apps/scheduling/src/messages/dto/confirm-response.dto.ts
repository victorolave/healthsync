import type { OperationDto } from './plan-response.dto';
import type { AgendaDto } from './agenda.dto';

/**
 * Response shape for POST /messages/confirm.
 * Returns the applied operations and the updated agenda snapshot.
 */
export interface ConfirmResponseDto {
  status: 'applied';
  operations: OperationDto[];
  agenda: AgendaDto;
}
