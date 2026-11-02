// Captura de página completa en tamaño celular (Chrome headless + CDP).
// Uso: node tools/shot-full.mjs <url> <out.png> [jsAEvaluar] [width] [height]
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

let [, , url, out, js = '', W = '390', H = '844'] = process.argv;
if (js.startsWith('file:')) js = readFileSync(js.slice(5), 'utf8');
const PORT = 9500 + Math.floor(Math.random() * 300);
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const width = Number(W), height = Number(H);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP}\\cdp-full-${PORT}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find((x) => x.type === 'page');
      if (t?.webSocketDebuggerUrl) return t.webSocketDebuggerUrl;
    } catch { /* aún arrancando */ }
    await sleep(300);
  }
  throw new Error('CDP no disponible');
}

const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) events.push(msg.method);
};
const send = (method, params = {}) => new Promise((res) => {
  const myId = ++id; pending.set(myId, res);
  ws.send(JSON.stringify({ id: myId, method, params }));
});

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.navigate', { url });
for (let i = 0; i < 80; i++) { if (events.includes('Page.loadEventFired')) break; await sleep(200); }
await sleep(2500);

if (js) {
  const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
  console.log('EVAL ' + JSON.stringify(r.result));
  await sleep(1200);
}

const heightRes = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true });
const fullH = Math.min(Number(heightRes.result.result.value) || height, 6000);
const shot = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: 0, width, height: fullH, scale: 2 },
});
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(`OK ${out} (${width}x${fullH})`);
ws.close();
proc.kill();
process.exit(0);
