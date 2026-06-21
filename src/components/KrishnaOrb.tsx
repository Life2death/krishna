import { cn } from "@/lib/utils";

export type OrbState = "idle" | "listening" | "processing" | "speaking";

interface KrishnaOrbProps {
  state?: OrbState;
  size?: number;
  className?: string;
}

export function KrishnaOrb({ state = "idle", size = 320, className }: KrishnaOrbProps) {
  return (
    <div
      className={cn("krishna-orb", className)}
      data-state={state}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Krishna ${state}`}
    >
      <div className="krishna-orb__ring krishna-orb__ring--outer" />
      <div className="krishna-orb__ring krishna-orb__ring--mid" />
      <div className="krishna-orb__core" />
    </div>
  );
}
