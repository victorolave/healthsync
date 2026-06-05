export class IntentResponseDto {
  intent: {
    kind: string;
    params: Record<string, unknown>;
  };

  confidence: number;
}
