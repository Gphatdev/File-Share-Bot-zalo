const LEGACY_BOT_NAMES = ["HNNP STUDIO", "HNHANN STUDIO", "NKNP STUDIO"];

export function getConfiguredBotName() {
  const name =
    globalThis.__NKNP_BOT__?.config?.botName ||
    globalThis.config?.studioName ||
    "HNNP STUDIO";
  return String(name).trim() || "HNNP STUDIO";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyBotName(text, botName) {
  if (typeof text !== "string") return text;
  const replacement = String(botName || "").trim();
  if (!replacement) return text;

  return LEGACY_BOT_NAMES.reduce((result, legacyName) => {
    if (legacyName.toLowerCase() === replacement.toLowerCase()) return result;
    return result.replace(new RegExp(escapeRegExp(legacyName), "gi"), replacement);
  }, text);
}

export function applyBotNameToMessage(message, botName) {
  if (typeof message === "string") return applyBotName(message, botName);
  if (!message || typeof message !== "object" || typeof message.msg !== "string") {
    return message;
  }
  const msg = applyBotName(message.msg, botName);
  return msg === message.msg ? message : { ...message, msg };
}
