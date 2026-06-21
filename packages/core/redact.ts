/**
 * PII / secret detection and redaction.
 *
 * Pattern-based redaction for common secrets and PII.
 * Designed to run locally (no API call) before content leaves the brain.
 */

type RedactionRule = {
  name: string;
  pattern: RegExp;
  replacement: string;
};

const RULES: RedactionRule[] = [
  { name: "api-key", pattern: /(?:(?:api[_-]?key|apikey|secret|token|password|passwd|pwd)\s*[:=]\s*['"]?)([A-Za-z0-9_\-+=/]{16,})['"]?/gi, replacement: "$1[REDACTED]" },
  { name: "bearer-token", pattern: /(Bearer\s+)[A-Za-z0-9_\-+=/]{20,}/g, replacement: "$1[REDACTED]" },
  { name: "anthropic-key", pattern: /(sk-ant-[A-Za-z0-9]{20,})/g, replacement: "[REDACTED_API_KEY]" },
  { name: "openai-key", pattern: /(sk-[A-Za-z0-9]{20,})/g, replacement: "[REDACTED_API_KEY]" },
  { name: "generic-key", pattern: /(?:^|\s)([A-Za-z0-9_\-]{32,})(?:\s|$)/g, replacement: " [REDACTED_KEY] " },
  { name: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[REDACTED_EMAIL]" },
  { name: "phone", pattern: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[REDACTED_PHONE]" },
  { name: "ssn", pattern: /\b\d{3}[-]\d{2}[-]\d{4}\b/g, replacement: "[REDACTED_SSN]" },
  { name: "credit-card", pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g, replacement: "[REDACTED_CC]" },
  { name: "ip-address", pattern: /\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, replacement: "[REDACTED_IP]" },
];

export interface RedactResult {
  text: string;
  redacted: string[];
}

export function redactText(text: string): RedactResult {
  const redacted: string[] = [];
  let result = text;

  for (const rule of RULES) {
    const matches = result.match(rule.pattern);
    if (matches) {
      redacted.push(rule.name);
    }
    result = result.replace(rule.pattern, rule.replacement);
  }

  return { text: result, redacted: [...new Set(redacted)] };
}

export function containsSecrets(text: string): boolean {
  return RULES.some((rule) => rule.pattern.test(text));
}
