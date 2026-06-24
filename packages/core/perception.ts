const LOOK_PATTERNS = [
  /what('s| is) on( my)? screen/i,
  /what is this/i,
  /read the screen/i,
  /summarize this/i,
  /what app/i,
  /look(ing)? at/i,
  /what are we (looking|seeing)/i,
  /what('s| is) on your screen/i,
];

export function isLookCommand(command: string): boolean {
  return LOOK_PATTERNS.some((pattern) => pattern.test(command));
}

const UNDO_PATTERNS = [
  /^undo that$/i,
  /^undo it$/i,
  /^undo the last thing$/i,
  /^undo$/i,
  /^reverse that$/i,
];

export function isUndoCommand(command: string): boolean {
  return UNDO_PATTERNS.some((pattern) => pattern.test(command.trim()));
}

const JOB_EXTRACTION_PATTERNS = [
  // One tolerant rule instead of many brittle ones: a run-verb, then "job", then any
  // of extraction/hunter/pipeline — in that order with anything in between. Covers
  // "run my daily job extraction", "execute my job extraction pipeline on github",
  // "kick off the job hunter", "start the daily job pipeline", etc. Status queries are
  // matched separately (and checked first in routing), so this never steals them.
  /\b(run|execute|start|kick ?off|trigger|launch|fire|begin)\b.*\bjob\b.*\b(extraction|hunter|pipeline)\b/i,
];

export function isJobExtractionCommand(command: string): boolean {
  return JOB_EXTRACTION_PATTERNS.some((pattern) => pattern.test(command));
}

// Status queries about the job pipeline/extraction run. Checked BEFORE the trigger
// patterns in routing so "pipeline status" never accidentally fires a new run.
const JOB_STATUS_PATTERNS = [
  /(job|daily|pipeline|extraction|hunter).{0,20}(status|finished?|done|completed?|succeed|success|fail|running)/i,
  /(status|how('s| is| are)|did|has|is)\b.{0,25}(job|pipeline|extraction|hunter)/i,
  /pipeline status/i,
];

export function isJobStatusCommand(command: string): boolean {
  return JOB_STATUS_PATTERNS.some((pattern) => pattern.test(command));
}
