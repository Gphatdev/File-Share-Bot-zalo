/**
 * AI/config.js — cấu hình DUY NHẤT của tính năng AI (Groq).
 *
 * Đặt GROQ_API_KEY trong file .env (không lưu khóa trong source code).
 */
export const GROQ_API_KEY = "";

export const AI_SETTINGS = {
  botName: "Phát AI",

  // ── Groq (endpoint tương thích OpenAI) ──
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  // Model production hiện hành của Groq. `llama-3.3-70b-versatile` đã bị Groq ngừng từ 16/08/2026 nên KHÔNG dùng.
  // Đổi model ở ĐÂY (hoặc biến môi trường GROQ_MODEL), không cần sửa file khác.
  model: "openai/gpt-oss-120b",
  fallbackModels: ["openai/gpt-oss-20b"],   // tự thử lần lượt nếu model chính báo ngừng/không có
  summaryModel: "openai/gpt-oss-20b",       // model rẻ dùng để tóm tắt hội thoại / tinh chỉnh hồ sơ phong cách
  temperature: 0.7,
  maxTokens: 900,          // giới hạn token đầu ra (chat thường; gpt-oss tính cả token suy luận)
  codeMaxTokens: 2200,     // chế độ AI CODE
  timeoutMs: 30000,
  retries: 2,              // số lần thử lại tối đa (rate limit / lỗi 5xx / mạng)
  maxRetryWaitMs: 6000,

  // ── Giới hạn / kiểm soát chi phí ──
  maxInputChars: 1500,     // cắt tin nhắn người dùng
  maxHistory: 10,          // số tin lịch sử gửi kèm mỗi request
  storeHistory: 40,        // số tin lưu mỗi cuộc trò chuyện (vượt → tóm tắt phần cũ)
  maxSummaryChars: 900,
  maxReplyChars: 3800,     // trần độ dài khi ở chế độ AI CODE
  conciseReplyChars: 600,  // trần độ dài khi trò chuyện thường (AI trả lời gọn; cắt ở cuối câu)
  chunkChars: 1800,        // tách tin nhắn dài thành nhiều phần khi gửi
  userCooldownMs: 4000,
  groupPerMinute: 14,
  userPerDay: 80,
  groupPerDay: 500,
  maxConcurrent: 3,
  queueMax: 8,

  // ── Mặc định cho nhóm mới ──
  aiDefaultEnabled: false,   // nhóm mới KHÔNG tự bật AI
  aiDefaultLearning: false,
  privateForEveryone: false, // true = ai cũng dùng được AI trong tin nhắn riêng; false = chỉ Owner/Admin bot
  allowGroupAdminTrain: false, // true = quản trị viên nhóm cũng được bật học; false = chỉ Owner/Admin bot/trainerIds
  trainerIds: [],            // UID được cấp quyền huấn luyện thêm (ngoài Owner/Admin bot)

  // ── Học phong cách ──
  learnMinSamples: 30,       // dưới ngưỡng này vẫn dùng phong cách mặc định
  learnFullSamples: 200,     // đạt ngưỡng này → bắt chước đầy đủ (ở giữa là pha trộn dần)
  learnRefineEvery: 80,      // mỗi N mẫu mới nhờ Groq viết lại phần ghi chú phong cách (chỉ gửi số liệu tổng hợp)
  learnRefine: true,
  staffWeight: 2,            // tin nhắn của Owner/Admin được tính trọng số cao hơn
  maxMembersTracked: 40,
  maxPhrases: 30,
  maxPhraseCounters: 500,
};

export function getApiKey() {
  return String(process.env.GROQ_API_KEY || "").trim();
}
export function getModel() { return String(process.env.GROQ_MODEL || "").trim() || AI_SETTINGS.model; }
export function hasApiKey() { return !!getApiKey(); }
