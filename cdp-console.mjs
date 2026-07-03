import WebSocket from "ws";

const WS = process.argv[2];
const ws = new WebSocket(WS);
let id = 0;
const logs = [];
function send(method, params = {}) {
  return new Promise((res) => {
    const mid = ++id;
    const h = (data) => {
      const m = JSON.parse(data.toString());
      if (m.id === mid) { ws.off("message", h); res(m); }
    };
    ws.on("message", h);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.on("message", (data) => {
  const m = JSON.parse(data.toString());
  if (m.method === "Runtime.consoleAPICalled") {
    logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? a.unserializableValue ?? JSON.stringify(a.preview?.properties)).join(" "));
  }
  if (m.method === "Runtime.exceptionThrown") {
    const e = m.params.exceptionDetails;
    logs.push(`[EXCEPTION] ${e.exception?.description || e.text} @ ${e.url || ""}:${e.lineNumber}`);
  }
  if (m.method === "Log.entryAdded") {
    logs.push(`[log:${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url || ""}`);
  }
});
ws.on("open", async () => {
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Page.reload", { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 6000));
  const root = await send("Runtime.evaluate", {
    expression: "JSON.stringify({rootHtmlLen: (document.getElementById('root')?.innerHTML||'').length, bodyText: (document.body?.innerText||'').slice(0,200), url: location.href, title: document.title})",
    returnByValue: true,
  });
  console.log("=== DOM ===");
  console.log(root.result?.result?.value);
  console.log("=== CONSOLE (" + logs.length + ") ===");
  console.log(logs.slice(-40).join("\n"));
  ws.close();
  process.exit(0);
});
ws.on("error", (e) => { console.error("WS error:", e.message); process.exit(1); });
setTimeout(() => { console.error("timeout"); process.exit(2); }, 20000);
