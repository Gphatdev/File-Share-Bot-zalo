import { unlinkSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import http from "node:http";
import ShopService, {
  CATEGORIES,
  RARITIES,
  ITEM_SUBS,
  POTION_SUBS,
} from "../Services/ShopService.js";
import ShopRenderer from "../Services/ShopRenderer.js";
import { config as botConfig } from "../../App/Config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, "data", "temp");
const sessions = new Map();
const SESSION_TTL = 5 * 60 * 1000;
const PER_PAGE = 6;

function sk(uid, tid) {
  return `${uid}|${tid}`;
}
function setS(uid, tid, data) {
  sessions.set(sk(uid, tid), { ...data, expiresAt: Date.now() + SESSION_TTL });
}
function getS(uid, tid) {
  const d = sessions.get(sk(uid, tid));
  if (!d) return null;
  if (d.expiresAt < Date.now()) {
    sessions.delete(sk(uid, tid));
    return null;
  }
  return d;
}
function clearS(uid, tid) {
  sessions.delete(sk(uid, tid));
}

function uid(v) {
  return String(v ?? "").trim();
}

function isAdmin(id) {
  const c = uid(id);
  if (!c) return false;
  const owner = uid(botConfig?.ownerZaloId);
  const configured = Array.isArray(botConfig?.legacyAdminBot) ? botConfig.legacyAdminBot : [];
  const runtime = Array.isArray(global.users?.admin) ? global.users.admin : [];
  const yaml = Array.isArray(global.config?.admin_bot) ? global.config.admin_bot : [];
  const adminbot = Array.isArray(global.config?.ADMINBOT) ? global.config.ADMINBOT : [];
  if (owner && owner === c) return true;
  return [...configured, ...runtime, ...yaml, ...adminbot].map(uid).filter(Boolean).includes(c);
}

function saveTemp(buf, prefix = "shop") {
  mkdirSync(TEMP_DIR, { recursive: true });
  const p = path.join(TEMP_DIR, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}.png`);
  writeFileSync(p, buf);
  return p;
}

async function sendImg(adapter, threadId, threadType, buffer, caption) {
  const imagePath = saveTemp(buffer);
  try {
    await adapter.sendImage({ threadId, threadType, imagePath, caption });
  } finally {
    try {
      unlinkSync(imagePath);
    } catch {
      /* ignore */
    }
  }
}

function rarityMenu() {
  return Object.values(RARITIES)
    .sort((a, b) => a.order - b.order)
    .map((r, i) => `${i + 1}. ${r.icon} ${r.name}`)
    .join("\n");
}

function rarityByIndex(n) {
  const list = Object.values(RARITIES).sort((a, b) => a.order - b.order);
  return list[n - 1] || null;
}

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadImage(res.headers.location).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function extractImageUrl(data) {
  if (!data) return null;
  if (typeof data.content === "object") {
    return data.content?.href || data.content?.url || data.content?.thumb || null;
  }
  if (data.msgType === "chat.photo" && typeof data.content === "string") return data.content;
  return null;
}

export default {
  name: "shop",
  description: "Shop V2 — Vật phẩm / Trang bị / Thuốc / Pokémon · Canvas marketplace",
  version: "2.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 1,
  aliases: ["cuahang", "store"],
  noPrefix: false,

  async run({ adapter, message, args = [] }) {
    const threadId = message.threadId;
    const threadType = message.type === 1 ? "group" : "user";
    const userId = uid(message.data?.uidFrom);
    const displayName = String(message.data?.dName || "Người chơi").slice(0, 40);
    const send = (t) => adapter.sendText({ threadId, threadType, text: t });
    if (!userId) return send("❌ Không xác định UID.");

    const sub = String(args[0] || "").toLowerCase().trim();
    const balance = await ShopService.getMoney(userId);

    // ─── Admin: .shop add ────────────────────────────────────
    if (sub === "add") {
      if (!isAdmin(userId)) return send("⛔ Chỉ admin mới thêm sản phẩm.");
      setS(userId, threadId, { type: "ADD", step: 1, draft: {} });
      return send(
        [
          "🛍️ THÊM SẢN PHẨM",
          "──────────────",
          "Bước 1/7",
          "",
          "✏️ Hãy nhập TÊN SẢN PHẨM:",
          "",
          "(Gõ hủy để dừng)",
        ].join("\n")
      );
    }

    // ─── Admin: .shop edit ───────────────────────────────────
    if (sub === "edit") {
      if (!isAdmin(userId)) return send("⛔ Chỉ admin.");
      setS(userId, threadId, { type: "EDIT_CAT" });
      return send(
        [
          "🛠️ SHOP EDIT",
          "──────────────",
          "CHỌN DANH MỤC",
          "",
          "1. 🎒 Vật phẩm",
          "2. ⚔️ Trang bị",
          "3. 🧪 Thuốc",
          "4. ⚡ Pokémon",
          "",
          "Reply số danh mục · Gõ huy để hủy",
        ].join("\n")
      );
    }

    // ─── Admin: .shop dele ───────────────────────────────────
    if (sub === "dele" || sub === "delete" || sub === "del") {
      if (!isAdmin(userId)) return send("⛔ Chỉ admin.");
      setS(userId, threadId, { type: "DEL_CAT" });
      return send(
        [
          "🗑️ SHOP XÓA",
          "──────────────",
          "1. 🎒 Vật phẩm",
          "2. ⚔️ Trang bị",
          "3. 🧪 Thuốc",
          "4. ⚡ Pokémon",
          "",
          "Reply số danh mục · Gõ huy để hủy",
        ].join("\n")
      );
    }

    // ─── Pagination ──────────────────────────────────────────
    if (sub === "trang" || sub === "page") {
      const page = Math.max(1, parseInt(args[1], 10) || 1);
      const sess = getS(userId, threadId);
      if (!sess || !sess.products) {
        return send("Không có danh sách để chuyển trang. Mở .shop trước.");
      }
      const totalPages = Math.max(1, Math.ceil(sess.products.length / PER_PAGE));
      const p = Math.min(page, totalPages);
      sess.page = p;
      setS(userId, threadId, sess);
      const buf = await ShopRenderer.renderProductGrid({
        title: sess.title || "Sản phẩm",
        products: sess.products,
        page: p,
        totalPages,
        balance,
      });
      await sendImg(adapter, threadId, threadType, buf, `🛍️ Trang ${p}/${totalPages}`);
      return send(
        `🛍️ Trang ${p}/${totalPages}\nReply số để xem · mua [số] · .shop trang ${Math.min(p + 1, totalPages)}`
      );
    }

    // ─── Marketplace / sell (giữ) ────────────────────────────
    if (sub === "den" || sub === "black" || sub === "market") {
      const listings = ShopService.getMarketplaceListings();
      const buf = await ShopRenderer.renderMarketplace(listings, 1, 1, balance);
      await sendImg(adapter, threadId, threadType, buf, "☠️ Chợ Đen");
      if (listings.length) setS(userId, threadId, { type: "SELECT_MARKET", listings });
      return;
    }

    if (sub === "sell" || sub === "ban") {
      const sellable = await ShopService.getUserSellableItems(userId);
      if (!sellable.length) return send("🎒 Kho không có vật phẩm để bán.");
      let msg = "🎒 CHỌN VẬT PHẨM ĐĂNG BÁN:\n";
      sellable.forEach((it, i) => {
        msg += `\n${i + 1}. ${it.icon} ${it.name} (x${it.quantity})`;
      });
      msg += "\n\nReply: [STT] [SL] [Đơn giá]\nVD: 1 2 50000";
      setS(userId, threadId, { type: "SELECT_SELL", sellable });
      return send(msg);
    }

    if (sub === "huy" || sub === "hủy" || sub === "cancel") {
      clearS(userId, threadId);
      return send("❌ Đã hủy thao tác Shop. Bạn có thể dùng lệnh khác bình thường.");
    }

    if (sub === "help") {
      return send(
        [
          "🛍️ SHOP V2",
          "──────────────",
          "▸ .shop — mở cửa hàng",
          "▸ .shop trang [n] — chuyển trang",
          "▸ .shop den — chợ đen",
          "▸ .shop sell — đăng bán",
          "▸ .shop huy — hủy thao tác / thoát shop",
          "▸ .shop add — (admin) thêm SP",
          "▸ .shop edit — (admin) sửa",
          "▸ .shop dele — (admin) xóa",
        ].join("\n")
      );
    }

    // ─── Default: main shop ──────────────────────────────────
    try {
      // Pokémon không hiện category riêng — vào qua Trang bị → Chọn Game (giống Câu Cá)
      const categories = ShopService.getMainCategories().filter((c) => c.id !== "pokemon");
      const buf = await ShopRenderer.renderMainShop({
        displayName,
        balance,
        categories,
      });
      await sendImg(adapter, threadId, threadType, buf, "🛍️ SHOP");
      setS(userId, threadId, {
        type: "MAIN",
        categories,
        page: 1,
      });
      return send(
        [
          "🛍️ SHOP — Trang chính",
          "",
          "1 🎒 Vật phẩm · 2 ⚔️ Trang bị · 3 🧪 Thuốc",
          "Reply số danh mục · (Pokémon nằm trong Trang bị → Chọn Game)",
          "Gõ huy hoặc .shop huy để hủy / thoát",
        ].join("\n")
      );
    } catch (err) {
      console.error("[shop]", err);
      return send(`Lỗi shop: ${err.message}`);
    }
  },

  async onMessage({ adapter, message, config }) {
    const data = message?.data || {};
    const userId = uid(data.uidFrom);
    const threadId = message.threadId;
    if (!userId || !threadId) return;

    const sess = getS(userId, threadId);
    if (!sess) return;

    let content = typeof data.content === "string" ? data.content.trim() : "";
    const prefix = config?.botPrefix || ".";
    if (content.startsWith(prefix)) return;

    const threadType = message.type === 1 ? "group" : "user";
    const displayName = String(data.dName || "Người chơi").slice(0, 40);
    const send = (t) => adapter.sendText({ threadId, threadType, text: t });
    const balance = await ShopService.getMoney(userId);

    // Image reply for ADD step image
    const imgUrl = extractImageUrl(data);
    if (sess.type === "ADD" && sess.step === 5 && sess.awaitImage && imgUrl) {
      try {
        const buf = await downloadImage(imgUrl);
        sess.draft.imageBuffer = buf;
        sess.awaitImage = false;
        sess.step = 6;
        setS(userId, threadId, sess);
        return send(
          [
            "📂 Bước 6/7",
            "",
            "CHỌN DANH MỤC",
            "1. 🎒 Vật phẩm",
            "2. ⚔️ Trang bị",
            "3. 🧪 Thuốc",
            "4. ⚡ Pokémon",
          ].join("\n")
        );
      } catch (e) {
        return send(`❌ Không tải được ảnh: ${e.message}. Thử lại hoặc chọn Không.`);
      }
    }

    if (!content && !imgUrl) return;
    const low = content.toLowerCase();
    if (low === "huy" || low === "hủy" || low === "cancel" || low === "thoat" || low === "thoát" || low === "0") {
      clearS(userId, threadId);
      return send("❌ Đã hủy thao tác Shop.\nBạn có thể dùng lệnh khác bình thường.");
    }

    try {
      // ═══════ ADD FLOW ═══════
      if (sess.type === "ADD") {
        if (!isAdmin(userId)) {
          clearS(userId, threadId);
          return send("⛔ Không phải admin.");
        }
        const d = sess.draft || {};

        if (sess.step === 1) {
          d.name = content.slice(0, 80);
          sess.draft = d;
          sess.step = 2;
          setS(userId, threadId, sess);
          return send("📝 Bước 2/7\n\nHãy nhập MÔ TẢ sản phẩm:");
        }
        if (sess.step === 2) {
          d.description = content.slice(0, 500);
          sess.draft = d;
          sess.step = 3;
          setS(userId, threadId, sess);
          return send("💰 Bước 3/7\n\nHãy nhập GIÁ TIỀN (số nguyên):\nVD: 50000");
        }
        if (sess.step === 3) {
          const price = Math.floor(Number(content.replace(/[,\s.]/g, "")));
          if (!Number.isFinite(price) || price < 0) {
            return send("❌ Giá không hợp lệ. Nhập lại số nguyên:");
          }
          d.price = price;
          sess.draft = d;
          sess.step = 4;
          setS(userId, threadId, sess);
          return send(`💎 Bước 4/7\n\nCHỌN ĐỘ HIẾM\n\n${rarityMenu()}\n\nReply số:`);
        }
        if (sess.step === 4) {
          const n = parseInt(content, 10);
          const rar = rarityByIndex(n);
          if (!rar) return send("❌ Chọn số 1–6.");
          d.rarity = rar.id;
          sess.draft = d;
          sess.step = 5;
          setS(userId, threadId, sess);
          return send(
            "🖼️ Bước 5/7\n\nThêm hình ảnh?\n1. ✅ Có\n2. ❌ Không"
          );
        }
        if (sess.step === 5) {
          if (content === "1") {
            sess.awaitImage = true;
            setS(userId, threadId, sess);
            return send("📸 Hãy GỬI / REPLY một hình ảnh sản phẩm:");
          }
          if (content === "2") {
            d.imageBuffer = null;
            sess.draft = d;
            sess.step = 6;
            setS(userId, threadId, sess);
            return send(
              "📂 Bước 6/7\n\nCHỌN DANH MỤC\n1. 🎒 Vật phẩm\n2. ⚔️ Trang bị\n3. 🧪 Thuốc\n4. ⚡ Pokémon"
            );
          }
          return send("Reply 1 hoặc 2.");
        }
        if (sess.step === 6) {
          const map = { 1: "item", 2: "equip", 3: "potion", 4: "pokemon" };
          const cat = map[content];
          if (!cat) return send("Reply 1–4.");
          d.category = cat;
          sess.draft = d;
          if (cat === "equip") {
            sess.step = 7;
            setS(userId, threadId, sess);
            return send(
              "🎮 Bước 7/7\n\nNhập TÊN GAME của trang bị:\nVD: Liên Quân / Free Fire / Minecraft"
            );
          }
          // confirm
          sess.step = 8;
          setS(userId, threadId, sess);
          return send(confirmAddText(d));
        }
        if (sess.step === 7) {
          d.gameName = content.slice(0, 40);
          sess.draft = d;
          sess.step = 8;
          setS(userId, threadId, sess);
          return send(confirmAddText(d));
        }
        if (sess.step === 8) {
          if (content === "2" || low === "huy") {
            clearS(userId, threadId);
            return send("Đã hủy thêm sản phẩm.");
          }
          if (content !== "1") return send("Reply 1 để Lưu, 2 để Hủy.");
          const product = await ShopService.addProduct(
            {
              ...d,
              createdBy: userId,
            },
            d.imageBuffer || null
          );
          clearS(userId, threadId);
          return send(
            `✅ Đã thêm: ${product.name}\n💰 ${ShopService.fmt(product.price)}\n📂 ${CATEGORIES[product.category]?.name}${product.gameName ? ` · 🎮 ${product.gameName}` : ""}`
          );
        }
        return;
      }

      // ═══════ EDIT / DELETE category pick ═══════
      if (sess.type === "EDIT_CAT" || sess.type === "DEL_CAT") {
        const map = { 1: "item", 2: "equip", 3: "potion", 4: "pokemon" };
        const cat = map[content];
        if (!cat) return send("Reply 1–4.");
        if (cat === "equip") {
          const games = ShopService.getGames();
          if (!games.length) {
            clearS(userId, threadId);
            return send("Chưa có game/trang bị nào.");
          }
          setS(userId, threadId, {
            type: sess.type === "EDIT_CAT" ? "EDIT_GAME" : "DEL_GAME",
            category: cat,
            games,
          });
          let msg = "⚔️ CHỌN GAME\n\n";
          games.forEach((g, i) => {
            msg += `${i + 1}. 🎮 ${g.name} (${g.count})\n`;
          });
          return send(msg);
        }
        const products = ShopService.getProductsByCategory(cat);
        if (!products.length) {
          clearS(userId, threadId);
          return send("Danh mục trống.");
        }
        setS(userId, threadId, {
          type: sess.type === "EDIT_CAT" ? "EDIT_PICK" : "DEL_PICK",
          category: cat,
          products,
        });
        let msg = "📦 CHỌN SẢN PHẨM\n\n";
        products.slice(0, 30).forEach((p, i) => {
          msg += `${i + 1}. ${p.name} — ${ShopService.fmt(p.price)}\n`;
        });
        return send(msg);
      }

      if (sess.type === "EDIT_GAME" || sess.type === "DEL_GAME") {
        const idx = parseInt(content, 10) - 1;
        const g = sess.games?.[idx];
        if (!g) return send("Số không hợp lệ.");
        const products = ShopService.getProductsByGame(g.name);
        setS(userId, threadId, {
          type: sess.type === "EDIT_GAME" ? "EDIT_PICK" : "DEL_PICK",
          category: "equip",
          gameName: g.name,
          products,
        });
        let msg = `🎮 ${g.name}\n\n`;
        products.forEach((p, i) => {
          msg += `${i + 1}. ${p.name} — ${ShopService.fmt(p.price)}\n`;
        });
        return send(msg);
      }

      if (sess.type === "EDIT_PICK") {
        const idx = parseInt(content, 10) - 1;
        const p = sess.products?.[idx];
        if (!p) return send("Số không hợp lệ.");
        setS(userId, threadId, { type: "EDIT_FIELD", productId: p.id, product: p });
        return send(
          [
            `🛠️ CHỈNH SỬA: ${p.name}`,
            "",
            "1. ✏️ Tên",
            "2. 📝 Mô tả",
            "3. 💰 Giá",
            "4. 💎 Độ hiếm",
            "5. 🎮 Tên Game (nếu trang bị)",
            "",
            "Reply số trường cần sửa",
          ].join("\n")
        );
      }

      if (sess.type === "EDIT_FIELD") {
        const fieldMap = { 1: "name", 2: "description", 3: "price", 4: "rarity", 5: "gameName" };
        const field = fieldMap[content];
        if (!field) return send("Reply 1–5.");
        setS(userId, threadId, {
          type: "EDIT_VALUE",
          productId: sess.productId,
          field,
        });
        if (field === "rarity") return send(`Chọn độ hiếm:\n${rarityMenu()}`);
        return send(`Nhập giá trị mới cho ${field}:`);
      }

      if (sess.type === "EDIT_VALUE") {
        const patch = {};
        if (sess.field === "price") {
          const n = Math.floor(Number(content.replace(/[,\s.]/g, "")));
          if (!Number.isFinite(n) || n < 0) return send("Giá không hợp lệ.");
          patch.price = n;
        } else if (sess.field === "rarity") {
          const rar = rarityByIndex(parseInt(content, 10));
          if (!rar) return send("Số 1–6.");
          patch.rarity = rar.id;
        } else {
          patch[sess.field] = content;
        }
        const res = await ShopService.updateProduct(sess.productId, patch);
        clearS(userId, threadId);
        if (!res.success) return send(`❌ ${res.error}`);
        return send(`✅ Đã cập nhật ${sess.field} cho ${res.product.name}`);
      }

      if (sess.type === "DEL_PICK") {
        const idx = parseInt(content, 10) - 1;
        const p = sess.products?.[idx];
        if (!p) return send("Số không hợp lệ.");
        setS(userId, threadId, { type: "DEL_CONFIRM", productId: p.id, product: p });
        return send(
          [
            "⚠️ XÓA SẢN PHẨM",
            "",
            `📦 ${p.name}`,
            `💰 ${ShopService.fmt(p.price)}`,
            `💎 ${RARITIES[p.rarity]?.name || p.rarity}`,
            p.gameName ? `🎮 ${p.gameName}` : "",
            "",
            "1. XÓA",
            "2. HỦY",
          ]
            .filter(Boolean)
            .join("\n")
        );
      }

      if (sess.type === "DEL_CONFIRM") {
        if (content === "2") {
          clearS(userId, threadId);
          return send("Đã hủy xóa.");
        }
        if (content !== "1") return send("Reply 1 hoặc 2.");
        const res = await ShopService.deleteProduct(sess.productId);
        clearS(userId, threadId);
        if (!res.success) return send(`❌ ${res.error}`);
        return send(`🗑️ Đã xóa: ${res.product.name}`);
      }

      // ═══════ PLAYER BROWSE ═══════
      if (sess.type === "MAIN") {
        const n = parseInt(content, 10);
        if (n === 1) return openCategory(adapter, message, userId, threadId, threadType, "item", displayName, balance, send);
        if (n === 2) return openEquip(adapter, message, userId, threadId, threadType, displayName, balance, send);
        if (n === 3) return openCategory(adapter, message, userId, threadId, threadType, "potion", displayName, balance, send);
        return send("Reply 1–3.\n⚡ Pokémon: chọn 2 (Trang bị) → chọn game Pokémon.\nGõ huy để hủy.");
      }

      if (sess.type === "SELECT_SUB") {
        const idx = parseInt(content, 10) - 1;
        const g = sess.groups?.[idx];
        if (!g) return send("Số không hợp lệ.\nGõ huy để hủy.");
        const products = ShopService.getProductsByGroup(sess.category, g.id);
        if (!products.length) return send("Mục này chưa có sản phẩm.");
        const totalPages = Math.max(1, Math.ceil(products.length / PER_PAGE));
        const title = `${g.icon} ${g.name}`;
        setS(userId, threadId, { type: "PRODUCT_LIST", products, title, page: 1, category: sess.category, groupId: g.id });
        const buf = await ShopRenderer.renderProductGrid({ title, products, page: 1, totalPages, balance });
        await sendImg(adapter, threadId, threadType, buf, title);
        return send(`${title} · ${products.length} món\nReply số xem chi tiết · mua [số] để mua\nGõ huy để hủy`);
      }

      if (sess.type === "SELECT_GAME") {
        const idx = parseInt(content, 10) - 1;
        const g = sess.games?.[idx];
        if (!g) return send("Số không hợp lệ.\nGõ huy để hủy.");
        const isPoke =
          g.isPokemon === true ||
          String(g.name || "").toLowerCase() === "pokemon" ||
          String(g.name || "").toLowerCase() === "pokémon";
        let products = isPoke
          ? ShopService.getProductsByCategory("pokemon")
          : ShopService.getProductsByGame(g.name);
        if (isPoke && !products.length) {
          try {
            if (typeof ShopService.ensurePokemonProducts === "function") {
              ShopService.ensurePokemonProducts();
            }
          } catch (e) {
            console.error("[SELECT_GAME] seed:", e?.message);
          }
          products = ShopService.getProductsByCategory("pokemon");
        }
        if (!products.length) {
          return send(isPoke ? "⚡ Chưa có vật phẩm Pokémon trong shop. Restart bot hoặc kiểm tra shop_data.json." : "Game này chưa có trang bị.");
        }
        const totalPages = Math.max(1, Math.ceil(products.length / PER_PAGE));
        const title = isPoke ? `⚡ Pokémon` : `⚔️ ${g.name}`;
        setS(userId, threadId, {
          type: "PRODUCT_LIST",
          products,
          title,
          page: 1,
          gameName: g.name,
          category: isPoke ? "pokemon" : "equip",
        });
        const buf = await ShopRenderer.renderProductGrid({
          title,
          products,
          page: 1,
          totalPages,
          balance,
        });
        await sendImg(adapter, threadId, threadType, buf, title);
        return send(
          isPoke
            ? `⚡ Pokémon Shop · ${products.length} món\nReply số xem · mua [số] mua\nGõ huy để hủy`
            : `Reply số để xem chi tiết · mua [số] · .shop trang 2\nGõ huy để hủy`
        );
      }

      if (sess.type === "PRODUCT_LIST") {
        // mua N
        const buyMatch = content.match(/^mua\s+(\d+)$/i);
        if (buyMatch) {
          const idx = parseInt(buyMatch[1], 10) - 1;
          const page = sess.page || 1;
          const start = (page - 1) * PER_PAGE;
          const product = sess.products[start + idx];
          if (!product) return send("Số sản phẩm không hợp lệ.");
          const res = await ShopService.buyShopItem(userId, product.id, 1);
          if (!res.success) return send(`❌ ${res.message}`);
          return send(
            `✅ Mua thành công!\n📦 ${res.product.name} x${res.qty}\n💸 -${ShopService.fmt(res.totalPrice)}\n👛 Còn: ${ShopService.fmt(res.balance)}`
          );
        }

        const idx = parseInt(content, 10) - 1;
        if (!Number.isFinite(idx) || idx < 0) return;
        const page = sess.page || 1;
        const start = (page - 1) * PER_PAGE;
        const product = sess.products[start + idx];
        if (!product) return send("Số không hợp lệ trên trang này.");
        setS(userId, threadId, {
          ...sess,
          type: "PRODUCT_DETAIL",
          selectedId: product.id,
          selected: product,
        });
        const buf = await ShopRenderer.renderProductDetail({
          product,
          balance,
          displayName,
        });
        await sendImg(adapter, threadId, threadType, buf, `🔎 ${product.name}`);
        return send("Reply: mua · 0 để quay lại danh sách");
      }

      if (sess.type === "PRODUCT_DETAIL") {
        if (content === "0" || low === "back" || low === "quaylai") {
          sess.type = "PRODUCT_LIST";
          setS(userId, threadId, sess);
          const totalPages = Math.max(1, Math.ceil(sess.products.length / PER_PAGE));
          const buf = await ShopRenderer.renderProductGrid({
            title: sess.title,
            products: sess.products,
            page: sess.page || 1,
            totalPages,
            balance,
          });
          await sendImg(adapter, threadId, threadType, buf, sess.title);
          return;
        }
        if (low === "mua" || content === "1") {
          const res = await ShopService.buyShopItem(userId, sess.selectedId, 1);
          if (!res.success) return send(`❌ ${res.message}`);
          return send(
            `✅ Đã mua ${res.product.name}!\n💸 -${ShopService.fmt(res.totalPrice)}\n👛 ${ShopService.fmt(res.balance)}\n🎒 Kiểm tra .balo open`
          );
        }
        return send("Reply: mua · 0 quay lại");
      }

      // Market sell
      if (sess.type === "SELECT_SELL") {
        const parts = content.split(/\s+/);
        const idx = parseInt(parts[0], 10) - 1;
        const qty = parseInt(parts[1], 10);
        const price = parseInt(parts[2], 10);
        const item = sess.sellable?.[idx];
        if (!item || !qty || !price) return send("Cú pháp: [STT] [SL] [Giá]\nVD: 1 2 50000");
        const res = await ShopService.createMarketListing(
          userId,
          displayName,
          item.itemId,
          item.name,
          qty,
          price
        );
        clearS(userId, threadId);
        if (!res.success) return send(`❌ ${res.message}`);
        return send(`✅ Đã đăng bán ${item.name} x${qty} @ ${ShopService.fmt(price)}/sp`);
      }

      if (sess.type === "SELECT_MARKET") {
        const idx = parseInt(content, 10) - 1;
        const listing = sess.listings?.[idx];
        if (!listing) return send("Số không hợp lệ.");
        const res = await ShopService.buyMarketListing(userId, listing.id);
        clearS(userId, threadId);
        if (!res.success) return send(`❌ ${res.message}`);
        return send(`✅ Đã mua từ chợ đen: ${listing.itemName}`);
      }
    } catch (err) {
      console.error("[shop onMessage]", err);
      await send(`❌ Lỗi: ${err.message}`);
    }
  },
};

function confirmAddText(d) {
  const rar = RARITIES[d.rarity] || RARITIES.common;
  const cat = CATEGORIES[d.category] || {};
  return [
    "╭── 🛍️ XÁC NHẬN ──╮",
    `📦 ${d.name}`,
    `📝 ${(d.description || "").slice(0, 80)}`,
    `💰 ${Number(d.price).toLocaleString("vi-VN")}`,
    `💎 ${rar.icon} ${rar.name}`,
    `📂 ${cat.icon || ""} ${cat.name || d.category}`,
    d.gameName ? `🎮 ${d.gameName}` : null,
    `🖼️ ${d.imageBuffer ? "✅ Có ảnh" : "❌ Không ảnh"}`,
    "",
    "1. Lưu sản phẩm",
    "2. Hủy",
  ]
    .filter((x) => x !== null)
    .join("\n");
}

async function openCategory(adapter, message, userId, threadId, threadType, catId, displayName, balance, send) {
  // Vật phẩm → "Nông Trại", Thuốc → "Trồng Trọt": hiện danh sách mục con trước
  const groups = ShopService.getSubGroups(catId);
  if (groups.length) {
    setS(userId, threadId, { type: "SELECT_SUB", category: catId, groups });
    const buf = await ShopRenderer.renderGroupList({ categoryId: catId, groups, balance });
    await sendImg(adapter, threadId, threadType, buf, `${CATEGORIES[catId].icon} ${CATEGORIES[catId].name}`);
    return send(`${CATEGORIES[catId].icon} ${CATEGORIES[catId].name}\nReply số để chọn mục\nGõ huy để hủy`);
  }
  const products = ShopService.getProductsByCategory(catId);
  const cat = CATEGORIES[catId];
  const totalPages = Math.max(1, Math.ceil(products.length / PER_PAGE));
  setS(userId, threadId, {
    type: "PRODUCT_LIST",
    products,
    title: `${cat.icon} ${cat.name}`,
    page: 1,
    category: catId,
  });
  const buf = await ShopRenderer.renderProductGrid({
    title: `${cat.icon} ${cat.name}`,
    products,
    page: 1,
    totalPages,
    balance,
  });
  await sendImg(adapter, threadId, threadType, buf, `${cat.icon} ${cat.name}`);
  return send(`🛍️ ${cat.name} · ${products.length} SP\nReply số xem · mua [số] mua\nGõ huy để hủy`);
}

async function openEquip(adapter, message, userId, threadId, threadType, displayName, balance, send) {
  // Force seed + get games (Pokémon luôn ở đầu)
  try {
    if (typeof ShopService.ensurePokemonProducts === "function") {
      ShopService.ensurePokemonProducts();
    }
  } catch (e) {
    console.error("[openEquip] seed:", e?.message);
  }
  let games = ShopService.getGames() || [];
  // Fallback cứng: nếu vì lý do gì đó vẫn thiếu Pokémon thì chèn thủ công
  const hasPoke = games.some(
    (g) => g.isPokemon || String(g.name || "").toLowerCase() === "pokemon" || String(g.name || "").toLowerCase() === "pokémon"
  );
  if (!hasPoke) {
    const pokeCount = (ShopService.getProductsByCategory("pokemon") || []).length;
    games = [{ name: "Pokémon", count: pokeCount || 8, isPokemon: true }, ...games];
  }
  if (!games.length) {
    return send("⚔️ Chưa có game/trang bị. Admin dùng .shop add.");
  }
  setS(userId, threadId, { type: "SELECT_GAME", games });
  const buf = await ShopRenderer.renderGameList({ games, balance, displayName });
  await sendImg(adapter, threadId, threadType, buf, "⚔️ Chọn Game");
  return send(
    "Reply số game để xem (1 = Pokémon nếu hiện đầu danh sách)\nGõ huy hoặc .shop huy để hủy"
  );
}
