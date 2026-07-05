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
  text?: string;
  tag?: string;
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
    const result = await this.send<{ type: string; value?: T; description?: string; subtype?: string }>(
      "Runtime.evaluate",
      { expression: expr, awaitPromise, returnByValue: true },
    );
    if (result.type === "object" && result.subtype === "error") {
      throw new Error(`CDP evaluate error: ${result.description}`);
    }
    return result.value as T;
  }

  async clickApplyButton(): Promise<ApplyButtonResult> {
    const js = `(() => {
      const candidates = document.querySelectorAll('button, a');
      for (const el of candidates) {
        const text = (el.textContent || '').trim().toLowerCase();
        const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
        if (/apply/i.test(text) || /apply/i.test(label)) {
          el.click();
          return JSON.stringify({ found: true, text: el.textContent?.trim() || '', tag: el.tagName.toLowerCase() });
        }
      }
      return JSON.stringify({ found: false });
    })()`;

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
