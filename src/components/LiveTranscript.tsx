import { useKrishna } from "@/hooks";
import { stripActionFences } from "@/lib/sentence-stream";

const statusLabels: Record<string, string> = {
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

// Live Voice runs outside the classic Krishna context, so the popover is fed a
// snapshot of the realtime session instead.
const liveStatusLabels: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Listening…",
  speaking: "Speaking…",
  offline: "Reconnecting…",
  error: "Connection error",
};

interface LiveTranscriptProps {
  override?: {
    status: string;
    userText?: string | null;
    assistantText?: string | null;
  };
}

export const LiveTranscript = ({ override }: LiveTranscriptProps = {}) => {
  const krishna = useKrishna();

  if (override) {
    const isLiveIdle = override.status === "idle";
    return (
      <div className="max-h-80 overflow-y-auto space-y-2">
        {!isLiveIdle && (
          <div className="px-3 py-1.5 border-b border-border/20">
            <span className="text-xs text-muted-foreground">
              {liveStatusLabels[override.status] || override.status}
              {override.status === "speaking" && (
                <span className="ml-1 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </span>
          </div>
        )}
        {override.userText && (
          <div className="px-3 py-1.5 flex items-start gap-2">
            <span className="text-xs font-medium text-primary mt-0.5 shrink-0">You</span>
            <p className="text-xs text-foreground">{override.userText}</p>
          </div>
        )}
        {override.assistantText && (
          <div className="px-3 py-1.5 flex items-start gap-2">
            <span className="text-xs font-medium text-green-600 mt-0.5 shrink-0">Krishna</span>
            <p className="text-xs text-foreground whitespace-pre-wrap break-words">
              {stripActionFences(override.assistantText)}
            </p>
          </div>
        )}
        {isLiveIdle && !override.assistantText && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            Start Live Voice and speak to see the transcript here.
          </div>
        )}
      </div>
    );
  }

  const isIdle = krishna.status === "idle";
  const isStreaming = krishna.status === "thinking" || krishna.status === "speaking";

  return (
    <div className="max-h-80 overflow-y-auto space-y-2">
      {/* Status line */}
      {!isIdle && (
        <div className="px-3 py-1.5 border-b border-border/20">
          <span className="text-xs text-muted-foreground">
            {statusLabels[krishna.status] || krishna.status}
            {krishna.status === "speaking" && (
              <span className="ml-1 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </span>
        </div>
      )}

      {/* You */}
      {krishna.pendingCommand && (
        <div className="px-3 py-1.5 flex items-start gap-2">
          <span className="text-xs font-medium text-primary mt-0.5 shrink-0">You</span>
          <p className="text-xs text-foreground">{krishna.pendingCommand}</p>
        </div>
      )}

      {/* Krishna reply */}
      <div className="px-3 py-1.5 flex items-start gap-2">
        <span className="text-xs font-medium text-green-600 mt-0.5 shrink-0">Krishna</span>
        <div className="flex-1 min-w-0">
          {isStreaming && krishna.streamingReply ? (
            <p className="text-xs text-foreground whitespace-pre-wrap break-words">
              {stripActionFences(krishna.streamingReply)}
              <span className="ml-0.5 inline-block h-3.5 w-[2px] bg-foreground animate-pulse" />
            </p>
          ) : isStreaming ? (
            <span className="text-xs text-muted-foreground">
              <span className="inline-block h-3.5 w-[2px] bg-foreground animate-pulse" />
            </span>
          ) : krishna.lastSpoken ? (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {stripActionFences(krishna.lastSpoken)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Empty state */}
      {isIdle && !krishna.lastSpoken && (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          Speak to see the transcript appear here.
        </div>
      )}
    </div>
  );
};
