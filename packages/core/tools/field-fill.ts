import type { CdpClient } from "./cdp-client";

export interface FormFieldInfo {
  tag: string;
  type: string;
  name: string;
  id: string;
  label: string;
  ariaLabel: string;
  placeholder: string;
  required: boolean;
  selector: string;
}

export interface MappedField {
  field: FormFieldInfo;
  profileKey: string;
  profileValue: string;
  displayName: string;
}

export interface FillFormResult {
  filled: MappedField[];
  unmappedRequired: FormFieldInfo[];
  fileInputFound: boolean;
}

export interface FillProfile {
  fullName: string;
  email: string;
  phone: string;
  currentLocation: string;
  noticePeriod: string;
  currentCtc: string;
  expectedCtc: string;
  yearsOfExperience: string;
  resumePath: string;
  linkedInUrl: string;
  whyThisRole: string;
  relocationOk: boolean;
}

const PROFILE_LABELS: Record<keyof FillProfile, string> = {
  fullName: "Full name",
  email: "Email",
  phone: "Phone",
  currentLocation: "Current location",
  noticePeriod: "Notice period",
  currentCtc: "Current CTC",
  expectedCtc: "Expected CTC",
  yearsOfExperience: "Years of experience",
  resumePath: "Resume path",
  linkedInUrl: "LinkedIn URL",
  whyThisRole: "Why this role",
  relocationOk: "Relocation ok",
};

const REQUIRED_FIELDS: Array<keyof FillProfile> = [
  "fullName", "email", "phone", "currentLocation", "noticePeriod",
  "currentCtc", "expectedCtc", "yearsOfExperience", "linkedInUrl",
];

const FIELD_PATTERNS: Array<{ key: keyof FillProfile; patterns: RegExp[] }> = [
  { key: "fullName", patterns: [/full\s*name/i, /^name$/i, /your\s*name/i, /applicant\s*name/i] },
  { key: "email", patterns: [/e[\s-]?mail/i, /email\s*address/i] },
  { key: "phone", patterns: [/^phone/i, /mobile/i, /contact\s*(no|number)/i, /phone\s*number/i] },
  { key: "currentLocation", patterns: [/current\s*location/i, /^location$/i, /^city$/i] },
  { key: "noticePeriod", patterns: [/notice\s*period/i, /^notice\s*$/i] },
  { key: "currentCtc", patterns: [/current\s*(ctc|salary|compensation)/i] },
  { key: "expectedCtc", patterns: [/expected\s*(ctc|salary)/i, /desired\s*salary/i, /expected\s*compensation/i] },
  { key: "yearsOfExperience", patterns: [/years?\s*of?\s*experience/i, /total\s*experience/i, /^experience$/i, /years?\s*exp/i] },
  { key: "resumePath", patterns: [/resume/i, /cv/i] },
  { key: "linkedInUrl", patterns: [/linkedin/i] },
  { key: "whyThisRole", patterns: [/why\s*(this\s*)?role/i, /cover\s*letter/i] },
  { key: "relocationOk", patterns: [/relocat/i] },
];

function matchLabel(text: string): keyof FillProfile | null {
  if (!text) return null;
  for (const { key, patterns } of FIELD_PATTERNS) {
    for (const re of patterns) {
      if (re.test(text)) return key;
    }
  }
  return null;
}

export function mapFields(
  fields: FormFieldInfo[],
  profile: FillProfile,
): FillFormResult {
  const usedKeys = new Set<string>();
  const filled: MappedField[] = [];
  const fileInputFound = fields.some((f) => f.tag === "input" && f.type === "file");

  for (const field of fields) {
    if (field.tag === "input" && field.type === "file") continue;

    const candidates = [field.label, field.ariaLabel, field.placeholder, field.name, field.id]
      .map((s) => s || "")
      .filter(Boolean);

    let matchedKey: keyof FillProfile | null = null;
    for (const c of candidates) {
      matchedKey = matchLabel(c);
      if (matchedKey) break;
    }
    if (!matchedKey) continue;

    const profileValue = String(profile[matchedKey] ?? "");

    if (!profileValue || usedKeys.has(matchedKey)) continue;
    usedKeys.add(matchedKey);
    filled.push({
      field,
      profileKey: matchedKey,
      profileValue,
      displayName: PROFILE_LABELS[matchedKey],
    });
  }

  const unmappedRequired: FormFieldInfo[] = [];
  for (const req of REQUIRED_FIELDS) {
    if (!usedKeys.has(req)) {
      const profileValue = String(profile[req] ?? "");
      if (profileValue) continue;
      const matchingFields = fields.filter((f) => {
        if (f.tag === "input" && f.type === "file") return false;
        const candidates = [f.label, f.ariaLabel, f.placeholder, f.name, f.id]
          .map((s) => s || "").filter(Boolean);
        return candidates.some((c) => matchLabel(c));
      });
      if (matchingFields.length > 0) {
        unmappedRequired.push(...matchingFields);
      }
    }
  }

  return { filled, unmappedRequired, fileInputFound };
}

export const ENUMERATION_JS = [
  "(() => {",
  "  const fields = [];",
  "  const els = document.querySelectorAll('input, select, textarea');",
  "  function getLabel(el) {",
  "    let label = '';",
  "    const ariaLabel = el.getAttribute('aria-label');",
  "    if (ariaLabel) return ariaLabel;",
  "    if (el.id) {",
  "      const lbl = document.querySelector('label[for=\"' + CSS.escape(el.id) + '\"]');",
  "      if (lbl) label = (lbl.textContent || '').trim();",
  "    }",
  "    if (!label) {",
  "      const parent = el.closest('label');",
  "      if (parent) label = (parent.textContent || '').trim();",
  "    }",
  "    return label;",
  "  }",
  "  function buildSelector(el) {",
  "    if (el.id) return '#' + CSS.escape(el.id);",
  "    const name = el.getAttribute('name');",
  "    const tag = el.tagName.toLowerCase();",
  "    if (name) return tag + '[name=\"' + name.replace(/\"/g, '\\\\\"') + '\"]';",
  "    const parent = el.parentElement;",
  "    if (parent) {",
  "      const idx = Array.from(parent.querySelectorAll(tag)).indexOf(el) + 1;",
  "      return tag + ':nth-child(' + idx + ')';",
  "    }",
  "    return tag;",
  "  }",
  "  for (const el of els) {",
  "    const tag = el.tagName.toLowerCase();",
  "    if (tag === 'input' && (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'reset')) continue;",
  "    fields.push({",
  "      tag: tag,",
  "      type: el.getAttribute('type') || 'text',",
  "      name: el.getAttribute('name') || '',",
  "      id: el.id || '',",
  "      label: getLabel(el),",
  "      ariaLabel: el.getAttribute('aria-label') || '',",
  "      placeholder: el.getAttribute('placeholder') || '',",
  "      required: el.required || el.hasAttribute('aria-required') || false,",
  "      selector: buildSelector(el),",
  "    });",
  "  }",
  "  return JSON.stringify(fields);",
  "})()",
].join("\n");

export function makeFillJs(fields: MappedField[]): string {
  const assignments = fields.map((mf) => {
    const sel = mf.field.selector;
    const val = mf.profileValue.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return { sel, val, tag: mf.field.tag };
  });

  const lines = [
    "(() => {",
    "  const results = {};",
  ];
  for (const a of assignments) {
    if (a.tag === "select") {
      lines.push(
        `  (() => {`,
        `    const el = document.querySelector('${a.sel}');`,
        `    if (!el) { results['${a.sel}'] = false; return; }`,
        `    const opts = Array.from(el.options);`,
        `    const m = opts.find(o => o.text.toLowerCase().includes('${a.val}'.toLowerCase()) || o.value.toLowerCase() === '${a.val}'.toLowerCase());`,
        `    if (m) el.value = m.value; else if (opts.length) el.value = opts[0].value;`,
        `    el.dispatchEvent(new Event('change', { bubbles: true }));`,
        `    results['${a.sel}'] = true;`,
        `  })();`,
      );
    } else {
      lines.push(
        `  (() => {`,
        `    const el = document.querySelector('${a.sel}');`,
        `    if (!el) { results['${a.sel}'] = false; return; }`,
        `    const proto = el.tagName.toLowerCase() === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;`,
        `    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;`,
        `    setter.call(el, '${a.val}');`,
        `    el.dispatchEvent(new Event('input', { bubbles: true }));`,
        `    el.dispatchEvent(new Event('change', { bubbles: true }));`,
        `    results['${a.sel}'] = true;`,
        `  })();`,
      );
    }
  }
  lines.push("  return JSON.stringify(results);", "})()");
  return lines.join("\n");
}

export async function enumerateFormFields(cdp: CdpClient): Promise<FormFieldInfo[]> {
  const raw = await cdp.evaluate<string>(ENUMERATION_JS);
  return JSON.parse(raw) as FormFieldInfo[];
}

export async function fillForm(cdp: CdpClient, profile: FillProfile): Promise<FillFormResult> {
  const fields = await enumerateFormFields(cdp);
  const mapping = mapFields(fields, profile);

  if (mapping.filled.length > 0) {
    const fillJs = makeFillJs(mapping.filled);
    const raw = await cdp.evaluate<string>(fillJs);
    JSON.parse(raw);
  }

  return mapping;
}

export function filledSummary(result: FillFormResult): string {
  const filledCount = result.filled.length;
  const parts: string[] = [];
  parts.push(`filled ${filledCount} field${filledCount !== 1 ? "s" : ""}`);

  if (result.fileInputFound) {
    parts.push("found a file-upload field");
  }

  if (result.unmappedRequired.length > 0) {
    const names = result.unmappedRequired.map((f) => {
      const c = [f.label, f.ariaLabel, f.placeholder, f.name].filter(Boolean);
      return c[0] || f.selector;
    });
    const uniq = [...new Set(names)];
    parts.push(`could not map ${uniq.length} required field${uniq.length !== 1 ? "s" : ""}: ${uniq.join(", ")}`);
  }

  return parts.join("; ") + ".";
}
