import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { KrishnaChakraOrb, type ChakraOrbState } from "@/components/KrishnaChakraOrb";
import "@/pages/presence/presence.css";

export default function PresenceOverlay() {
  const [state, setState] = useState<ChakraOrbState>("idle");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unlisten = listen<{ state: ChakraOrbState }>("presence-state", (event) => {
      setState(event.payload.state);
      setVisible(true);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div
      className="presence-root"
      data-visible={visible}
    >
      <KrishnaChakraOrb state={state} size={320} />
    </div>
  );
}
