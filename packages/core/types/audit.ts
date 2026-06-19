export interface AuditEntry {
  id: string;
  actionType: string;
  summary: string;
  result: string;
  reversible: number;
  undoPayload: string | null;
  createdAt: number;
}
