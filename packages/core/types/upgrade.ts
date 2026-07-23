export type UpgradeTaskStatus =
  | "captured"
  | "queued"
  | "analyzing"
  | "proposed"
  | "approved_for_code"
  | "implementing"
  | "review_ready"
  | "completed"
  | "rejected"
  | "failed"
  | "archived";

export type UpgradeProviderPolicy = "codex" | "claude" | "codex_plus_claude";
export type UpgradePriority = "low" | "normal" | "high";
export type UpgradeSource = "voice" | "text" | "manual";
export type UpgradePlatform = "desktop" | "android" | "unknown";

export type UpgradeRunStage = "proposal" | "review" | "implementation";
export type UpgradeRunProvider = "codex" | "claude-code";
export type UpgradeRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type UpgradeEventType =
  | "task_created"
  | "task_updated"
  | "task_archived"
  | "manual_analysis_requested"
  | "proposal_approved"
  | "revision_requested"
  | "proposal_rejected"
  | "implementation_approved"
  | "implementation_rejected"
  | "archived";

export interface UpgradeTask {
  id: string;
  title: string;
  requestText: string;
  normalizedGoal: string;
  acceptanceCriteriaJson: string;
  area: string;
  priority: UpgradePriority;
  source: UpgradeSource;
  originCommandLogId: string | null;
  contextJson: string;
  platform: UpgradePlatform;
  appVersion: string | null;
  status: UpgradeTaskStatus;
  providerPolicy: UpgradeProviderPolicy;
  latestRunId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface UpgradeRun {
  id: string;
  taskId: string;
  stage: UpgradeRunStage;
  provider: UpgradeRunProvider;
  status: UpgradeRunStatus;
  suggestionSummary: string | null;
  recommendedAction: string | null;
  alternativesJson: string;
  risksJson: string;
  affectedFilesJson: string;
  testPlanJson: string;
  providerRunId: string | null;
  githubRunId: string | null;
  branchName: string | null;
  prUrl: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface UpgradeEvent {
  id: string;
  taskId: string;
  runId: string | null;
  eventType: UpgradeEventType;
  actor: "user" | "system" | "coordinator";
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateUpgradeTaskInput {
  requestText: string;
  title?: string;
  normalizedGoal?: string;
  acceptanceCriteria?: string[];
  area?: string;
  priority?: UpgradePriority;
  source?: UpgradeSource;
  originCommandLogId?: string | null;
  context?: Record<string, unknown>;
  platform?: UpgradePlatform;
  appVersion?: string | null;
  providerPolicy?: UpgradeProviderPolicy;
}

export interface UpdateUpgradeTaskInput {
  title?: string;
  normalizedGoal?: string;
  acceptanceCriteria?: string[];
  area?: string;
  priority?: UpgradePriority;
  providerPolicy?: UpgradeProviderPolicy;
}

export interface UpgradeTaskFilters {
  includeArchived?: boolean;
  status?: UpgradeTaskStatus | "all";
  query?: string;
}
