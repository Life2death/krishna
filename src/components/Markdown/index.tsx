import React from "react";
import { Streamdown } from "streamdown";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";

interface MarkdownRendererProps {
  children: string;
  isStreaming?: boolean;
}

/**
 * Strips dangerous HTML tags from AI-generated content before markdown rendering.
 * Prevents XSS via <script>, <iframe>, <object>, <embed>, etc.
 * Allows safe inline HTML that markdown renderers typically produce.
 */
function sanitizeAIOutput(text: string): string {
  return text.replace(
    /<\/?(script|iframe|object|embed|applet|frame|frameset|meta|link|style|base|form|input|select|option|textarea|button|label|svg|math|audio|video|source|track|canvas|marquee|isindex|xss)(\s[^>]*)?\/?>/gi,
    ""
  );
}

export function Markdown({
  children,
  isStreaming = false,
}: MarkdownRendererProps) {
  const safeContent = sanitizeAIOutput(children);

  return (
    <Streamdown
      isAnimating={isStreaming}
      shikiTheme={["github-light", "github-dark"]}
      components={COMPONENTS as any}
      controls={{
        table: true,
        code: true,
        mermaid: {
          download: true,
          copy: true,
          fullscreen: false,
          panZoom: false,
        },
      }}
    >
      {safeContent}
    </Streamdown>
  );
}

const COMPONENTS = {
  a: ({ children, href, ...props }: any) => {
    const handleClick = async (e: React.MouseEvent) => {
      e.preventDefault();
      if (href) {
        try {
          await openUrl(href);
        } catch (error) {
          console.error("Failed to open URL:", error);
        }
      }
    };

    return (
      <a
        href={href}
        className="text-gray-600 underline underline-offset-2 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100 cursor-pointer"
        onClick={handleClick}
        {...props}
      >
        {children}
      </a>
    );
  },
};
