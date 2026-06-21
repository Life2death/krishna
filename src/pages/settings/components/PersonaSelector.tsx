import { useSystemPrompts } from "@/hooks";
import { Header } from "@/components";
import { UserIcon } from "lucide-react";

interface Persona {
  id: number;
  name: string;
  label: string;
  description: string;
  prompt: string;
}

const PERSONA_META: Record<string, { label: string; description: string }> = {
  "persona:default": {
    label: "Default",
    description: "Versatile general-purpose assistant",
  },
  "persona:coder": {
    label: "Coder",
    description: "Specialized in software engineering and code",
  },
  "persona:researcher": {
    label: "Researcher",
    description: "Analytical, structured research and analysis",
  },
  "persona:planner": {
    label: "Planner",
    description: "Task planning and project organization",
  },
};

export function PersonaSelector() {
  const { prompts, selectedPromptId, handleSelectPrompt } = useSystemPrompts();

  const personas: Persona[] = prompts
    .filter((p) => p.name.startsWith("persona:"))
    .map((p) => {
      const meta = PERSONA_META[p.name] ?? {
        label: p.name.replace("persona:", ""),
        description: "Custom persona",
      };
      return { ...p, ...meta };
    });

  const customPrompts = prompts.filter((p) => !p.name.startsWith("persona:"));

  return (
    <div>
      <Header
        title="Persona"
        description="Choose how Krishna behaves and responds"
        isMainTitle
      />

      <div className="grid grid-cols-2 gap-3 mt-4">
        {personas.map((persona) => (
          <button
            key={persona.id}
            onClick={() => handleSelectPrompt(persona.id)}
            className={`flex items-start gap-3 rounded-lg border p-4 text-left text-sm transition-colors hover:bg-accent ${
              selectedPromptId === persona.id
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border"
            }`}
          >
            <UserIcon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium">{persona.label}</div>
              <div className="text-muted-foreground mt-0.5">
                {persona.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      {customPrompts.length > 0 && (
        <div className="mt-6">
          <Header
            title="Custom Prompts"
            description="Your saved custom system prompts"
            isMainTitle
          />
          <div className="space-y-2 mt-3">
            {customPrompts.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPrompt(p.id)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent ${
                  selectedPromptId === p.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border"
                }`}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-muted-foreground mt-0.5 truncate">
                  {p.prompt.slice(0, 120)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
