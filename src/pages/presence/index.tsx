import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { KrishnaChakra, type ChakraState } from "@/components/KrishnaChakra";
import "./presence.css";

export default function Presence() {
  const [state, setState] = useState<ChakraState>("idle");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unlisten = listen<{ state: ChakraState }>("presence-state", (event) => {
      setState(event.payload.state);
      setVisible(true);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div className="presence-root" data-visible={visible}>
      <KrishnaChakra state={state} size={320} />
    </div>
  );
}
