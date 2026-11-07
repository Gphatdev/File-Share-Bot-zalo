/**
 * Handlers/HandleLegacySystem.js
 *
 * Cơ chế "onReply" + "handleEvent" tương thích NKNP — song song với hệ thống
 * Handlers/* gốc của EMPHAT (không thay thế). Được gắn thêm (additive) vào
 * registerHandlers() trong Handlers/Core.js.
 *
 * - dispatchLegacyReply()  : tương đương core/handle/handleReply.js (NKNP)
 * - dispatchLegacyEvent()  : tương đương core/handle/handleEvent.js (NKNP)
 */

import { createQuotedApi } from "../App/ZcaAdapter.js";
import {
  legacyReplyStore,
  legacyEventStore,
  Users,
  Threads,
  buildReplyData,
} from "./HandleLegacyBridge.js";

function cleanMentions(body, mentions = []) {
  if (!body) return "";
  if (!Array.isArray(mentions) || mentions.length === 0) return body.trim();
  const sorted = [...mentions].sort((a, b) => b.pos - a.pos);
  let cleaned = body;
  for (const m of sorted) {
    if (typeof m.pos !== "number" || typeof m.len !== "number") continue;
    cleaned = cleaned.slice(0, m.pos) + cleaned.slice(m.pos + m.len);
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

function collectMessageIds(value, depth = 0, ids = new Set()) {
  if (!value || typeof value !== "object" || depth > 5) return ids;
  if (Array.isArray(value)) {
    for (const item of value) collectMessageIds(item, depth + 1, ids);
    return ids;
  }
  for (const key of ["globalMsgId", "cliMsgId", "msgId", "realMsgId"]) {
    if (value[key] != null && value[key] !== "") ids.add(String(value[key]));
  }
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object") collectMessageIds(nested, depth + 1, ids);
  }
  return ids;
}

/** Tương đương handleReply(event, api) của NKNP. */
async function dispatchLegacyReply(event, api, logger) {
  try {
    if (event?.isSelf) return;
    if (!event?.data || !event.data.quote) return;

    const quote = event.data.quote;
    const keys = [...collectMessageIds(quote)];
    if (!keys.length) return;

    let replyData = null;
    let replyKey = null;
    for (const key of keys) {
      if (legacyReplyStore.has(key)) {
        replyKey = key;
        replyData = legacyReplyStore.get(key);
        break;
      }
    }
    if (!replyData) return;

    const command = global.client?.commands?.get(replyData.name);
    if (!command) {
      legacyReplyStore.delete(replyKey);
      return;
    }
    if (
      replyData.author &&
      String(replyData.author) !== String(event.data.uidFrom) &&
      !replyData.allowOtherUsers
    ) return;
    if (typeof command.onReply !== "function") return;

    // KHÔNG sửa trực tiếp `event`: cùng object này còn đi tiếp vào router/guard.
    // Trước đây content bị ghi đè (xoá mention) nên tin nhắn reply có mention
    // sẽ bị router đọc sai nội dung. Ở đây chỉ truyền bản sao đã làm sạch.
    const cleanedEvent = {
      ...event,
      data: {
        ...event.data,
        content: cleanMentions(event.data.content || "", event.data.mentions || []),
      },
    };

    await command.onReply({
      api: createQuotedApi(api, cleanedEvent),
      event: cleanedEvent,
      Users,
      Threads,
      Reply: replyData,
    });
  } catch (err) {
    logger?.error?.("[HandleLegacySystem] Lỗi dispatchLegacyReply:", {
      message: err?.message,
      stack: err?.stack,
    });
  }
}

/** Chạy fn (sync hoặc async) và nuốt lỗi vào logger — lỗi đồng bộ cũng không thoát ra ngoài. */
function runSafely(label, fn, logger) {
  (async () => fn())().catch((err) =>
    logger?.error?.(label, { message: err?.message }),
  );
}

/** Tương đương handleEvent(eventType, eventData, api) của NKNP. */
function dispatchLegacyEvent(eventType, eventData, api, logger) {
  for (const [name, eventModule] of legacyEventStore) {
    const targetEvents = eventModule?.config?.event_type;
    if (!Array.isArray(targetEvents) || !targetEvents.includes(eventType)) continue;
    if (typeof eventModule.run !== "function") continue;

    runSafely(
      `[HandleLegacySystem] Lỗi event di sản '${name}' (${eventType}):`,
      () =>
        eventModule.run({
          api: createQuotedApi(api, eventData),
          event: eventData,
          eventType,
          Users,
          Threads,
          replyData: buildReplyData(eventData),
        }),
      logger,
    );
  }

  const commands = global.client?.commands;
  if (!commands) return;
  for (const [name, commandModule] of commands) {
    if (typeof commandModule.handleEvent !== "function") continue;

    runSafely(
      `[HandleLegacySystem] Lỗi handleEvent của lệnh '${name}' (${eventType}):`,
      () =>
        commandModule.handleEvent({
          api: createQuotedApi(api, eventData),
          event: eventData,
          eventType,
          Users,
          Threads,
          replyData: buildReplyData(eventData),
        }),
      logger,
    );
  }
}

/** Nạp 1 module event di sản (đã được adapt) vào registry. */
function registerLegacyEvent(eventModule) {
  if (!eventModule?.config?.name) return;
  legacyEventStore.set(eventModule.config.name, eventModule);
}

export { dispatchLegacyReply, dispatchLegacyEvent, registerLegacyEvent, cleanMentions };
