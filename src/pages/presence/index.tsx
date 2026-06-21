import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { KrishnaOrb, type OrbState } from "@/components/KrishnaOrb";
import "./presence.css";

export default function Presence() {
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
    <div className="presence-root" data-visible={visible}>
      <KrishnaOrb state={state} size={320} />
    </div>
  );
}
