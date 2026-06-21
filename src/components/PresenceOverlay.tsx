import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { KrishnaOrb, type OrbState } from "@/components/KrishnaOrb";

export default function PresenceOverlay() {
  const [state, setState] = useState<OrbState>("idle");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unlisten = listen<{ state: OrbState }>("presence-state", (event) => {
      setState(event.payload.state);
      setVisible(true);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease, transform 0.4s ease",
        transform: visible ? "scale(1)" : "scale(0.7)",
      }}
    >
      <KrishnaOrb state={state} size={320} />
    </div>
  );
}
