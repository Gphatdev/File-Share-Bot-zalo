/**
 * AI/groqClient.js — gọi Groq (endpoint tương thích OpenAI) bằng fetch có sẵn của Node 18+.
 * Timeout, retry có giới hạn (429 / 5xx / lỗi mạng), tự chuyển model dự phòng khi model chính bị ngừng,
 * không bao giờ ghi API key vào log hoặc thông báo lỗi.
 */
import { AI_SETTINGS, getApiKey, getModel } from "./config.js";
import { redactSecrets } from "./textUtils.js";

export class AIError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = "AIError"; this.code = code; Object.assign(this, extra); }
}
/** Câu báo lỗi NGẮN, an toàn để gửi vào nhóm. */
export function friendlyError(err) {
  switch (err?.code) {
    case "NO_KEY": return "AI chưa được cấu hình API key. Hãy nhờ Owner dán key Groq vào Core/Commands/data/AI/config.js.";
    case "AUTH": return "API key Groq không hợp lệ hoặc đã bị thu hồi. Hãy báo Owner kiểm tra lại.";
    case "RATE_LIMIT": return "AI đang bị giới hạn lượt gọi, bạn thử lại sau ít phút nhé.";
    case "QUOTA": return "AI đã hết hạn mức sử dụng hôm nay. Vui lòng thử lại sau.";
    case "TIMEOUT": return "AI phản hồi quá lâu, bạn thử lại giúp mình nhé.";
    case "NETWORK": return "Mình đang mất kết nối tới máy chủ AI, thử lại sau nhé.";
    case "MODEL": return "Model AI hiện không khả dụng. Hãy báo Owner đổi model trong config.";
    case "EMPTY": return "AI chưa nghĩ ra câu trả lời, bạn hỏi lại theo cách khác nhé.";
    default: return "AI gặp lỗi tạm thời, bạn thử lại sau nhé.";
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isGptOss = (m) => /^openai\/gpt-oss/i.test(m);

function cleanText(t) {
  return String(t ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "").trim();
}

/**
 * @param {{messages:Array, maxTokens?:number, temperature?:number, model?:string, fetchImpl?:Function, settings?:object, signal?:AbortSignal}} opts
 * @returns {Promise<{text:string, model:string, usage:object|null}>}
 */
export async function chatCompletion(opts) {
  const S = { ...AI_SETTINGS, ...(opts.settings || {}) };
  const key = opts.apiKey ?? getApiKey();
  if (!key) throw new AIError("NO_KEY", "Chưa cấu hình API key");
  const doFetch = opts.fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") throw new AIError("NETWORK", "Môi trường không có fetch");
  const models = [...new Set([opts.model || getModel(), ...(opts.model ? [] : S.fallbackModels || [])].filter(Boolean))];
  let lastErr = null;

  for (const model of models) {
    let extras = isGptOss(model);        // reasoning_effort / include_reasoning chỉ áp dụng cho gpt-oss
    let attempt = 0;
    while (attempt <= S.retries) {
      attempt += 1;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), S.timeoutMs);
      const onAbort = () => ctl.abort(); opts.signal?.addEventListener?.("abort", onAbort, { once: true });
      let res, body = null;
      try {
        const payload = { model, messages: opts.messages, temperature: opts.temperature ?? S.temperature, max_completion_tokens: opts.maxTokens ?? S.maxTokens, stream: false };
        if (extras) { payload.reasoning_effort = "low"; payload.include_reasoning = false; }
        res = await doFetch(S.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(payload), signal: ctl.signal });
        const raw = await res.text();
        try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      } catch (err) {
        clearTimeout(timer);
        if (opts.signal?.aborted) throw new AIError("ABORTED", "Đã hủy");
        lastErr = err?.name === "AbortError" ? new AIError("TIMEOUT", "Hết thời gian chờ Groq") : new AIError("NETWORK", redactSecrets(err?.message, key));
        if (attempt <= S.retries) { await sleep(Math.min(S.maxRetryWaitMs, 600 * attempt)); continue; }
        break;
      } finally { clearTimeout(timer); opts.signal?.removeEventListener?.("abort", onAbort); }

      const status = res.status;
      const apiMsg = redactSecrets(body?.error?.message || "", key);
      if (res.ok) {
        const text = cleanText(body?.choices?.[0]?.message?.content);
        if (text) return { text, model, usage: body?.usage || null };
        lastErr = new AIError("EMPTY", "Groq trả về nội dung rỗng");
        if (attempt <= 1) continue;               // thử lại 1 lần với phản hồi rỗng
        break;
      }
      if (status === 401 || status === 403) throw new AIError("AUTH", `Groq từ chối khóa (HTTP ${status})`);
      if (status === 429) {
        const quota = /quota|exceeded your|per day|TPD|RPD|billing/i.test(apiMsg);
        const ra = Number(res.headers?.get?.("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1200 * attempt;
        lastErr = new AIError(quota && wait > S.maxRetryWaitMs ? "QUOTA" : "RATE_LIMIT", `Groq 429 ${apiMsg}`.trim());
        if (wait > S.maxRetryWaitMs) break;       // chờ quá lâu → báo lỗi ngay, không treo hàng đợi
        if (attempt <= S.retries) { await sleep(wait); continue; }
        break;
      }
      if (status === 400 && extras && /reasoning|include_reasoning|unsupported|unknown/i.test(apiMsg)) { extras = false; attempt -= 1; continue; }
      if (status === 400 && /decommission|not supported|no longer/i.test(apiMsg) || status === 404) { lastErr = new AIError("MODEL", `Model ${model} không khả dụng: ${apiMsg}`); break; }
      if (status >= 500) { lastErr = new AIError("SERVER", `Groq lỗi ${status}`); if (attempt <= S.retries) { await sleep(Math.min(S.maxRetryWaitMs, 800 * attempt)); continue; } break; }
      lastErr = new AIError("BAD_REQUEST", `Groq ${status}: ${apiMsg}`.slice(0, 200));
      break;
    }
    if (lastErr?.code === "MODEL") continue;   // thử model dự phòng kế tiếp
    break;
  }
  throw lastErr || new AIError("UNKNOWN", "Lỗi không xác định");
}
