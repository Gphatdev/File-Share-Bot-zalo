import { handleStkCommand, handleStkInput, extractImageUrl, deliverOutputs, helpOutputs } from "./data/GIAITRI/STK/index.js";

function makeSender(adapter, threadId, threadType) {
  return {
    text: (msg) => adapter.sendText({ threadId, threadType, text: msg }),
    image: (imagePath, caption) => adapter.sendImage({ threadId, threadType, imagePath, caption }),
  };
}

const SUBS = ["tao", "xem", "edit", "bank", "lichsu", "qr", "bankqr", "huy"];

export default {
  name: "vbank",
  description: "Ngân hàng ảo VBANK: tạo, xem, chỉnh sửa, chuyển tiền, lịch sử, QR, hủy thao tác",
  version: "2.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 2,
  aliases: [],
  noPrefix: false,

  // Giữ hội thoại nhiều bước (tao/edit/bankqr), gồm cả tin nhắn ảnh QR.
  async onMessage({ adapter, message, config }) {
    if (message?.isSelf) return;
    const senderId = message?.data?.uidFrom;
    if (!senderId || !message.threadId) return;

    const content = message?.data?.content;
    const textValue = typeof content === "string" ? content : "";
    const prefix = config?.botPrefix || "";
    if (textValue && prefix && textValue.trim().startsWith(prefix)) return; // để router xử lý lệnh

    const outputs = await handleStkInput({
      senderId: String(senderId),
      text: textValue,
      imageUrl: extractImageUrl(message.data),
      messageData: message.data, // để đọc số điện thoại từ DANH THIẾP
    });
    if (!outputs) return;
    const threadType = message.type === 1 ? "group" : "user";
    await deliverOutputs(outputs, makeSender(adapter, message.threadId, threadType));
  },

  async run({ adapter, message, args = [] }) {
    const threadType = message.type === 1 ? "group" : "user";
    const sender = makeSender(adapter, message.threadId, threadType);
    const sub = String(args[0] || "").toLowerCase();
    if (!SUBS.includes(sub)) return deliverOutputs(helpOutputs(), sender);
    const outputs = await handleStkCommand({
      sub,
      args: args.map((a, i) => (i === 0 ? sub : a)),
      senderId: String(message.data?.uidFrom),
      mention: message.data?.mentions?.[0],
      msgId: message.data?.msgId,
    });
    await deliverOutputs(outputs, sender);
  },
};
