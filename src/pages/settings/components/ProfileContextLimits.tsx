import { Header, Input } from "@/components";
import { ProfileContextSettings } from "@/lib";

interface ProfileContextLimitsProps {
  pending: ProfileContextSettings;
  onChange: (next: ProfileContextSettings) => void;
}

export const ProfileContextLimits = ({
  pending,
  onChange,
}: ProfileContextLimitsProps) => {
  const update = (key: keyof ProfileContextSettings, value: number) => {
    onChange({ ...pending, [key]: value });
  };

  return (
    <div id="profile-context" className="space-y-4">
      <Header
        title="Profile Context Limits"
        description="Control how much resume, job description, and document content is included as AI context during interview prep."
        isMainTitle
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NumberField
          label="Max Resume Chars"
          description="Resume text truncation limit"
          value={pending.maxResumeChars}
          onChange={(v) => update("maxResumeChars", v)}
        />
        <NumberField
          label="Max JD / Goals Chars"
          description="Job description truncation limit"
          value={pending.maxGoalsChars}
          onChange={(v) => update("maxGoalsChars", v)}
        />
        <NumberField
          label="Max Document Chars"
          description="Per custom document truncation limit"
          value={pending.maxDocChars}
          onChange={(v) => update("maxDocChars", v)}
        />
        <NumberField
          label="Max Context Chars"
          description="Total profile context cap"
          value={pending.maxContextChars}
          onChange={(v) => update("maxContextChars", v)}
        />
        <NumberField
          label="Max Ref Conv Chars"
          description="Per reference conversation truncation"
          value={pending.maxRefConvChars}
          onChange={(v) => update("maxRefConvChars", v)}
        />
        <NumberField
          label="Max Ref Conversations"
          description="Number of saved reference conversations to include"
          value={pending.maxRefConvs}
          onChange={(v) => update("maxRefConvs", v)}
        />
      </div>
    </div>
  );
};

function NumberField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Input
        type="number"
        min={100}
        max={50000}
        step={100}
        value={value}
        onChange={(e) => onChange(Math.max(100, parseInt(e.target.value) || 0))}
        className="h-10"
      />
    </div>
  );
}
