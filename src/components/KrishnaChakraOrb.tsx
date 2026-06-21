import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type ChakraOrbState = "idle" | "listening" | "processing" | "speaking";

const SPIN_RATE: Record<ChakraOrbState, number> = {
  idle: 1.0,
  listening: 1.6,
  processing: 2.3,
  speaking: 2.8,
};

interface Props {
  state?: ChakraOrbState;
  size?: number;
  className?: string;
}

export function KrishnaChakraOrb({ state = "idle", size = 320, className }: Props) {
  const discRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<Animation | null>(null);

  useEffect(() => {
    const el = discRef.current;
    if (!el) return;
    if (typeof el.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animRef.current = el.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: 14000, iterations: Infinity, easing: "linear" }
    );
    return () => animRef.current?.cancel();
  }, []);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;
    const target = SPIN_RATE[state];
    const start = anim.playbackRate;
    const t0 = performance.now();
    const DUR = 600;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR);
      anim.playbackRate = start + (target - start) * p;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <div
      className={cn("krishna-chakra-orb", className)}
      data-state={state}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Krishna ${state}`}
    >
      <div className="kco-backdrop" />
      <div className="kco-glow" />
      <div className="kco-halo" />
      <div className="kco-aura" />
      <div className="kco-aura kco-aura--d2" />
      <div className="kco-disc" ref={discRef}>
        <svg viewBox="-90 -90 180 180" width="100%" height="100%" aria-hidden="true">
          <polygon
            points="72,0 57.96,15.53 62.35,36 42.43,42.43 36,62.35 15.53,57.96 0,72 -15.53,57.96 -36,62.35 -42.43,42.43 -62.35,36 -57.96,15.53 -72,0 -57.96,-15.53 -62.35,-36 -42.43,-42.43 -36,-62.35 -15.53,-57.96 0,-72 15.53,-57.96 36,-62.35 42.43,-42.43 62.35,-36 57.96,-15.53"
            fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <circle r="60" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <circle r="30" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="52" cy="0" r="3.4" fill="currentColor" /><circle cx="45.03" cy="26" r="3.4" fill="currentColor" /><circle cx="26" cy="45.03" r="3.4" fill="currentColor" /><circle cx="0" cy="52" r="3.4" fill="currentColor" /><circle cx="-26" cy="45.03" r="3.4" fill="currentColor" /><circle cx="-45.03" cy="26" r="3.4" fill="currentColor" /><circle cx="-52" cy="0" r="3.4" fill="currentColor" /><circle cx="-45.03" cy="-26" r="3.4" fill="currentColor" /><circle cx="-26" cy="-45.03" r="3.4" fill="currentColor" /><circle cx="0" cy="-52" r="3.4" fill="currentColor" /><circle cx="26" cy="-45.03" r="3.4" fill="currentColor" /><circle cx="45.03" cy="-26" r="3.4" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="0" x2="48" y2="0" /><line x1="8.49" y1="8.49" x2="33.94" y2="33.94" /><line x1="0" y1="12" x2="0" y2="48" /><line x1="-8.49" y1="8.49" x2="-33.94" y2="33.94" /><line x1="-12" y1="0" x2="-48" y2="0" /><line x1="-8.49" y1="-8.49" x2="-33.94" y2="-33.94" /><line x1="0" y1="-12" x2="0" y2="-48" /><line x1="8.49" y1="-8.49" x2="33.94" y2="-33.94" />
          </g>
          <circle r="11" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}
