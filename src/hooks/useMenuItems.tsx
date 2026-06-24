import {
  Settings,
  Code,
  WandSparkles,
  AudioLinesIcon,
  SquareSlashIcon,
  MonitorIcon,
  HomeIcon,
  PowerIcon,
  MailIcon,
  BugIcon,
  BarChart3Icon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useApp } from "@/contexts";
import { GithubIcon } from "@/components";

export const useMenuItems = () => {
  const { hasActiveLicense } = useApp();

  const menu: {
    icon: React.ElementType;
    label: string;
    href: string;
    count?: number;
  }[] = [
    {
      icon: HomeIcon,
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      icon: BarChart3Icon,
      label: "Status",
      href: "/status",
    },
    {
      icon: WandSparkles,
      label: "System prompts",
      href: "/system-prompts",
    },
    {
      icon: Settings,
      label: "App Settings",
      href: "/settings",
    },
    {
      icon: MonitorIcon,
      label: "Screenshot",
      href: "/screenshot",
    },
    {
      icon: AudioLinesIcon,
      label: "Audio",
      href: "/audio",
    },
    {
      icon: SquareSlashIcon,
      label: "Cursor & Shortcuts",
      href: "/shortcuts",
    },

    {
      icon: Code,
      label: "Dev space",
      href: "/dev-space",
    },
  ];

  const footerItems = [
    ...(hasActiveLicense
      ? [
          {
            icon: MailIcon,
            label: "Contact Support",
            href: "https://github.com/Life2death/krishna/issues",
          },
        ]
      : []),
    {
      icon: BugIcon,
      label: "Report a bug",
      href: "https://github.com/Life2death/krishna/issues/new?template=bug-report.yml",
    },
    {
      icon: PowerIcon,
      label: "Quit Krishna",
      action: async () => {
        await invoke("exit_app");
      },
    },
  ];

  const footerLinks: {
    title: string;
    icon: React.ElementType;
    link: string;
  }[] = [
    {
      title: "GitHub",
      icon: GithubIcon,
      link: "https://github.com/Life2death/krishna",
    },
  ];

  return {
    menu,
    footerItems,
    footerLinks,
  };
};
