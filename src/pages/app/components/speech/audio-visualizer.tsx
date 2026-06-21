import { KrishnaChakra } from "@/components";

interface AudioVisualizerProps {
  isRecording: boolean;
  stream?: MediaStream | null;
}

/**
 * Voice activity indicator — the Sudarshan Chakra pulses while recording.
 *
 * (Replaces the earlier grayscale frequency-bar canvas. The chakra animation is
 * pure CSS, driven by the `state` prop — see components/KrishnaChakra.tsx.)
 */
export function AudioVisualizer({ isRecording }: AudioVisualizerProps) {
  return (
    <div className="flex h-[32px] w-full items-center justify-center">
      <KrishnaChakra state={isRecording ? "speaking" : "idle"} size={28} />
    </div>
  );
}
