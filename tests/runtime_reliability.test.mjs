import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

process.env.CONSOLE_CHAT = "off";

const { createCommandRouter } = await import("../Handlers/HandleCommandRouter.js");
const { createZcaAdapter } = await import("../App/ZcaAdapter.js");
const { renderTerminalQr } = await import("../App/Session.js");
const { animateConsoleLines } = await import("../Utils/ConsoleUI.js");
const QRCode = (await import("qrcode")).default;
const jsQR = (await import("jsqr")).default;

function createRouterHarness() {
  const executed = [];
  const replies = [];
  const reacted = [];
  const command = (name, role = 0) => ({
    name,
    role,
    cooldown: 0,
    async run({ args, message }) {
      executed.push({ name, args, uid: message.data.uidFrom });
    },
  });
  const bot = {
    logger: { error() {}, info() {}, warn() {} },
    config: { botPrefix: "!" },
    commands: new Map([
      ["probe", command("probe")],
      ["secure", command("secure", 2)],
    ]),
    aliases: new Map([["p", "probe"]]),
    backgroundHooks: [],
    commandGuards: [],
    isOwner: (uid) => uid === "owner",
    isBotAdmin: (uid) => uid === "admin",
    isSupport: (uid) => uid === "support",
    isOnCooldown: () => 0,
    db: { query() { return []; } },
    adapter: {
      async getGroupAdmins() {
        return { creatorId: "group-owner", adminIds: ["group-admin"] };
      },
      async reactToMessage(message, icon) {
        reacted.push({ message, icon });
        return true;
      },
      async sendText(params) {
        replies.push(params.text);
      },
    },
  };
  const router = createCommandRouter(bot);
  const message = (uid, content) => ({
    threadId: "group-1",
    type: 1,
    isSelf: false,
    data: { uidFrom: uid, content },
  });
  return { router, executed, replies, reacted, message };
}

test("prefix-free commands are restricted to bot owners and admins", async () => {
  const h = createRouterHarness();
  await h.router.handleMessage(h.message("owner", "probe hello"));
  await h.router.handleMessage(h.message("admin", "p alias"));
  await h.router.handleMessage(h.message("support", "probe"));
  await h.router.handleMessage(h.message("group-admin", "probe"));
  await h.router.handleMessage(h.message("member", "probe"));

  assert.deepEqual(
    h.executed.map(({ uid }) => uid),
    ["owner", "admin"],
  );
  assert.deepEqual(h.executed[1].args, ["alias"]);
  assert.equal(h.replies.length, 0);
  assert.equal(h.reacted.length, 2);
  assert.ok(h.reacted.every(({ message, icon }) =>
    ["owner", "admin"].includes(message.data.uidFrom) && typeof icon === "string"
  ));
});

test("members still use prefix and command role checks remain enforced", async () => {
  const h = createRouterHarness();
  await h.router.handleMessage(h.message("member", "!probe hello"));
  await h.router.handleMessage(h.message("group-admin", "!secure"));
  await h.router.handleMessage(h.message("admin", "secure"));

  assert.deepEqual(
    h.executed.map(({ uid }) => uid),
    ["member", "admin"],
  );
  assert.equal(h.replies.length, 1);
  assert.match(h.replies[0], /ACCESS DENIED/);
  assert.equal(h.reacted.length, 2);
  assert.ok(h.reacted.every(({ message }) =>
    ["member", "admin"].includes(message.data.uidFrom)
  ));
});

test("terminal QR rendering preserves the supplied image matrix without writing a QR file", async () => {
  const payload = "test-login-payload";
  const image = await QRCode.toBuffer(payload, { width: 400, margin: 4 });
  const qr = await renderTerminalQr(image.toString("base64"), payload);
  assert.ok(qr.includes("██"));
  const lines = qr.split("\n");
  const size = lines.length;
  assert.ok(size >= 25);
  const pixels = new Uint8ClampedArray(size * size * 4);
  lines.forEach((line, y) => {
    for (let x = 0; x < size; x += 1) {
      const black = line.slice(x * 2, x * 2 + 2) === "██";
      const offset = (y * size + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = black ? 0 : 255;
      pixels[offset + 3] = 255;
    }
  });
  assert.equal(jsQR(pixels, size, size)?.data, payload);
});

test("console animation reveals lines in order and supports non-interactive output", async () => {
  const output = [];
  await animateConsoleLines(["banner", "ready"], {
    enabled: true,
    delayMs: 0,
    write: (line) => output.push(line),
  });
  assert.deepEqual(output, ["banner", "ready"]);

  output.length = 0;
  await animateConsoleLines(["plain", "output"], {
    enabled: false,
    write: (line) => output.push(line),
  });
  assert.deepEqual(output, ["plain", "output"]);
});

test("listener can restart after the library exhausts its close-code retries", async () => {
  const listener = new EventEmitter();
  let startCount = 0;
  listener.start = () => {
    startCount += 1;
    listener.ws = {};
  };
  listener.stop = () => {
    listener.ws = null;
  };

  const adapter = createZcaAdapter({ listener }, { info() {}, warn() {}, error() {} });
  adapter.startListener({
    onClosed: () => adapter.restartListener(),
  });
  try {
    listener.emit("closed", 1006, "network lost");
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.equal(startCount, 2);
  } finally {
    adapter.stopListener();
  }
});

test("adapter sends reactions with the original Zalo message identifiers", async () => {
  let reactionCall = null;
  const listener = new EventEmitter();
  const adapter = createZcaAdapter({
    listener,
    addReaction: async (...args) => { reactionCall = args; },
  }, { info() {}, warn() {}, error() {} });
  const message = {
    type: 1,
    threadId: "group-42",
    data: { msgId: "123", cliMsgId: "456" },
  };
  const result = await adapter.reactToMessage(message, "like");
  assert.equal(result, true);
  assert.equal(reactionCall[0], "like");
  assert.deepEqual(reactionCall[1], {
    data: { msgId: "123", cliMsgId: "456" },
    threadId: "group-42",
    type: 1,
  });
  assert.equal(
    await adapter.reactToMessage({ ...message, data: {} }, "like"),
    false,
  );
});
