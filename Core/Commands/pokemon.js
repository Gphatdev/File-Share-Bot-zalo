/**
 * .pokemon — Pokémon RPG v2 (Canvas Neon Edition) — HNNP STUDIO
 * Lệnh: help · pet · upt pet · balo · nhiemvu · thuphuc · gym · map · egg · solo · rank · huy ...
 * Toàn bộ logic nằm trong ./data/Pokemon/*; file này chỉ là lớp lệnh + phiên trả lời số.
 */
import { unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTrainer, setDisplayName, chooseStarter, setActivePet, useItem, useItemOnPet, trainWithTrainerExp,
  settlePveBattle, noteWildEncounter, learnPetMove, evolvePet, cooldownLeft, markCooldown, travelTo, healAll,
  awardBadge, incubateEgg, hatchEgg, claimQuest, retryUnpaidQuests, getRanking, addPokemon,
} from "./data/GIAITRI/Pokemon/storage.js";
import { STARTERS } from "./data/GIAITRI/Pokemon/pokedex.js";
import { CONFIG } from "./data/GIAITRI/Pokemon/config.js";
import { UPGRADE_COST } from "./data/GIAITRI/Pokemon/constants.js";
import { ITEMS, canonicalItemId, getItem } from "./data/GIAITRI/Pokemon/items.js";
import { getEvolutionOptions } from "./data/GIAITRI/Pokemon/evolution.js";
import { getLearnable, MAX_MOVES } from "./data/GIAITRI/Pokemon/moves.js";
import { listQuests } from "./data/GIAITRI/Pokemon/quests.js";
import { NODES, getNode, availableMethods, spawnWild, unlockStatus, METHOD_LABEL } from "./data/GIAITRI/Pokemon/world.js";
import { gymAt } from "./data/GIAITRI/Pokemon/gyms.js";
import { EGG_TIERS } from "./data/GIAITRI/Pokemon/eggs.js";
import * as PVE from "./data/GIAITRI/Pokemon/pve.js";
import { getMoveInfo } from "./data/GIAITRI/Pokemon/battle.js";
import {
  setState, getState, touchState, clearState, clearAllUserStates,
  createSoloRoom, getSoloRoom, findSoloRoomByUser, findWaitingRoom, updateSoloRoom, deleteSoloRoom,
} from "./data/GIAITRI/Pokemon/state.js";
import { partyFrom, soloMove, settleSolo, recoverPendingMatches } from "./data/GIAITRI/Pokemon/solo.js";
import * as UI from "./data/GIAITRI/Pokemon/canvas.js";
import { BALO_PAGE } from "./data/GIAITRI/Pokemon/ui/screens_core.js";
import TienGame from "./data/GIAITRI/TienGame/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, "data", "temp");

// khôi phục các trận solo đã chốt nhưng chưa kịp trả thưởng (idempotent)
recoverPendingMatches().catch((e) => console.error("[pokemon recover]", e?.message));

// ── tiện ích ──────────────────────────────────────────────
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
const YES = new Set(["1", "y", "yes", "ok", "co", "dong y", "xac nhan"]);
const NO = new Set(["0", "n", "no", "khong", "huy"]);
const safeStr = (v) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

async function sendImg(c, buffer, caption = "") {
  try {
    mkdirSync(TEMP_DIR, { recursive: true });
    const p = path.join(TEMP_DIR, `pkm-${Date.now()}-${Math.random().toString(16).slice(2, 7)}.png`);
    writeFileSync(p, buffer);
    try { await c.adapter.sendImage({ threadId: c.threadId, threadType: c.threadType, imagePath: p, caption }); }
    finally { try { unlinkSync(p); } catch { /* */ } }
  } catch (e) {
    console.error("[pokemon sendImg]", e?.message);
    await c.send(caption || "Không gửi được ảnh, thử lại sau.");
  }
}
const mkCtx = (adapter, message) => {
  const threadId = message.threadId;
  const threadType = message.type === 1 ? "group" : "user";
  const userId = String(message.data?.uidFrom ?? "").trim();
  const userName = safeStr(message.data?.dName || "Trainer").slice(0, 40) || "Trainer";
  return { adapter, threadId, threadType, userId, userName, send: (text) => adapter.sendText({ threadId, threadType, text }) };
};
async function money(uid) { try { return await TienGame.getBalance(uid); } catch { return null; } }
const notice = (c, title, lines, tone = "info") => UI.renderNotice({ title, lines, tone }).then((b) => sendImg(c, b));

function resolveItem(q) {
  const raw = norm(q).replace(/[\s-]+/g, "_");
  if (!raw) return null;
  const alias = { poke: "pokeball", great: "greatball", ultra: "ultraball", master: "masterball", candy: "rare_candy", keo: "rare_candy", superpotion: "super_potion", hyperpotion: "hyper_potion" };
  const id = canonicalItemId(alias[raw] || raw);
  if (ITEMS[id]) return ITEMS[id];
  return Object.values(ITEMS).find((i) => norm(i.name).replace(/[\s-]+/g, "_") === raw || i.id.includes(raw)) || null;
}
function hintsFor(levelUps, trainer) {
  const out = [];
  for (const lu of levelUps || []) {
    const pet = trainer.collection.find((p) => p.uid === lu.uid) || null;
    let s = `⬆️ ${lu.name} Lv.${lu.from}→${lu.to}`;
    if (lu.newMoves?.length) s += ` · có ${lu.newMoves.length} chiêu mới để học`;
    if (pet && getEvolutionOptions(pet, trainer.inventory).some((o) => o.ready)) s += " · đủ điều kiện tiến hóa";
    out.push(s);
  }
  if (out.length) out.push("Dùng .pokemon upt pet để học chiêu / tiến hóa.");
  return out;
}
const activeOf = (t) => t.collection.find((p) => p.uid === t.activePokemon) || null;
const needStarter = (c) => notice(c, "CHƯA CÓ POKÉMON", ["Bạn chưa chọn Pokémon khởi đầu.", "Dùng .pokemon pet để chọn."], "warn");
const inBattle = (c) => { const s = getState(c.userId, c.threadId); return s && (s.type === "PVE" || s.type === "SOLO"); };

// ══════════ HIỂN THỊ ══════════
async function showHelp(c) { return sendImg(c, await UI.renderHelp({ userName: c.userName, prefix: c.prefix }), "Pokémon RPG — hướng dẫn"); }
async function showBalo(c, page = 1, setSess = true) {
  const t = await getTrainer(c.userId);
  if (!t.starterChosen) return needStarter(c);
  if (setSess) setState(c.userId, c.threadId, { type: "BALO", page });
  return sendImg(c, await UI.renderBalo({ trainer: t, userName: c.userName, page }), `Balo · ${t.collection.length} Pokémon`);
}
async function showUpgrade(c, setSess = true) {
  const t = await getTrainer(c.userId);
  const pet = activeOf(t);
  if (!pet) return needStarter(c);
  if (setSess) setState(c.userId, c.threadId, { type: "UPGRADE", petUid: pet.uid });
  return sendImg(c, await UI.renderUpgrade({ pet, trainer: t }), "Reply 1 Luyện · 2 Học chiêu · 3 Tiến hóa · 4 Rare Candy");
}
async function showQuests(c, page = 1) {
  const t = await getTrainer(c.userId);
  if (!t.starterChosen) return needStarter(c);
  await retryUnpaidQuests(c.userId).catch(() => {});
  setState(c.userId, c.threadId, { type: "QUEST", page });
  return sendImg(c, await UI.renderQuests({ trainer: await getTrainer(c.userId), page, userName: c.userName }), "Reply số nhiệm vụ để nhận thưởng");
}
async function showMap(c, selectedId = null, setSess = true) {
  const t = await getTrainer(c.userId);
  if (!t.starterChosen) return needStarter(c);
  if (setSess) setState(c.userId, c.threadId, { type: "MAP" });
  return sendImg(c, await UI.renderMap({ trainer: t, selectedId, userName: c.userName }), "Reply số địa điểm để đi · xem <số>");
}
async function showEggs(c) {
  const t = await getTrainer(c.userId);
  if (!t.starterChosen) return needStarter(c);
  return sendImg(c, await UI.renderEggs({ trainer: t, userName: c.userName }), "Ấp: .pokemon egg ap <common|uncommon|rare> · Nở: .pokemon egg no <số>");
}

// ══════════ PVE (hoang dã + Gym) ══════════
async function pveScreen(c, sess, caption = "") {
  const s = sess.s;
  const t = await getTrainer(c.userId);
  const balls = s.kind === "wild" ? { pokeball: t.inventory.pokeball || 0, greatball: t.inventory.greatball || 0, ultraball: t.inventory.ultraball || 0, masterball: t.inventory.masterball || 0 } : null;
  const buf = await UI.renderBattle({
    kind: s.kind, player: PVE.cur(s), enemy: PVE.foe(s), node: s.node, log: s.log.slice(-5), balls,
    enemyLabel: s.leader, enemyParty: s.kind === "gym" ? s.enemyParty : null, eIdx: s.eIdx, playerParty: s.playerParty, pIdx: s.pIdx, caption: s.method ? METHOD_LABEL[s.method] : "",
  });
  return sendImg(c, buf, caption);
}
async function startWild(c, arg) {
  const t = await getTrainer(c.userId);
  if (!t.starterChosen) return needStarter(c);
  if (inBattle(c) || findSoloRoomByUser(c.userId)) return c.send("Bạn đang trong một trận. Hoàn thành hoặc gõ .pokemon huy.");
  const left = cooldownLeft(t, "wild");
  if (left > 0) return c.send(`Chờ ${Math.ceil(left / 1000)}s rồi hãy tìm Pokémon tiếp.`);
  const party = PVE.buildPlayerParty(t);
  if (!party.length) return c.send("Tất cả Pokémon đã ngất. Về thị trấn có Pokémon Center và dùng .pokemon hoi.");
  const node = getNode(t.position);
  const methods = availableMethods(node.id);
  if (!methods.length) return c.send(`${node.name} không có Pokémon hoang dã. Hãy di chuyển (.pokemon map).`);
  const want = { cau: "rod", rod: "rod", surf: "surf", luot: "surf", co: "walk", walk: "walk" }[norm(arg)] || null;
  if (arg && !want) return c.send("Cách tìm: thuphuc · thuphuc cau · thuphuc surf");
  if (want && !methods.includes(want)) return c.send(`${node.name} không có cách "${METHOD_LABEL[want]}". Có: ${methods.map((m) => METHOD_LABEL[m]).join(", ")}.`);
  const spawn = spawnWild(node.id, want);
  if (!spawn) return c.send("Không có Pokémon xuất hiện.");
  await markCooldown(c.userId, "wild");
  await noteWildEncounter(c.userId, spawn.species);
  const s = PVE.newSession({ kind: "wild", node: node.id, method: spawn.method, playerParty: party, enemyParty: [PVE.makeWild(spawn)] });
  s.log.push(`${PVE.foe(s).name} Lv.${PVE.foe(s).level} xuất hiện!`);
  const sess = { type: "PVE", s, busy: false };
  setState(c.userId, c.threadId, sess);
  return pveScreen(c, getState(c.userId, c.threadId), "Wild! Reply 1-4 chiêu · ball <loại> · item <tên> · chay");
}
async function startGym(c) {
  const t = await getTrainer(c.userId);
  if (!t.starterChosen) return needStarter(c);
  if (inBattle(c) || findSoloRoomByUser(c.userId)) return c.send("Bạn đang trong một trận. Hoàn thành hoặc gõ .pokemon huy.");
  const gym = gymAt(t.position);
  if (!gym) return c.send("Nơi này không có Gym. Gym nằm ở Pewter, Cerulean, Vermilion, Celadon, Fuchsia, Saffron, Cinnabar, Viridian.");
  const left = cooldownLeft(t, "gym");
  if (left > 0) return c.send(`Chờ ${Math.ceil(left / 1000)}s trước khi thách đấu tiếp.`);
  const party = PVE.buildPlayerParty(t);
  if (!party.length) return c.send("Tất cả Pokémon đã ngất. Dùng .pokemon hoi ở Pokémon Center.");
  await markCooldown(c.userId, "gym");
  const s = PVE.newSession({ kind: "gym", node: gym.city, playerParty: party, enemyParty: PVE.makeGymTeam(gym), gymCity: gym.city, leader: gym.leader });
  s.log.push(`Gym Leader ${gym.leader} thách đấu bạn!`);
  setState(c.userId, c.threadId, { type: "PVE", s, busy: false });
  return pveScreen(c, getState(c.userId, c.threadId), `Gym ${gym.leader}! Reply 1-4 chiêu · item <tên> · chay`);
}
async function finishPve(c, sess, extra = []) {
  const s = sess.s;
  clearState(c.userId, c.threadId);
  const win = s.result === "win", caught = s.result === "caught";
  const hpMap = Object.fromEntries(s.playerParty.map((p) => [p.uid, p.hp]));
  const expMap = {}; let expEach = 0;
  if (win) { const e = PVE.computeExp(s); e.uids.forEach((u) => { expMap[u] = e.each; }); expEach = e.each; }
  const r = await settlePveBattle(c.userId, { hpMap, expMap, wildWin: win && s.kind === "wild", eggSteps: win ? (s.kind === "wild" ? CONFIG.eggSteps.wildWin : 0) : 0 });
  const lines = [...extra];
  let badgeId = null;
  if (s.kind === "gym" && win) {
    const b = await awardBadge(c.userId, s.gymCity);
    if (b.ok && !b.already) { badgeId = b.badge.id; lines.push(`Nhận ${b.badge.name}!`); }
    else lines.push("Đã có huy hiệu này (đấu lại).");
  }
  if (caught) {
    const add = await addPokemon(c.userId, s.caught.species, s.caught.level, { origin: "wild" });
    lines.push(add.ok ? `Đã thêm ${add.pet.name} Lv.${add.pet.level} vào balo.` : `${add.message} (Pokémon đã chạy mất)`);
  }
  const t = await getTrainer(c.userId);
  lines.push(...hintsFor(r.levelUps, t));
  const rows = s.playerParty.filter((p) => s.participants.includes(p.uid)).map((p) => {
    const pet = t.collection.find((x) => x.uid === p.uid) || p;
    const lu = r.levelUps.find((x) => x.uid === p.uid);
    return { species: pet.species, name: pet.name, level: pet.level, text: pet.hp <= 0 ? "Đã ngất" : `HP ${pet.hp}/${pet.maxHp}${expMap[p.uid] ? ` · +${expMap[p.uid]} EXP` : ""}`, right: lu ? `Lv.${lu.from}→${lu.to}` : "" };
  });
  const title = caught ? "THU PHỤC THÀNH CÔNG" : win ? (s.kind === "gym" ? "VICTORY" : "CHIẾN THẮNG") : s.result === "fled" ? "ĐỐI THỦ BỎ CHẠY" : s.result === "run" ? "BẠN ĐÃ RÚT LUI" : "DEFEAT";
  const sub = s.kind === "gym" ? `Gym ${s.leader}` : `${getNode(s.node)?.name || ""}`;
  const buf = await UI.renderPveResult({ win: win || caught, title, subtitle: sub, petRows: rows, extra: lines.filter((l) => !l.startsWith("⬆️") && !l.startsWith("Dùng .pokemon")).slice(0, 3), badgeId, exp: win ? expEach : null });
  await sendImg(c, buf, win || caught ? "Kết thúc trận" : "Kết thúc trận — dùng .pokemon hoi để hồi phục");
  const hint = lines.filter((l) => l.startsWith("⬆️") || l.startsWith("Dùng .pokemon"));
  if (hint.length) await c.send(hint.join("\n"));
}
async function pveInput(c, sess, low) {
  const s = sess.s;
  if (sess.busy) return;
  sess.busy = true;
  try {
    let m;
    if (/^[1-4]$/.test(low)) {
      const r = PVE.playerMove(s, Number(low) - 1);
      if (!r.ok) return c.send(r.message);
    } else if (low === "chay" || low === "run") {
      s.over = true; s.result = s.kind === "gym" ? "lose" : "run";
      return finishPve(c, sess, [s.kind === "gym" ? "Bạn bỏ cuộc — tính là thua Gym." : "Bạn đã chạy thoát an toàn."]);
    } else if (s.kind === "wild" && (m = low.match(/^(?:ball|nem)(?:\s+(\S+))?$/) || (resolveItem(low)?.cat === "ball" ? [low, low] : null))) {
      const item = resolveItem(m[1] || "pokeball");
      if (!item || item.cat !== "ball") return c.send("Loại bóng: pokeball / great / ultra / master");
      const t = await getTrainer(c.userId);
      if (t.collection.length >= CONFIG.trainer.maxCollection) return c.send("Balo Pokémon đã đầy — không thể thu phục thêm.");
      const used = await useItem(c.userId, item.id, 1);
      if (!used.ok) return c.send(used.message);
      const r = PVE.throwBall(s, item.id);
      await sendImg(c, await UI.renderThrowBall({ ballId: item.id, wild: PVE.foe(s), result: r.result }));
    } else if ((m = low.match(/^(?:item|dung)\s+(.+)$/))) {
      const item = resolveItem(m[1]);
      if (!item) return c.send("Không tìm thấy vật phẩm đó.");
      const chk = PVE.itemHeal(s, item);
      if (!chk.ok) return c.send(chk.message);
      const used = await useItem(c.userId, item.id, 1);
      if (!used.ok) return c.send(used.message);
      PVE.applyItemHeal(s, item);
    } else return; // tin nhắn thường — bỏ qua
    if (s.over) return finishPve(c, sess);
    touchState(c.userId, c.threadId);
    return pveScreen(c, sess);
  } finally { sess.busy = false; }
}

// ══════════ NÂNG CẤP / CHIÊU / TIẾN HÓA ══════════
async function getPet(c, uid) { const t = await getTrainer(c.userId); return { t, pet: t.collection.find((p) => p.uid === uid) || null }; }
async function upgradeInput(c, sess, low) {
  const { t, pet } = await getPet(c, sess.petUid);
  if (!pet) { clearState(c.userId, c.threadId); return c.send("Pokémon không còn nữa."); }
  if (low === "1") {
    const cost = UPGRADE_COST.level(pet.level);
    const r = await trainWithTrainerExp(c.userId, pet.uid, cost);
    if (!r.ok) return c.send(r.message);
    await c.send(`${pet.name} lên Level ${r.to}! (-${cost} EXP Trainer)${r.newMoves?.length ? ` · ${r.newMoves.length} chiêu mới có thể học (reply 2)` : ""}`);
    return showUpgrade(c, false);
  }
  if (low === "2") {
    const learnable = getLearnable(pet);
    if (!learnable.length) return c.send("Chưa có chiêu mới nào để học ở level này.");
    setState(c.userId, c.threadId, { type: "LEARN_PICK", petUid: pet.uid });
    return sendImg(c, await UI.renderLearnList({ pet, learnable }), "Reply số chiêu muốn học");
  }
  if (low === "3") {
    const opts = getEvolutionOptions(pet, t.inventory);
    if (!opts.length) return c.send(`${pet.name} không có dạng tiến hóa.`);
    if (opts.length > 1) {
      setState(c.userId, c.threadId, { type: "EVOLVE_PICK", petUid: pet.uid });
      const lines = opts.map((o, i) => `${i + 1}. ${o.toName} — ${o.reqs.map((r) => `${r.met ? "✔" : "✘"} ${r.text}`).join(", ")}`);
      return c.send(`${pet.name} có nhiều nhánh tiến hóa:\n${lines.join("\n")}\nReply số để chọn nhánh.`);
    }
    return evolveConfirmScreen(c, pet, t, opts[0]);
  }
  if (low === "4") {
    const r = await useItemOnPet(c.userId, pet.uid, "rare_candy");
    if (!r.ok) return c.send(r.message);
    await c.send(`${r.text}${r.levelUp?.newMoves?.length ? ` · ${r.levelUp.newMoves.length} chiêu mới có thể học` : ""}`);
    return showUpgrade(c, false);
  }
}
async function evolveConfirmScreen(c, pet, t, opt) {
  if (!opt.ready) return c.send(`Chưa đủ điều kiện tiến hóa: ${opt.reqs.filter((r) => !r.met).map((r) => r.text).join(", ")}.`);
  setState(c.userId, c.threadId, { type: "EVOLVE_CONFIRM", petUid: pet.uid, to: opt.to });
  return sendImg(c, await UI.renderEvolveConfirm({ pet, option: opt, trainer: t }), "Reply 1 để xác nhận tiến hóa · 0 để hủy");
}
async function learnInput(c, sess, low) {
  const { pet } = await getPet(c, sess.petUid);
  if (!pet) { clearState(c.userId, c.threadId); return c.send("Pokémon không còn nữa."); }
  if (sess.type === "LEARN_PICK") {
    const learnable = getLearnable(pet);
    const n = Number(low);
    if (!Number.isInteger(n) || n < 1 || n > learnable.length) return;
    const moveId = learnable[n - 1].id;
    if (pet.moves.length < MAX_MOVES) {
      setState(c.userId, c.threadId, { type: "LEARN_CONFIRM", petUid: pet.uid, moveId, replaceId: null });
      return sendImg(c, await UI.renderLearnConfirm({ pet, moveId, stage: "confirm" }), "Reply 1 xác nhận · 0 hủy");
    }
    setState(c.userId, c.threadId, { type: "LEARN_REPLACE", petUid: pet.uid, moveId });
    return sendImg(c, await UI.renderLearnConfirm({ pet, moveId, stage: "pick" }), "Đã đủ 4 chiêu — reply 1-4 chọn chiêu để thay");
  }
  if (sess.type === "LEARN_REPLACE") {
    const n = Number(low);
    if (!Number.isInteger(n) || n < 1 || n > pet.moves.length) return;
    const replaceId = pet.moves[n - 1];
    setState(c.userId, c.threadId, { type: "LEARN_CONFIRM", petUid: pet.uid, moveId: sess.moveId, replaceId });
    return sendImg(c, await UI.renderLearnConfirm({ pet, moveId: sess.moveId, replaceId, stage: "confirm" }), "Reply 1 xác nhận thay · 0 hủy");
  }
  // LEARN_CONFIRM
  if (NO.has(low)) { clearState(c.userId, c.threadId); return c.send("Đã hủy học chiêu."); }
  if (!YES.has(low)) return;
  clearState(c.userId, c.threadId);
  const r = await learnPetMove(c.userId, pet.uid, sess.moveId, sess.replaceId);
  if (!r.ok) return c.send(r.message);
  return sendImg(c, await UI.renderLearnDone({ pet: r.pet, learned: sess.moveId, replaced: sess.replaceId }), `${r.pet.name} đã học ${getMoveInfo(sess.moveId)?.name || sess.moveId}!`);
}
async function evolveInput(c, sess, low) {
  const { t, pet } = await getPet(c, sess.petUid);
  if (!pet) { clearState(c.userId, c.threadId); return c.send("Pokémon không còn nữa."); }
  if (sess.type === "EVOLVE_PICK") {
    const opts = getEvolutionOptions(pet, t.inventory);
    const n = Number(low);
    if (!Number.isInteger(n) || n < 1 || n > opts.length) return;
    return evolveConfirmScreen(c, pet, t, opts[n - 1]);
  }
  if (NO.has(low)) { clearState(c.userId, c.threadId); return c.send("Đã hủy tiến hóa."); }
  if (!YES.has(low)) return;
  clearState(c.userId, c.threadId);
  const r = await evolvePet(c.userId, pet.uid, sess.to);
  if (!r.ok) return c.send(r.message);
  await sendImg(c, await UI.renderEvolveFrame({ species: r.from, toSpecies: r.to }), `${r.before.name} đang tiến hóa...`);
  await new Promise((res) => setTimeout(res, 1500));
  return sendImg(c, await UI.renderEvolveResult({ pet: r.pet, from: r.from, before: r.before }), `${r.before.name} đã tiến hóa thành ${r.pet.name}!`);
}

// ══════════ NHIỆM VỤ / BẢN ĐỒ / TRỨNG ══════════
async function claimOne(c, def) {
  const r = await claimQuest(c.userId, def.id);
  if (!r.ok) return c.send(`${def.name}: ${r.message}`);
  return sendImg(c, await UI.renderQuestClaim({ def, exp: r.exp, money: r.money, items: r.items, paid: r.paid, trainer: r.trainer }), `Nhận thưởng: ${def.name}`);
}
async function questInput(c, sess, low) {
  const all = listQuests();
  let m;
  if ((m = low.match(/^trang\s+(\d+)$/))) return showQuests(c, Number(m[1]));
  if (low === "tatca" || low === "all") {
    const t = await getTrainer(c.userId);
    const ready = all.filter((q) => t.quests[q.id]?.status === "completed");
    if (!ready.length) return c.send("Chưa có nhiệm vụ nào chờ nhận.");
    for (const q of ready) await claimOne(c, q);
    return;
  }
  const n = Number(low);
  if (!Number.isInteger(n) || n < 1 || n > all.length) return;
  return claimOne(c, all[n - 1]);
}
async function mapInput(c, sess, low) {
  let m;
  if ((m = low.match(/^xem\s+(\d+)$/))) {
    const nd = NODES[Number(m[1]) - 1];
    if (!nd) return c.send("Không có địa điểm đó.");
    return showMap(c, nd.id, false);
  }
  const n = Number(low);
  if (!Number.isInteger(n) || n < 1 || n > NODES.length) return;
  const nd = NODES[n - 1];
  const r = await travelTo(c.userId, nd.id);
  if (!r.ok) return c.send(r.message);
  clearState(c.userId, c.threadId);
  await c.send(`Đã đến ${nd.name} (${r.hops} chặng).${r.eggsStepped ? " Trứng của bạn tiến gần hơn đến lúc nở." : ""}`);
  return showMap(c, nd.id, false);
}

// ══════════ SOLO ══════════
async function soloCreate(c) {
  const t = await getTrainer(c.userId);
  if (!t.starterChosen) return needStarter(c);
  if (inBattle(c) || findSoloRoomByUser(c.userId)) return c.send("Bạn đang trong một trận/phòng. Gõ .pokemon huy để thoát.");
  const party = partyFrom(t);
  if (!party.length) return c.send("Tất cả Pokémon đã ngất — hồi phục trước khi solo (.pokemon hoi).");
  if (c.threadType !== "group") return c.send("Solo cần chơi trong nhóm để có đối thủ.");
  const room = createSoloRoom(c.userId, c.userName, c.threadId);
  updateSoloRoom(room.roomId, { hostParty: party, hostPet: party[0] });
  setState(c.userId, c.threadId, { type: "SOLO", roomId: room.roomId });
  return sendImg(c, await UI.renderSoloRoom({ room: getSoloRoom(room.roomId) }), "Phòng Solo đã tạo — người khác gõ .pokemon solo thamgia");
}
async function soloJoin(c) {
  const t = await getTrainer(c.userId);
  if (!t.starterChosen) return needStarter(c);
  if (inBattle(c) || findSoloRoomByUser(c.userId)) return c.send("Bạn đang trong một trận/phòng.");
  const w = findWaitingRoom(c.threadId);
  if (!w) return c.send("Không có phòng Solo đang chờ trong nhóm này. Tạo phòng bằng .pokemon solo");
  if (w.hostUid === c.userId) return c.send("Bạn là chủ phòng.");
  const party = partyFrom(t);
  if (!party.length) return c.send("Tất cả Pokémon đã ngất — hồi phục trước (.pokemon hoi).");
  if (w.guestUid || w.status !== "waiting") return c.send("Phòng đã đủ người.");
  // chiếm chỗ đồng bộ (không await giữa kiểm tra và gán)
  const room = updateSoloRoom(w.roomId, { guestUid: c.userId, guestName: c.userName, guestParty: party, guestPet: party[0], status: "battling", turn: w.hostUid, turnCount: 0 });
  setState(c.userId, c.threadId, { type: "SOLO", roomId: room.roomId });
  setState(room.hostUid, c.threadId, { type: "SOLO", roomId: room.roomId });
  return sendImg(c, await UI.renderSoloBattle({ room, log: ["Trận đấu bắt đầu!"] }), "SOLO bắt đầu! Chủ phòng đi trước — reply 1-4 · dohang để đầu hàng");
}
async function soloFinish(c, room, outcome) {
  const res = await settleSolo(room, outcome);
  for (const u of [room.hostUid, room.guestUid]) if (u) clearState(u, room.threadId);
  deleteSoloRoom(room.roomId);
  if (!res.ok || !res.rewarded) return res;
  for (const p of res.players) {
    const opp = res.players.find((x) => x.uid !== p.uid);
    const t = await getTrainer(p.uid);
    const party = p.uid === room.hostUid ? room.hostParty : room.guestParty;
    const petInst = t.collection.find((x) => x.uid === p.petUid) || party[0];
    const buf = await UI.renderSoloResult({
      result: p.result, name: p.name, oppName: opp.name, pet: petInst, exp: p.exp, money: p.money,
      stats: { wins: t.stats.wins || 0, losses: t.stats.losses || 0, draws: t.stats.draws || 0, exp: t.exp, trainerLevel: t.trainerLevel }, matchId: res.matchId, turns: res.turns,
    });
    await sendImg(c, buf, `${p.name}: ${p.result === "win" ? "THẮNG" : p.result === "draw" ? "HÒA" : "THUA"} · +${p.exp} EXP · +${p.money} xu${p.paid === false ? " (tiền sẽ được bù tự động)" : ""}`);
  }
  return res;
}
async function soloInput(c, sess, low) {
  const room = getSoloRoom(sess.roomId);
  if (!room || room.settled) { clearState(c.userId, c.threadId); return; }
  if (room.status !== "battling") return;
  if (room.busy) return;
  room.lastActive = Date.now();
  if (low === "dohang" || low === "surrender") {
    room.busy = true;
    try { const opp = room.hostUid === c.userId ? room.guestUid : room.hostUid; return await soloFinish(c, room, { kind: "win", winnerUid: opp, loserUid: c.userId, reason: "surrender" }); }
    finally { room.busy = false; }
  }
  if (!/^[1-4]$/.test(low)) return;
  room.busy = true;
  try {
    const r = soloMove(room, c.userId, Number(low) - 1);
    if (!r.ok) return c.send(r.message);
    if (r.outcome) return await soloFinish(c, room, r.outcome);
    return await sendImg(c, await UI.renderSoloBattle({ room, log: room.log }), `Lượt của ${room.turn === room.hostUid ? room.hostName : room.guestName}`);
  } finally { room.busy = false; }
}

// ══════════ HỦY ══════════
async function doCancel(c) {
  const st = getState(c.userId, c.threadId);
  const room = findSoloRoomByUser(c.userId);
  if (!st && !room) return sendImg(c, await UI.renderNoState());
  if (room && room.status === "battling" && !room.settled) {
    // hủy giữa trận = đầu hàng (không thể né thua bằng huy)
    const opp = room.hostUid === c.userId ? room.guestUid : room.hostUid;
    await c.send("Bạn đã đầu hàng trận Solo.");
    return soloFinish(c, room, { kind: "win", winnerUid: opp, loserUid: c.userId, reason: "surrender" });
  }
  if (room && room.status === "waiting") { room.settled = true; deleteSoloRoom(room.roomId); }
  if (st?.type === "PVE") {
    const sess = st;
    if (sess.s.kind === "gym") { sess.s.over = true; sess.s.result = "lose"; return finishPve(c, sess, ["Bạn rút khỏi Gym — tính là thua."]); }
    sess.s.over = true; sess.s.result = "run"; return finishPve(c, sess, ["Bạn đã rút lui."]);
  }
  clearAllUserStates(c.userId);
  return sendImg(c, await UI.renderCancel(), "Đã hủy");
}

// ══════════ LỆNH ══════════
export default {
  name: "pokemon",
  description: "Pokémon RPG Canvas Neon — pet, upt pet, balo, nhiemvu, thuphuc, gym, map, egg, solo, rank",
  version: "2.0.0",
  author: "HNNP STUDIO",
  group: "game",
  role: 0,
  cooldown: 2,
  aliases: ["pkm", "poke"],
  noPrefix: false,

  async run({ adapter, message, args = [], config }) {
    const c = mkCtx(adapter, message);
    c.prefix = String(config?.botPrefix || config?.prefix || ".");
    if (!c.userId) return c.send("Không xác định được ID người dùng.");
    const a = args.map((x) => norm(x));
    const sub = a[0] || "";
    const rest = a.slice(1);
    try {
      await setDisplayName(c.userId, c.userName).catch(() => {});
      if (!sub || sub === "help" || sub === "huongdan") return showHelp(c);
      if (sub === "huy" || sub === "cancel") return doCancel(c);

      if (sub === "pet") {
        const t = await getTrainer(c.userId);
        if (!t.starterChosen) {
          setState(c.userId, c.threadId, { type: "STARTER_SELECT" });
          return sendImg(c, await UI.renderStarterSelect({ userName: c.userName }), "Chọn Pokémon: reply 1 / 2 / 3");
        }
        const idx = rest[0] ? Number(rest[0]) - 1 : t.collection.findIndex((p) => p.uid === t.activePokemon);
        const pet = t.collection[idx];
        if (!pet) return c.send(`Chọn số từ 1 đến ${t.collection.length}.`);
        return sendImg(c, await UI.renderPetInfo({ pet, trainer: t, userName: c.userName, index: idx + 1 }), pet.name);
      }
      if (sub === "upt" || sub === "upgrade") {
        if (rest[0] && rest[0] !== "pet") return c.send("Dùng: .pokemon upt pet");
        return showUpgrade(c);
      }
      if (sub === "balo" || sub === "bag") {
        if (rest[0] === "item" || rest[0] === "kho") {
          const t = await getTrainer(c.userId);
          if (!t.starterChosen) return needStarter(c);
          return sendImg(c, await UI.renderItems({ trainer: t, userName: c.userName, money: await money(c.userId) }), "Kho vật phẩm Pokémon");
        }
        if (rest[0] === "trang") return showBalo(c, Number(rest[1]) || 1);
        return showBalo(c, 1);
      }
      if (sub === "kho" || sub === "items") {
        const t = await getTrainer(c.userId);
        if (!t.starterChosen) return needStarter(c);
        return sendImg(c, await UI.renderItems({ trainer: t, userName: c.userName, money: await money(c.userId) }), "Kho vật phẩm Pokémon");
      }
      if (sub === "nhiemvu" || sub === "quest" || sub === "mission") return showQuests(c, rest[0] === "trang" ? Number(rest[1]) || 1 : 1);
      if (sub === "map") return showMap(c);
      if (sub === "thuphuc" || sub === "catch") return startWild(c, rest[0]);
      if (sub === "gym") return startGym(c);
      if (sub === "solo") {
        if (rest[0] === "thamgia" || rest[0] === "join") return soloJoin(c);
        const ex = findSoloRoomByUser(c.userId);
        if (ex) return sendImg(c, await UI.renderSoloRoom({ room: ex }), "Phòng Solo hiện tại");
        return soloCreate(c);
      }
      if (sub === "egg" || sub === "trung") {
        if (rest[0] === "ap") {
          const r = await incubateEgg(c.userId, rest[1]);
          if (!r.ok) return c.send(r.message);
          await c.send(`Đã đặt ${EGG_TIERS[r.egg.tier].name} vào ô ấp. Di chuyển / chiến đấu để trứng tiến gần hơn lúc nở.`);
          return showEggs(c);
        }
        if (rest[0] === "no" || rest[0] === "hatch") {
          const t = await getTrainer(c.userId);
          const left = cooldownLeft(t, "hatch");
          if (left > 0) return c.send(`Chờ ${Math.ceil(left / 1000)}s.`);
          const egg = t.eggs[Number(rest[1]) - 1];
          if (!egg) return c.send("Chọn số trứng hợp lệ (xem .pokemon egg).");
          await markCooldown(c.userId, "hatch");
          const r = await hatchEgg(c.userId, egg.id);
          if (!r.ok) return c.send(r.message);
          return sendImg(c, await UI.renderHatch({ pet: r.pet, egg: r.egg }), `Trứng đã nở: ${r.pet.name}!`);
        }
        return showEggs(c);
      }
      if (sub === "dung" || sub === "use") {
        const t = await getTrainer(c.userId);
        const pet = activeOf(t);
        if (!pet) return needStarter(c);
        const item = resolveItem(rest[0]);
        if (!item) return c.send("Không tìm thấy vật phẩm. Xem .pokemon kho");
        if (item.cat === "ball") return c.send("Bóng chỉ dùng khi thu phục trong trận (ball <loại>).");
        if (item.cat === "evo") return c.send("Đá/vật phẩm tiến hóa dùng ở .pokemon upt pet → 3.");
        if (item.cat === "egg") return c.send("Trứng dùng bằng .pokemon egg ap <common|uncommon|rare>.");
        const n = Math.min(item.levelUp ? 20 : 1, Math.max(1, parseInt(rest[1], 10) || 1));
        const texts = [];
        for (let i = 0; i < n; i++) {
          const r = await useItemOnPet(c.userId, pet.uid, item.id);
          if (!r.ok) { if (!texts.length) return c.send(r.message); break; }
          texts.push(r.text);
        }
        return c.send(texts.slice(-3).join("\n"));
      }
      if (sub === "hoi" || sub === "heal") {
        const r = await healAll(c.userId, true);
        if (!r.ok) return c.send(r.message);
        return notice(c, "POKÉMON CENTER", [r.healed ? `Đã hồi phục ${r.healed} Pokémon!` : "Pokémon của bạn đều khỏe mạnh."], "good");
      }
      if (sub === "set" || sub === "active") {
        const t = await getTrainer(c.userId);
        const pet = t.collection[Number(rest[0]) - 1];
        if (!pet) return c.send(`Chọn số từ 1 đến ${t.collection.length}.`);
        if (pet.hp <= 0) return c.send(`${pet.name} đang ngất — hồi phục trước.`);
        await setActivePet(c.userId, pet.uid);
        return c.send(`Đã đặt ${pet.name} làm Pokémon chính.`);
      }
      if (sub === "rank" || sub === "bxh") return sendImg(c, await UI.renderRank({ ranking: await getRanking(10), names: {} }), "Bảng xếp hạng Trainer");
      if (sub === "info" || sub === "me") {
        const t = await getTrainer(c.userId);
        if (!t.starterChosen) return needStarter(c);
        return sendImg(c, await UI.renderProfile({ trainer: t, userName: c.userName, money: (await money(c.userId)) || 0 }), "Hồ sơ Trainer");
      }
      return c.send("Lệnh không hợp lệ. Gõ .pokemon để xem hướng dẫn.");
    } catch (err) {
      console.error("[pokemon run]", err);
      return c.send("Đã xảy ra lỗi. Thử lại hoặc .pokemon huy");
    }
  },

  async onMessage({ adapter, message, config }) {
    const data = message?.data || {};
    const c = mkCtx(adapter, message);
    if (!c.userId) return;
    let content = typeof data.content === "string" ? data.content.trim() : "";
    if (!content && typeof message.body === "string") content = message.body.trim();
    if (!content) return;
    const prefix = String(config?.botPrefix || config?.prefix || ".").trim() || ".";
    if (content.startsWith(prefix) || content.startsWith("%")) return;
    const sess = getState(c.userId, c.threadId);
    if (!sess) return;
    const low = norm(content);
    try {
      switch (sess.type) {
        case "STARTER_SELECT": {
          const n = Number(low);
          if (!Number.isInteger(n) || n < 1 || n > 3) return;
          clearState(c.userId, c.threadId);
          const r = await chooseStarter(c.userId, STARTERS[n - 1]);
          if (!r.ok) return c.send(r.message);
          return sendImg(c, await UI.renderBalo({ trainer: r.trainer, userName: c.userName }), `Bạn đã chọn ${r.pet.name}!`);
        }
        case "BALO": {
          let m;
          if ((m = low.match(/^trang\s+(\d+)$/))) return showBalo(c, Number(m[1]));
          const n = Number(low);
          const t = await getTrainer(c.userId);
          if (!Number.isInteger(n) || n < 1 || n > t.collection.length) return;
          const pet = t.collection[n - 1];
          return sendImg(c, await UI.renderPetInfo({ pet, trainer: t, userName: c.userName, index: n }), `${pet.name} · .pokemon set ${n} để đặt làm chính`);
        }
        case "UPGRADE": return upgradeInput(c, sess, low);
        case "LEARN_PICK": case "LEARN_REPLACE": case "LEARN_CONFIRM": return learnInput(c, sess, low);
        case "EVOLVE_PICK": case "EVOLVE_CONFIRM": return evolveInput(c, sess, low);
        case "QUEST": return questInput(c, sess, low);
        case "MAP": return mapInput(c, sess, low);
        case "PVE": return pveInput(c, sess, low);
        case "SOLO": return soloInput(c, sess, low);
        default: return;
      }
    } catch (err) {
      console.error("[pokemon onMessage]", err);
      try { await c.send("Lỗi xử lý. Dùng .pokemon huy nếu bị kẹt."); } catch { /* */ }
    }
  },
};
