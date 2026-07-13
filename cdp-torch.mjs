import WebSocket from "ws";

const WS = process.argv[2];
const EXPR = process.argv[3];
const ws = new WebSocket(WS);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
ws.on("open", async () => {
  await send("Runtime.enable");
  const r = await send("Runtime.evaluate", { expression: EXPR, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails || r.exceptionDetails) {
    console.log("EXCEPTION:", JSON.stringify(r.exceptionDetails?.exception?.description || r.exceptionDetails || r.result, null, 2));
  } else {
    console.log(JSON.stringify(r.result, null, 2));
  }
  ws.close();
  process.exit(0);
});
ws.on("error", (e) => { console.error("WS error:", e.message); process.exit(1); });
setTimeout(() => { console.error("timeout"); process.exit(2); }, 15000);
