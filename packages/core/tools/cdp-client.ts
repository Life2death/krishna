import { getHttpFetch } from "../http";

export interface CdpTarget {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type?: string;
}

export interface ApplyButtonResult {
  found: boolean;
  clicked?: boolean;
  text?: string;
  tag?: string;
  reason?: string;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class CdpClient {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, PendingCall>();
  private connected = false;
  private closeResolve: (() => void) | null = null;

  async listTargets(): Promise<CdpTarget[]> {
    const httpFetch = getHttpFetch();
    const res = await httpFetch("http://localhost:9222/json");
    if (!res.ok) {
      throw new Error(`Chrome DevTools returned ${res.status}`);
    }
    const all: CdpTarget[] = await res.json();
    return all.filter((t) => !t.type || t.type === "page");
  }

  async connect(wsUrl: string): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        this.ws = ws;
        this.connected = true;
        this.msgId = 0;
        this.pending.clear();
        resolve();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.id != null && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            if (msg.error) {
              p.reject(new Error(msg.error.message || "CDP error"));
            } else {
              p.resolve(msg.result);
            }
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        reject(new Error("WebSocket connection failed"));
      };

      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        for (const p of this.pending.values()) {
          p.reject(new Error("CDP session closed"));
        }
        this.pending.clear();
        if (this.closeResolve) {
          this.closeResolve();
          this.closeResolve = null;
        }
      };
    });
  }

  async send<T>(method: string, params?: object): Promise<T> {
    if (!this.ws || !this.connected) {
      throw new Error("CDP not connected");
    }

    const id = ++this.msgId;
    const msg = JSON.stringify({ id, method, params: params ?? {} });

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      try {
        this.ws!.send(msg);
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async navigate(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
  }

  async evaluate<T>(expr: string, awaitPromise = true): Promise<T> {
    const resp = await this.send<{
      result: { type: string; value?: T; description?: string; subtype?: string };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>("Runtime.evaluate", { expression: expr, awaitPromise, returnByValue: true });

    if (resp.exceptionDetails) {
      const detail = resp.exceptionDetails.text || resp.exceptionDetails.exception?.description || "Unknown error";
      throw new Error(`CDP evaluate error: ${detail}`);
    }
    return resp.result.value as T;
  }

  async clickApplyButton(): Promise<ApplyButtonResult> {
    const js = [
      "(() => {",
      "  const candidates = document.querySelectorAll('button, a');",
      "  let externalApply = null;",
      "  for (const el of candidates) {",
      "    const text = (el.textContent || '').trim();",
      "    const label = (el.getAttribute('aria-label') || '').trim();",
      "    const lowerText = text.toLowerCase();",
      "    const lowerLabel = label.toLowerCase();",
    "    if (/\\bapplied\\b/.test(lowerText) || /\\bapplied\\b/.test(lowerLabel) ||",
    "        /apply\\s*filter/.test(lowerText) || /filter\\s*apply/.test(lowerText) ||",
    "        /apply\\s*filter/.test(lowerLabel) || /filter\\s*apply/.test(lowerLabel)) continue;",
      "    if (/^\\s*easy\\s+apply\\b/i.test(text) || /^\\s*easy\\s+apply\\b/i.test(label)) {",
      "      el.click();",
      "      return JSON.stringify({ found: true, clicked: true, text: text, tag: el.tagName.toLowerCase() });",
      "    }",
      "    if (/\\bapply\\b/i.test(lowerText) || /\\bapply\\b/i.test(lowerLabel)) {",
      "      if (!externalApply) {",
      "        externalApply = { text: text, tag: el.tagName.toLowerCase() };",
      "      }",
      "    }",
      "  }",
      "  if (externalApply) {",
      '    return JSON.stringify({ found: true, clicked: false, reason: "external ATS apply — out of MVP scope" });',
      "  }",
      "  return JSON.stringify({ found: false });",
      "})()",
    ].join("\n");

    const result = await this.evaluate<string>(js);
    return JSON.parse(result) as ApplyButtonResult;
  }

  async disconnect(): Promise<void> {
    if (this.ws && this.connected) {
      return new Promise<void>((resolve) => {
        this.closeResolve = resolve;
        this.ws!.close();
      });
    }
    this.connected = false;
    this.ws = null;
  }
}
