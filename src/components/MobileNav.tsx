import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  MessageSquarePlus,
  BrainCircuit,
  Settings,
  MessageSquare,
} from "lucide-react";

const tabs = [
  { icon: MessageSquarePlus, label: "New Chat", href: "/", action: true },
  { icon: MessageSquare, label: "History", href: "/dashboard" },
  { icon: BrainCircuit, label: "Memories", href: "/mobile/memories" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export const MobileNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t bg-background pb-1 safe-area-bottom">
      {tabs.map((tab) => {
        const active = tab.href === "/"
          ? location.pathname === "/"
          : location.pathname.startsWith(tab.href);
        return (
          <button
            key={tab.href}
            onClick={() => navigate(tab.href)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-1 transition-colors",
              active
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <tab.icon className="size-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
