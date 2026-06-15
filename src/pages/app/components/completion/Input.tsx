import { useState, useCallback, useRef, useEffect } from "react";
import { Loader2, XIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  ScrollArea,
  Input as InputComponent,
  Markdown,
  CopyButton,
} from "@/components";
import { useKrishna } from "@/hooks";
import { MessageHistory } from "./MessageHistory";

export const Input = ({ isHidden }: { isHidden: boolean }) => {
  const krishna = useKrishna();
  const [input, setInput] = useState("");
  const [messageHistoryOpen, setMessageHistoryOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const isLoading = krishna.status === "thinking" || krishna.status === "speaking";

  useEffect(() => {
    const shouldBeOpen = krishna.lastError !== null || isLoading || krishna.lastSpoken.length > 0;
    setIsPopoverOpen(shouldBeOpen);
  }, [krishna.lastError, isLoading, krishna.lastSpoken]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = input.trim();
        if (!text || krishna.status !== "idle") return;
        setInput("");
        krishna.processCommand(text, { skipWakeWord: true });
      }
    },
    [input, krishna]
  );

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          await krishna.addFile(file);
        }
      }
    }
  }, [krishna]);

  return (
    <div className="relative flex-1">
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild className="!border-none !bg-transparent">
          <div className="relative select-none">
            <InputComponent
              ref={inputRef}
              placeholder="Ask me anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              onPaste={handlePaste}
              disabled={isLoading || isHidden}
              className={`${
                krishna.conversationHistory.length > 0
                  ? "pr-14"
                  : "pr-2"
              }`}
            />

            {/* Conversation thread indicator */}
            {krishna.conversationHistory.length > 0 && !isLoading && (
              <div className="absolute select-none right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <MessageHistory
                  conversationHistory={krishna.conversationHistory.flatMap(t => [
                    { id: t.id + "-user", role: "user" as const, content: t.userText, timestamp: t.timestamp },
                    { id: t.id + "-assistant", role: "assistant" as const, content: t.assistantText, timestamp: t.timestamp + 1 },
                  ])}
                  currentConversationId={null}
                  onStartNewConversation={krishna.clearActiveConversation}
                  messageHistoryOpen={messageHistoryOpen}
                  setMessageHistoryOpen={setMessageHistoryOpen}
                />
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </PopoverTrigger>

        {/* Response Panel */}
        <PopoverContent
          align="end"
          side="bottom"
          className="w-screen p-0 border shadow-lg overflow-hidden"
          sideOffset={8}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <div className="flex flex-row gap-1 items-center">
              <h3 className="font-semibold text-xs select-none">Krishna</h3>
              <div className="text-[10px] text-muted-foreground/70">
                (Use arrow keys to scroll)
              </div>
            </div>
            <div className="flex items-center gap-2 select-none">
              <CopyButton content={krishna.lastSpoken} />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setIsPopoverOpen(false)}
                className="cursor-pointer"
                title="Close"
              >
                <XIcon />
              </Button>
            </div>
          </div>

          <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-7rem)]">
            <div className="p-4 overflow-x-hidden">
              {krishna.lastError && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive break-words overflow-x-hidden">
                  <strong>Error:</strong> {krishna.lastError}
                </div>
              )}
              {isLoading && (
                <div className="flex items-center gap-2 my-4 text-muted-foreground animate-pulse select-none">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Processing...</span>
                </div>
              )}
              {krishna.lastSpoken && !isLoading && (
                <Markdown>{krishna.lastSpoken}</Markdown>
              )}

              {/* Conversation History */}
              {krishna.conversationHistory.length > 1 && (
                <div className="space-y-3 pt-3">
                  {krishna.conversationHistory.map((turn) => (
                    <div
                      key={turn.id}
                      className="p-3 rounded-lg text-sm bg-muted/50"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-muted-foreground">You</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(turn.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <Markdown>{turn.userText}</Markdown>
                      <div className="flex items-center gap-2 mt-3 mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase">Krishna</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(turn.timestamp + 1).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <Markdown>{turn.assistantText}</Markdown>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
};
