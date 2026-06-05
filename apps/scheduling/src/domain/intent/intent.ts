export interface Intent {
  readonly kind: string;
  readonly params: Record<string, unknown>;
}
