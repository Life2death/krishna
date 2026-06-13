export interface LearnedAction {
  id: string;
  displayName: string;
  target: string;
  input: string;
  resolvedVia: string;
  confidence: number;
  createdAt: number;
}
