import WebSocket from "ws";
const WS = process.argv[2];
const EXPR = process.argv[3];
const ws = new WebSocket(WS);
let id = 0;
function send(method, params = {}) {
  return new Promise((res) => {
    const mid = ++id;
    const h = (d) => { const m = JSON.parse(d.toString()); if (m.id === mid) { ws.off("message", h); res(m); } };
    ws.on("message", h);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.on("open", async () => {
  await send("Runtime.enable");
  const r = await send("Runtime.evaluate", { expression: EXPR, returnByValue: true, awaitPromise: true });
  console.log(r.result?.result?.value ?? JSON.stringify(r.result?.exceptionDetails || r.result));
  ws.close(); process.exit(0);
});
ws.on("error", (e) => { console.error("WS err", e.message); process.exit(1); });
setTimeout(() => { console.error("timeout"); process.exit(2); }, 15000);
