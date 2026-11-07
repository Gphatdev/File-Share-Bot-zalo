import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createZcaAdapter } from "../App/ZcaAdapter.js";
import {
  addAdminGmail,
  getAdminGmails,
  isValidAdminGmail,
  removeAdminGmail,
} from "../Core/Commands/data/HETHONG/Rent/adminGmail.js";
import { applyBotName, getConfiguredBotName } from "../Utils/Branding.js";

test("admin email addresses are persisted, deduplicated, migrated, and removable", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rent-admin-gmail-"));
  const filePath = path.join(directory, "admin_gmail.json");
  try {
    assert.deepEqual(await getAdminGmails({ filePath }), []);
    assert.equal(isValidAdminGmail("admin@example.com"), true);
    assert.equal(isValidAdminGmail("not-an-email"), false);

    const first = await addAdminGmail(" Admin@Example.com ", { filePath });
    assert.equal(first.added, true);
    const duplicate = await addAdminGmail("admin@example.com", { filePath });
    assert.equal(duplicate.added, false);

    const migrated = await getAdminGmails({
      filePath,
      legacyEmail: "old-admin@example.com",
    });
    assert.deepEqual(migrated, ["admin@example.com", "old-admin@example.com"]);

    const stored = JSON.parse(await fs.readFile(filePath, "utf8"));
    assert.deepEqual(stored.emails, migrated);

    const removed = await removeAdminGmail("ADMIN@example.com", { filePath });
    assert.equal(removed.removed, true);
    assert.deepEqual(removed.emails, ["old-admin@example.com"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("configured bot name replaces known legacy brands in outgoing text", async () => {
  assert.equal(
    applyBotName("HNNP STUDIO · HNHANN STUDIO · NKNP STUDIO", "TEN BOT"),
    "TEN BOT · TEN BOT · TEN BOT",
  );
  assert.equal(
    applyBotName("HNNP STUDIO", "HNNP STUDIO"),
    "HNNP STUDIO",
  );

  let sentMessage;
  const api = {
    async sendMessage(message, threadId, type) {
      sentMessage = { message, threadId, type };
      return {};
    },
  };
  const adapter = createZcaAdapter(
    api,
    { error() {} },
    { botName: "TEN BOT" },
  );
  await adapter.sendText({
    threadId: "group-1",
    text: "Chào mừng đến HNNP STUDIO",
  });
  assert.equal(sentMessage.message, "Chào mừng đến TEN BOT");

  await api.sendMessage({ msg: "HNNP STUDIO hỗ trợ bạn", attachments: "image.png" }, "group-1", 1);
  assert.deepEqual(sentMessage.message, {
    msg: "TEN BOT hỗ trợ bạn",
    attachments: "image.png",
  });
});

test("canvas branding reads the configured bot name at render time", () => {
  const previousBot = globalThis.__NKNP_BOT__;
  const previousConfig = globalThis.config;
  try {
    globalThis.__NKNP_BOT__ = { config: { botName: "TEN MOI" } };
    globalThis.config = { studioName: "TEN CU" };
    assert.equal(getConfiguredBotName(), "TEN MOI");

    delete globalThis.__NKNP_BOT__;
    assert.equal(getConfiguredBotName(), "TEN CU");
  } finally {
    if (previousBot === undefined) delete globalThis.__NKNP_BOT__;
    else globalThis.__NKNP_BOT__ = previousBot;
    if (previousConfig === undefined) delete globalThis.config;
    else globalThis.config = previousConfig;
  }
});
