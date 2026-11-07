import fs from "node:fs";
import os from "node:os";
if (process.env.PK_TEST_COPY !== "1") {
  console.error("Test này ghi vào users.json / TienGame / history.json. Chạy trên BẢN SAO của project:\n  cp -r <project> /tmp/pk && cd /tmp/pk && PK_TEST_COPY=1 node tests/pokemon_e2e2.test.mjs");
  process.exit(2);
}
import { execFileSync } from "node:child_process";
const U = new URL("../Core/Commands/data/GIAITRI/Pokemon/users.json", import.meta.url).pathname;
process.env.POKEMON_USERS_PATH = U;
const base = "../Core/Commands/";
const cmd = (await import(base + "pokemon.js")).default;
const S = await import(base + "data/GIAITRI/Pokemon/storage.js");
const { CONFIG } = await import(base + "data/GIAITRI/Pokemon/config.js");
const TG = (await import(base + "data/GIAITRI/TienGame/index.js")).default;
const H = await import(base + "data/GIAITRI/Pokemon/history.js");
const W = await import(base + "data/GIAITRI/Pokemon/world.js");
const SM = await import(base + "data/GIAITRI/Pokemon/state.js");
const Solo = await import(base + "data/GIAITRI/Pokemon/solo.js");
const Q = await import(base + "data/GIAITRI/Pokemon/quests.js");
const Evo = await import(base + "data/GIAITRI/Pokemon/evolution.js");
const Mv = await import(base + "data/GIAITRI/Pokemon/moves.js");
const Assets = await import(base + "data/GIAITRI/Pokemon/assets.js");
const Dex = await import(base + "data/GIAITRI/Pokemon/pokedex.js");
const Eggs = await import(base + "data/GIAITRI/Pokemon/eggs.js");
const Shop = (await import("../Core/Services/ShopService.js")).default;
const OUT = os.tmpdir() + "/pk_e2e_out2/"; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const k of Object.keys(CONFIG.cooldown)) CONFIG.cooldown[k] = 0;
let log = [], n = 0, pass = 0, fail = 0;
const adapter = { sendText: async ({ text }) => log.push({ t: "text", v: text }), sendImage: async ({ imagePath, caption }) => { const f = `${OUT}${String(++n).padStart(3, "0")}.png`; fs.copyFileSync(imagePath, f); log.push({ t: "img", v: caption || "", f }); fs.appendFileSync(OUT + "idx.txt", f.slice(-7) + " " + (caption || "") + "\n"); } };
const config = { botPrefix: "." };
const mk = (uid, text, tid = "G1") => ({ threadId: tid, type: 1, data: { uidFrom: uid, dName: "U" + uid.slice(-2), content: text } });
async function say(uid, text, tid) { log = []; const m = mk(uid, text, tid); if (text.startsWith(".pokemon")) await cmd.run({ adapter, message: m, args: text.split(/\s+/).slice(1), config }); else await cmd.onMessage({ adapter, message: m, config }); return log; }
const last = (l) => l.map((x) => x.v).join(" | ");
const ok = (c, name, extra = "") => { if (c) pass++; else { fail++; console.log("FAIL:", name, extra); } };
const A = "3000000001", B = "3000000002", C = "3000000003";

// ── data integrity
const wv = W.validateWorld(); ok(!wv.errors?.length && (wv.ok !== false), "validateWorld", JSON.stringify(wv).slice(0, 300));
const va = Assets.verifyAssets(); console.log("verifyAssets:", JSON.stringify(va).slice(0, 300));
ok(Q.listQuests().length >= 30, "quest count");

// ── setup A
await say(A, ".pokemon pet"); await say(A, "2"); // charmander
await S.mutateTrainer(A, (t) => { t.exp = 500000; });
// locked area: travel far
const idx = (id) => W.NODES.findIndex((x) => x.id === id) + 1;
const locked = W.NODES.find((x) => (x.unlock?.badges || 0) >= 3);
await say(A, ".pokemon map"); let l = await say(A, String(idx(locked.id))); ok(/khoá|khóa|Cần/i.test(last(l)), "locked area refused", last(l));
// habitat: spawn only valid species per node
let bad = 0; for (const nd of W.NODES) for (const m of W.availableMethods(nd.id)) for (let i = 0; i < 40; i++) { const s = W.spawnWild(nd.id, m); if (!W.wildList(nd.id, m).some((e) => e.s === s.species)) bad++; }
ok(bad === 0, "spawn in habitat");
// shop → inventory → use
await TG.addMoney(A, 1000000, { description: "test" });
const p = Shop.getProductsByCategory("pokemon"); ok(p.length >= 15, "shop pokemon products", String(p.length));
const ball = p.find((x) => x.itemIdInInventory === "pokeball");
const b0 = await TG.getBalance(A);
let r = await Shop.buyShopItem(A, ball.id, 5); ok(r.success, "buy ball", JSON.stringify(r).slice(0, 100));
ok((await S.getTrainer(A)).inventory.pokeball >= 5, "ball in pokemon inventory");
ok((b0 - (await TG.getBalance(A))) === ball.price * 5, "price charged");
r = await Shop.buyShopItem(A, ball.id, 500); ok(!r.success, "stack cap refused", r.message);
const cand = p.find((x) => x.itemIdInInventory === "rare_candy"); r = await Shop.buyShopItem(A, cand.id, 2); ok(r.success, "buy candy");
const gen = await import(base + "../Services/InventoryService.js").catch(() => null);

// ── item duplication race
await S.mutateTrainer(A, (t) => { t.inventory.potion = 1; t.collection[0].hp = 1; });
await Promise.all([1, 2, 3, 4].map(() => S.useItemOnPet(A, S.getTrainer ? (async () => (await S.getTrainer(A)).collection[0].uid)() : null).catch(() => null)));
// proper:
const uid0 = (await S.getTrainer(A)).collection[0].uid;
await S.mutateTrainer(A, (t) => { t.inventory.potion = 1; t.collection[0].hp = 1; });
const res = await Promise.all([1, 2, 3, 4, 5].map(() => S.useItemOnPet(A, uid0, "potion")));
ok(res.filter((x) => x.ok).length === 1, "potion used once", JSON.stringify(res.map((x) => x.ok)));
ok(((await S.getTrainer(A)).inventory.potion || 0) === 0, "potion 0");

// ── moves replace flow
await S.mutateTrainer(A, (t) => { const p = t.collection[0]; p.level = 40; p.exp = Dex.expForSpeciesLevel(p.species, 40); Dex.refreshStats(p); p.moves = p.moves.slice(0, 4); });
let t = await S.getTrainer(A); let pet = t.collection[0];
while (pet.moves.length < 4) { const lr = Mv.getLearnable(pet); if (!lr.length) break; await S.learnPetMove(A, pet.uid, lr[0].id); pet = (await S.getTrainer(A)).collection[0]; }
console.log("moves:", pet.moves);
const learn = Mv.getLearnable(pet); console.log("learnable", learn.length);
await say(A, ".pokemon upt pet"); l = await say(A, "2");
if (learn.length) {
  l = await say(A, "1"); ok(SM.getState(A, "G1")?.type === "LEARN_REPLACE", "replace stage", SM.getState(A, "G1")?.type);
  await say(A, "5"); ok(SM.getState(A, "G1")?.type === "LEARN_REPLACE", "bad replace idx ignored");
  const rid = pet.moves[1]; await say(A, "2"); ok(SM.getState(A, "G1")?.type === "LEARN_CONFIRM", "confirm stage");
  await say(A, "0"); ok(!SM.getState(A, "G1"), "cancel ok"); ok(((await S.getTrainer(A)).collection[0].moves.includes(rid)), "move kept after cancel");
  await say(A, ".pokemon upt pet"); await say(A, "2"); await say(A, "1"); await say(A, "2"); await say(A, "1");
  const after = (await S.getTrainer(A)).collection[0]; ok(!after.moves.includes(rid) && after.moves.includes(learn[0].id) && after.moves.length === 4, "replace done", JSON.stringify(after.moves));
}
// ── evolution: level, branching, item, friendship/time
const mk1 = (sp, lv, extra = {}) => Object.assign(Dex.createInstance(sp, lv), extra);
let ev = Evo.getEvolutionOptions(mk1("eevee", 20), { fire_stone: 1 }); console.log("eevee opts", ev.map((o) => o.to + ":" + o.ready));
ok(ev.length >= 3, "eevee branches");
ev = Evo.getEvolutionOptions(mk1("pikachu", 10), {}); ok(ev.length === 1 && !ev[0].ready, "pikachu needs stone");
ev = Evo.getEvolutionOptions(mk1("pikachu", 10), { thunder_stone: 1 }); ok(ev[0].ready, "pikachu ready with stone");
ev = Evo.getEvolutionOptions(mk1("charmander", 15), {}); ok(!ev[0].ready, "level gate 15<16");
ev = Evo.getEvolutionOptions(mk1("charmander", 16), {}); ok(ev[0].ready, "level gate 16");
ev = Evo.getEvolutionOptions(mk1("kadabra", 20), {}); ok(ev[0].reqs.some(r => /Linking|trao/i.test(r.text)), "trade evo uses cord");
// evolve not allowed w/o item, item consumed
await S.mutateTrainer(A, (t) => { t.collection.push(Dex.createInstance("pikachu", 10)); t.inventory.thunder_stone = 1; });
t = await S.getTrainer(A); const pk = t.collection.find((x) => x.species === "pikachu");
let e1 = await S.evolvePet(A, pk.uid, "raichu"); ok(e1.ok, "pikachu→raichu", e1.message); ok(((await S.getTrainer(A)).inventory.thunder_stone || 0) === 0, "stone consumed");
e1 = await S.evolvePet(A, pk.uid, "raichu"); ok(!e1.ok, "no re-evolve");
// ── eggs: tier gate, no pokemon before hatch, slots, anti spam
await S.mutateTrainer(A, (t) => { t.inventory.egg_rare = 2; t.inventory.egg_common = 5; });
let er = await S.incubateEgg(A, "rare"); ok(er.ok, "incubate rare");
const cnt0 = (await S.getTrainer(A)).collection.length;
r = await S.hatchEgg(A, er.egg.id); ok(!r.ok && (await S.getTrainer(A)).collection.length === cnt0, "no hatch early");
await S.mutateTrainer(A, (t) => { t.eggs[0].steps = 99999; });
r = await S.hatchEgg(A, er.egg.id); ok(!r.ok, "rare needs badges", r.message);
for (let i = 0; i < 3; i++) await S.incubateEgg(A, "common");
t = await S.getTrainer(A); ok(t.eggs.length <= CONFIG.trainer.eggSlots, "egg slots cap", String(t.eggs.length));
// ── gym
await S.mutateTrainer(A, (t) => { t.position = "pewter"; t.visited.push("pewter"); const p = t.collection[0]; p.level = 60; p.exp = Dex.expForSpeciesLevel(p.species, 60); Dex.refreshStats(p); p.hp = p.maxHp; p.moves = ["flamethrower", "slash", "ember", "scratch"].filter((m) => Dex.getMove(m)); });
l = await say(A, ".pokemon gym"); ok(l.some((x) => x.t === "img"), "gym start", last(l));
for (let i = 0; i < 40 && SM.getState(A, "G1"); i++) await say(A, "1");
t = await S.getTrainer(A); console.log("badges", t.badges, "gymWins", t.stats.gymWins);
ok(t.badges.includes("boulder"), "badge awarded");
l = await say(A, ".pokemon gym"); for (let i = 0; i < 40 && SM.getState(A, "G1"); i++) await say(A, "1");
t = await S.getTrainer(A); ok(t.badges.filter((b) => b === "boulder").length === 1 && t.stats.gymWins === 1, "badge not duplicated");
// lose gym with weak pet
await S.mutateTrainer(A, (t) => { t.collection.forEach((p) => { p.level = 2; p.exp = Dex.expForSpeciesLevel(p.species, 2); Dex.refreshStats(p); p.hp = p.maxHp; }); });
await say(A, ".pokemon gym"); for (let i = 0; i < 60 && SM.getState(A, "G1"); i++) await say(A, "1");
t = await S.getTrainer(A); ok(!SM.getState(A, "G1") && t.collection.every((p) => p.hp === 0 || p.hp <= p.maxHp), "gym lost ends");
l = await say(A, ".pokemon thuphuc"); ok(/ngất|Center|hoi/.test(last(l)) || SM.getState(A, "G1"), "weak state handled", last(l).slice(0, 80));
await say(A, ".pokemon huy");
// ── solo draw/cancel/error: no double pay, recovery
for (const u of [B, C]) { await say(u, ".pokemon pet"); await say(u, "1"); }
const bb = await TG.getBalance(B), bc = await TG.getBalance(C);
await say(B, ".pokemon solo"); await say(C, ".pokemon solo thamgia");
const room = SM.findSoloRoomByUser(B);
const out = await Solo.settleSolo(room, { kind: "cancel" }); ok(out.ok && !out.rewarded, "cancel no reward");
ok((await TG.getBalance(B)) === bb, "no money on cancel");
SM.deleteSoloRoom(room.roomId); SM.clearAllUserStates(B); SM.clearAllUserStates(C);
// crash recovery: match recorded but unpaid
const mid = "solo_crash_test"; 
H.recordMatch({ matchId: mid, at: Date.now(), kind: "win", players: [{ uid: B, name: "b", result: "win", exp: 500, money: 3333, petUid: null, petExp: 0, applied: false }, { uid: C, name: "c", result: "lose", exp: 150, money: 444, petUid: null, petExp: 0, applied: false }] });
const rc = await Solo.recoverPendingMatches(); ok(rc === 1, "recovered 1", String(rc));
ok((await TG.getBalance(B)) - bb === 3333 && (await TG.getBalance(C)) - bc === 444, "recovery paid exact roll");
await Solo.recoverPendingMatches(); ok((await TG.getBalance(B)) - bb === 3333, "recovery idempotent");
// direct apply twice
const e0 = (await S.getTrainer(B)).exp;
await S.applySoloOutcome(B, { result: "win", exp: 500, moneyValue: 1000, matchId: mid }); ok((await S.getTrainer(B)).exp === e0, "applySoloOutcome idempotent");
// ── anti spam: concurrent solo join
await say(B, ".pokemon solo");
const [j1, j2] = await Promise.all([say(C, ".pokemon solo thamgia"), say("3000000004", ".pokemon solo thamgia")]);
await say("3000000004", ".pokemon pet");
console.log("concurrent join:", last(j1).slice(0, 50), "||", last(j2).slice(0, 50));
await say(B, ".pokemon huy");
// ── persistence across restart (new process)
const before = JSON.parse(fs.readFileSync(U, "utf8"));
const chk = execFileSync("node", ["-e", `process.env.POKEMON_USERS_PATH=${JSON.stringify(U)};import("${new URL(base + "data/GIAITRI/Pokemon/storage.js", import.meta.url).href}").then(async m=>{const t=await m.getTrainer("${A}");console.log(JSON.stringify({n:t.collection.length,b:t.badges,e:t.exp,q:Object.values(t.quests).filter(x=>x.claimed).length}));process.exit(0)})`], { encoding: "utf8" }).trim().split("\n").pop();
const rs = JSON.parse(chk); t = await S.getTrainer(A);
ok(rs.n === t.collection.length && rs.e === t.exp && rs.b.length === t.badges.length, "restart persistence", chk);
// ── migration from old format
if (fs.existsSync("/tmp/pk_old_users.json")) {
  const old = JSON.parse(fs.readFileSync("/tmp/pk_old_users.json", "utf8"));
  const tmp = U + ".migtest"; fs.copyFileSync("/tmp/pk_old_users.json", tmp);
  const out = execFileSync("node", ["-e", `process.env.POKEMON_USERS_PATH=${JSON.stringify(tmp)};import("${new URL(base + "data/GIAITRI/Pokemon/storage.js", import.meta.url).href}").then(async m=>{const a=m._readAllForTests();const ids=Object.keys(a);let r={};for(const id of ids){const t=await m.getTrainer(id);r[id]={n:t.collection.length,exp:t.exp,inv:t.inventory};}console.log(JSON.stringify(r));process.exit(0)})`], { encoding: "utf8" }).trim().split("\n").pop();
  const mig = JSON.parse(out);
  for (const id of Object.keys(old)) ok(mig[id] && mig[id].n >= (old[id].collection?.length || 0) && mig[id].exp >= (old[id].exp || 0), "migration keeps data " + id, JSON.stringify(mig[id]).slice(0, 120));
  ok(fs.readdirSync(new URL("../Core/Commands/data/GIAITRI/Pokemon", import.meta.url).pathname).some((f) => f.includes("backup")), "backup exists");
}
// images mapping
const missing = Object.keys((await import(base + "data/db.js").catch(() => ({ SPECIES: {} }))).SPECIES || {});
console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(0);
