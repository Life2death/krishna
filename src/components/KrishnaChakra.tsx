import { cn } from "@/lib/utils";

export type ChakraState = "idle" | "listening" | "processing" | "speaking";

interface KrishnaChakraProps {
  /** Voice-pipeline state — drives the spin speed + aura via CSS (see global.css). */
  state?: ChakraState;
  /** Rendered size in px (square). Defaults to 22 — sized for the toolbar button. */
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Sudarshan Chakra — Krishna's animated voice indicator.
 *
 * The disc spins (speed varies by `state`); `listening` adds a counter-rotating
 * dashed halo and `speaking` adds a pulsing aura. All animation is pure CSS,
 * keyed off the `data-state` attribute (see the `.krishna-chakra` rules in
 * `global.css`). Colors inherit the theme gold via `currentColor`.
 */
export function KrishnaChakra({
  state = "idle",
  size = 22,
  className,
  title,
}: KrishnaChakraProps) {
  return (
    <span
      className={cn("krishna-chakra", className)}
      data-state={state}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title ?? `Krishna ${state}`}
      title={title}
    >
      {state === "speaking" && (
        <>
          <svg className="krishna-chakra__aura" viewBox="-90 -90 180 180" width="100%" height="100%" aria-hidden="true">
            <circle r="68" fill="currentColor" fillOpacity="0.14" />
          </svg>
          <svg className="krishna-chakra__aura krishna-chakra__aura--delay" viewBox="-90 -90 180 180" width="100%" height="100%" aria-hidden="true">
            <circle r="68" fill="currentColor" fillOpacity="0.14" />
          </svg>
        </>
      )}

      {state === "listening" && (
        <svg className="krishna-chakra__halo" viewBox="-90 -90 180 180" width="100%" height="100%" aria-hidden="true">
          <circle r="84" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.5" strokeDasharray="4 7" />
        </svg>
      )}

      <svg className="krishna-chakra__disc" viewBox="-90 -90 180 180" width="100%" height="100%" aria-hidden="true">
        {/* serrated flame rim */}
        <polygon
          points="72,0 57.96,15.53 62.35,36 42.43,42.43 36,62.35 15.53,57.96 0,72 -15.53,57.96 -36,62.35 -42.43,42.43 -62.35,36 -57.96,15.53 -72,0 -57.96,-15.53 -62.35,-36 -42.43,-42.43 -36,-62.35 -15.53,-57.96 0,-72 15.53,-57.96 36,-62.35 42.43,-42.43 62.35,-36 57.96,-15.53"
          fill="currentColor"
          fillOpacity="0.14"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* rings */}
        <circle r="60" fill="none" stroke="currentColor" strokeWidth="3.5" />
        <circle r="30" fill="none" stroke="currentColor" strokeWidth="2.5" />
        {/* stud dots */}
        <circle cx="52" cy="0" r="3.4" fill="currentColor" />
        <circle cx="45.03" cy="26" r="3.4" fill="currentColor" />
        <circle cx="26" cy="45.03" r="3.4" fill="currentColor" />
        <circle cx="0" cy="52" r="3.4" fill="currentColor" />
        <circle cx="-26" cy="45.03" r="3.4" fill="currentColor" />
        <circle cx="-45.03" cy="26" r="3.4" fill="currentColor" />
        <circle cx="-52" cy="0" r="3.4" fill="currentColor" />
        <circle cx="-45.03" cy="-26" r="3.4" fill="currentColor" />
        <circle cx="-26" cy="-45.03" r="3.4" fill="currentColor" />
        <circle cx="0" cy="-52" r="3.4" fill="currentColor" />
        <circle cx="26" cy="-45.03" r="3.4" fill="currentColor" />
        <circle cx="45.03" cy="-26" r="3.4" fill="currentColor" />
        {/* spokes */}
        <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="0" x2="48" y2="0" />
          <line x1="8.49" y1="8.49" x2="33.94" y2="33.94" />
          <line x1="0" y1="12" x2="0" y2="48" />
          <line x1="-8.49" y1="8.49" x2="-33.94" y2="33.94" />
          <line x1="-12" y1="0" x2="-48" y2="0" />
          <line x1="-8.49" y1="-8.49" x2="-33.94" y2="-33.94" />
          <line x1="0" y1="-12" x2="0" y2="-48" />
          <line x1="8.49" y1="-8.49" x2="33.94" y2="-33.94" />
        </g>
        {/* hub */}
        <circle r="11" fill="currentColor" />
      </svg>
    </span>
  );
}
