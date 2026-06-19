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
  /run.*(my )?(daily )?job (extraction|hunter)/i,
  /kick ?off.*job.?hunter/i,
  /fire.*(the )?job.?hunter/i,
  /start.*job.?hunter/i,
  /trigger.*(my )?(daily )?job (extraction|hunter)/i,
];

export function isJobExtractionCommand(command: string): boolean {
  return JOB_EXTRACTION_PATTERNS.some((pattern) => pattern.test(command));
}
