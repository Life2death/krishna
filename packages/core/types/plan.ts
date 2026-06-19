export interface Step {
  tool: string;
  args: Record<string, string>;
  out?: string;
}

export interface Plan {
  say: string;
  needsConfirmation: boolean;
  plan: Step[];
}

export interface ParsedPlan {
  say: string;
  plan: Step[];
  needsConfirmation: boolean;
}
