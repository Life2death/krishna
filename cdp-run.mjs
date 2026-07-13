import WebSocket from "ws";
import http from "node:http";

const EXPR = process.argv[2];

function getJSON(path) {
  return new Promise((res, rej) => {
    const req = http.get({ host: "127.0.0.1", port: 9222, path, headers: { Host: "localhost" }, timeout: 5000 }, (r) => {
      let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(new Error("badjson:" + d.length)); } });
    });
    req.on("timeout", () => { req.destroy(); rej(new Error("getJSON timeout")); });
    req.on("error", rej);
  });
}

function evalOn(wsUrl, expression, awaitPromise) {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    const send = (method, params = {}) => new Promise((r) => { const m = ++id; pending.set(m, r); ws.send(JSON.stringify({ id: m, method, params })); });
    const to = setTimeout(() => { try { ws.close(); } catch {} resolve({ timeout: true }); }, 25000);
    ws.on("message", (data) => { const m = JSON.parse(data.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    ws.on("open", async () => {
      await send("Runtime.enable");
      const r = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
      clearTimeout(to); try { ws.close(); } catch {}
      resolve(r.result?.value !== undefined ? { value: r.result.value } : { raw: r.result, exc: r.exceptionDetails });
    });
    ws.on("error", (e) => { clearTimeout(to); resolve({ error: e.message }); });
  });
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
let target = null;
for (let round = 0; round < 12 && !target; round++) {
  let list = [];
  try { list = await getJSON("/json/list"); } catch (e) { console.log("list err:", e.message); await sleep(2000); continue; }
  const pages = list.filter((p) => p.type === "page");
  for (const p of pages) {
    const probe = await evalOn(p.webSocketDebuggerUrl, "!!(window.__TAURI_INTERNALS__&&window.__TAURI_INTERNALS__.invoke)", false);
    if (probe.value === true) { target = p; break; }
  }
  if (!target) { console.log(`round ${round}: ${pages.length} pages, no internals yet`); await sleep(2000); }
}
if (!target) { console.log("NO PAGE WITH INTERNALS after retries"); process.exit(3); }
console.log("invoking on:", target.url);
const out = await evalOn(target.webSocketDebuggerUrl, EXPR, true);
console.log("RESULT:", JSON.stringify(out));
process.exit(0);
