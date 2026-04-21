import WebSocket from "ws";

const url = "ws://localhost:3000/api/voice/realtime";
const ws = new WebSocket(url);

ws.binaryType = "arraybuffer";

const results = [];
function log(...args) {
  const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  results.push(line);
  console.log(line);
}

ws.on("open", () => {
  log("client ws opened");
  ws.send(JSON.stringify({ type: "start_session" }));
});

ws.on("message", (data) => {
  if (typeof data === "string" || data instanceof Buffer) {
    const maybeStr = data.toString("utf-8");
    if (maybeStr.startsWith("{")) {
      log("server control msg:", maybeStr.slice(0, 200));
      return;
    }
  }
  if (data instanceof Buffer && data.length >= 8) {
    const eventType = data.readUInt32BE(4);
    log("server binary frame eventType=", eventType, "bytes=", data.length);
  } else {
    log("server msg bytes=", data.length ?? 0);
  }
});

ws.on("error", (e) => log("ws error:", e.message));
ws.on("close", (code, reason) => {
  log("ws closed", code, reason?.toString("utf-8"));
  process.exit(0);
});

// Close after 6s if still alive
setTimeout(() => {
  log("timeout, closing");
  ws.close();
}, 6000);
