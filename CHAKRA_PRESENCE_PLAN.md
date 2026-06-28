# Plan — Chakra-in-Orb presence overlay (replace the plain orb with the animated Sudarshan Chakra)

> **For the implementing agent.** The presence overlay currently shows a plain golden orb
> (`KrishnaOrb`). The user wants the **Sudarshan Chakra** back as the presence visual, but with the
> orb's *smooth, always-moving* quality — not the old version that snapped between discrete states.
> This was prototyped and approved in a live preview. The design below is final; build it faithfully.

## The core technique (why it's smooth)

The old chakra changed its **spin duration** per state, which jumps the rotation. The fix:

- The chakra disc spins **continuously**. Spin *speed* varies by state, but we ramp it smoothly with
  the **Web Animations API** (`animation.playbackRate`) instead of swapping CSS `animation-duration`
  — so it never hitches.
- Everything else (gold **glow**, **breathe**, **dashed halo**, **aura rings**) is driven by CSS
  custom properties with `transition`, so state changes fade smoothly over ~0.6s. One animation per
  layer always runs; state only changes intensity.

## States (from the `presence-state` Tauri event — already wired)

`idle | listening | processing | speaking` — unchanged. Per-state values:

| state | glow opacity | halo (dashed) | aura rings | spin rate | breathe |
|---|---|---|---|---|---|
| idle | 0.30 | off | off | 1.0× (slow) | calm |
| listening | 0.55 | **on** (counter-rotating) | off | ~1.6× | medium |
| processing | 0.48 | off | off | ~2.3× | fast |
| speaking | 0.72 | off | **on** (pulse outward) | ~2.8× | fastest |

---

## Step 1 — New component `src/components/KrishnaChakraOrb.tsx`

Combines the existing chakra SVG geometry (from `KrishnaChakra.tsx`) with the orb's glow layers.
The SVG inherits gold via `currentColor` (the wrapper sets `color`).

```tsx
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

  // One continuous rotation, created once. State changes only ramp playbackRate
  // (Web Animations API) — smooth speed change, no rotation jump.
  useEffect(() => {
    const el = discRef.current;
    if (!el) return;
    if (typeof el.animate !== "function") return; // graceful no-op if unsupported
    animRef.current = el.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: 14000, iterations: Infinity, easing: "linear" }
    );
    return () => animRef.current?.cancel();
  }, []);

  // Smoothly ramp spin speed when state changes.
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
```

## Step 2 — CSS in `src/pages/presence/presence.css` (append)

Gold is hardcoded (this is a physical-color glow scene, must NOT invert in dark mode). The
`kco-backdrop` is a **localized** soft-dark radial so the gold reads over any desktop wallpaper —
it fades to transparent well before the window edge, so it does not dim the whole screen.

```css
.krishna-chakra-orb {
  --glow-op: .30; --halo-op: 0; --aura-op: 0;
  position: relative; display: flex; align-items: center; justify-content: center;
  color: #e8c45e;
}
.kco-backdrop {
  position: absolute; width: 170%; height: 170%; border-radius: 50%;
  background: radial-gradient(circle, rgba(20,16,9,.55) 0%, rgba(20,16,9,.30) 40%, transparent 70%);
  pointer-events: none;
}
.kco-glow {
  position: absolute; width: 100%; height: 100%; border-radius: 50%;
  background: radial-gradient(circle, rgba(240,217,140,.9) 0%, rgba(212,175,55,.35) 38%, transparent 70%);
  opacity: var(--glow-op);
  animation: kco-breathe 3.6s ease-in-out infinite;
  transition: opacity .6s ease;
}
.kco-halo {
  position: absolute; width: 96%; height: 96%; border-radius: 50%;
  border: 2px dashed rgba(240,217,140,.55);
  opacity: var(--halo-op); transition: opacity .6s ease;
  animation: kco-rev 9s linear infinite;
}
.kco-aura {
  position: absolute; width: 78%; height: 78%; border-radius: 50%;
  border: 2px solid rgba(232,196,94,.6);
  opacity: var(--aura-op); transition: opacity .6s ease;
  animation: kco-aura 1.7s ease-out infinite;
}
.kco-aura--d2 { animation-delay: .85s; }
.kco-disc {
  position: relative; width: 62%; height: 62%;
  filter: drop-shadow(0 0 6px rgba(212,175,55,.45));
}

.krishna-chakra-orb[data-state="idle"]       { --glow-op:.30; --halo-op:0; --aura-op:0; }
.krishna-chakra-orb[data-state="listening"]  { --glow-op:.55; --halo-op:1; --aura-op:0; }
.krishna-chakra-orb[data-state="processing"] { --glow-op:.48; --halo-op:0; --aura-op:0; }
.krishna-chakra-orb[data-state="speaking"]   { --glow-op:.72; --halo-op:0; --aura-op:1; }

@keyframes kco-spin   { to { transform: rotate(360deg); } }
@keyframes kco-rev    { to { transform: rotate(-360deg); } }
@keyframes kco-breathe{ 0%,100% { transform: scale(.94); } 50% { transform: scale(1.10); } }
@keyframes kco-aura   { 0% { transform: scale(.82); opacity: var(--aura-op); } 100% { transform: scale(1.4); opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  .kco-glow, .kco-halo, .kco-aura { animation: none !important; }
  /* disc rotation is WAAPI — also guard it: see Step 1 note */
}
```

> **Reduced-motion for the disc:** since the disc spin uses the Web Animations API (not CSS), the
> `@media` block can't stop it. In `KrishnaChakraOrb.tsx`, before creating the rotation, check
> `window.matchMedia("(prefers-reduced-motion: reduce)").matches` and skip `el.animate(...)` if true
> (the chakra then sits static but still visible — glow/halo/aura already disabled by the CSS block).

## Step 3 — Swap the presence overlay to use it

`src/pages/presence/index.tsx`:
```tsx
// was: import { KrishnaOrb, type OrbState } from "@/components/KrishnaOrb";
import { KrishnaChakraOrb, type ChakraOrbState } from "@/components/KrishnaChakraOrb";
// ...
const [state, setState] = useState<ChakraOrbState>("idle");
// ...
// was: <KrishnaOrb state={state} size={320} />
<KrishnaChakraOrb state={state} size={320} />
```
Keep the existing `presence-state` listener and the `data-visible` fade — unchanged.

## Step 4 — Export + cleanup

- Export `KrishnaChakraOrb` from `src/components/index.ts`.
- `KrishnaOrb` is now unused by the presence page. **Leave it in place** unless a quick grep
  (`grep -rn "KrishnaOrb" src/`) shows it has no other importers — if it's fully unused, delete
  `src/components/KrishnaOrb.tsx` and its export to avoid dead code. Do NOT touch `KrishnaChakra.tsx`
  (the small toolbar indicator) — that stays as-is.

---

## Verify

1. `npm run tauri dev` → trigger Krishna. The presence overlay shows the **gold Sudarshan Chakra**
   spinning inside a breathing glow (not the plain orb).
2. Speak → speed ramps up smoothly (no rotation hitch), aura rings pulse. Listening → dashed halo
   fades in. Idle → settles back smoothly over ~0.6s.
3. The gold reads clearly even over a bright desktop wallpaper (the localized backdrop).
4. OS "reduce motion" on → chakra is static, glow/halo/aura still render, nothing spins.
5. `npm run typecheck` + `npm run build` green.

## Out of scope
- The toolbar `KrishnaChakra` (small indicator) — unchanged.
- Theme tokens, presence window capability, the `presence-state` emit logic — all already correct.
