/**
 * AI/detector.js — nhận diện lời gọi AI.
 * Gọi hợp lệ khi:
 *  - có cụm "ai ơi" / "phát ơi" (không phân biệt hoa-thường, có/không dấu) đứng như một lời gọi;
 *  - hoặc tin nhắn BẮT ĐẦU bằng "AI" viết hoa toàn bộ, hoặc "ai" + dấu , : ; ! ? hoặc chỉ có mỗi chữ "ai".
 * "ai" nằm giữa câu ("hôm nay ai đi chơi?", "Ai biết không?") KHÔNG phải lời gọi.
 */
import { norm } from "./textUtils.js";

const ENDERS = "[,.:;!?\\s]";
// "<từ gọi> ơi" ở đầu câu hoặc cuối câu (đã bỏ dấu)
const VOCATIVE_HEAD = /^(?:@\S+\s+)?(?:ai|phat|bot ai|phat ai)\s+oi\b[\s,.:;!?-]*/;
const VOCATIVE_TAIL = /[,.\s]+(?:ai|phat|phat ai)\s+oi[\s.!?]*$/;
const VOCATIVE_MID = /(?:^|[\s,.;!?])(?:ai|phat)\s+oi(?=[\s,.:;!?]|$)/;

/** @returns {{called:boolean, via?:string, content:string}} content = nội dung đã bỏ phần gọi */
export function detectCall(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { called: false, content: "" };
  // loại @mention đầu câu khi so khớp (nhưng giữ nội dung gốc để cắt)
  const n = norm(raw);

  let m = n.match(VOCATIVE_HEAD);
  if (m) return { called: true, via: "vocative", content: cutHead(raw, m[0]) };

  const mt = n.match(VOCATIVE_TAIL);
  if (mt) return { called: true, via: "vocative-tail", content: raw.slice(0, Math.max(0, raw.length - mt[0].length)).trim() };

  // "AI" viết hoa toàn bộ ở đầu câu: "AI giúp tôi...", "AI, ...", "AI:"
  const head = raw.match(/^(?:@\S+\s+)?AI(?=$|[\s,.:;!?])[\s,.:;!?]*/);
  if (head && /^(?:@\S+\s+)?AI/.test(raw)) return { called: true, via: "AI", content: raw.slice(head[0].length).trim() };

  // "ai" thường: chỉ khi có dấu ngắt ngay sau ("ai, ..."), hoặc chỉ có đúng chữ "ai"
  const soft = raw.match(/^(?:@\S+\s+)?[Aa]i(?:[,:;!]+\s*|\s*$)/);
  if (soft && !/^(?:@\S+\s+)?Ai\s+\S/.test(raw)) return { called: true, via: "ai-soft", content: raw.slice(soft[0].length).trim() };

  if (VOCATIVE_MID.test(n)) {
    const idx = n.search(/(?:ai|phat)\s+oi/);
    // cắt đúng đoạn gọi trong chuỗi gốc theo vị trí chữ (chuẩn hóa giữ nguyên độ dài ký tự cơ sở)
    const content = stripAt(raw, idx);
    return { called: true, via: "vocative-mid", content };
  }
  return { called: false, content: raw };
}
function cutHead(raw, matchedNorm) {
  // matchedNorm dài bằng số ký tự gốc tương ứng (NFD bỏ dấu giữ số ký tự nền) — dùng regex trực tiếp trên bản gốc cho chắc
  const m = raw.match(/^(?:@\S+\s+)?(?:\S+(?:\s+\S+)?)\s+[oOơƠ]i\b[\s,.:;!?-]*/u) || raw.match(/^\S+\s+\S+[\s,.:;!?-]*/);
  return (m ? raw.slice(m[0].length) : raw.slice(matchedNorm.length)).trim();
}
function stripAt(raw, idx) {
  const left = raw.slice(0, Math.max(0, idx)).trim();
  const rest = raw.slice(Math.max(0, idx)).replace(/^\S+\s+\S+[\s,.:;!?-]*/u, "").trim();
  return [left, rest].filter(Boolean).join(" ").trim();
}
export const CALL_EXAMPLES = ["ai ơi", "AI ơi", "phát ơi", "phat oi", "AI, ...", "AI ..."];
