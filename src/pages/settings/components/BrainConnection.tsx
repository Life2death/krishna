import { Header } from "@/components";

export const BrainConnection = () => {
  return (
    <div id="brain-connection" className="space-y-3">
      <Header
        title="Brain Connection"
        description="Krishna runs in local mode — all data is stored on-device."
        isMainTitle
      />

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="font-medium">Local mode</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Chat goes directly to your AI provider. Memories, conversations, and
          skills live in the local SQLite database. No Node brain process needed.
        </p>
        <p className="text-xs text-muted-foreground">
          Cloud sync, voice-ID, Gmail, and MCP tools are not available in local
          mode in this release. Configure an AI provider in the AI Provider
          section to start chatting.
        </p>
      </div>
    </div>
  );
};
