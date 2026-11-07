import fs from "node:fs";
import os from "node:os";
if (process.env.PK_TEST_COPY !== "1") {
  console.error("Test này ghi vào users.json / TienGame / history.json. Chạy trên BẢN SAO của project:\n  cp -r <project> /tmp/pk && cd /tmp/pk && PK_TEST_COPY=1 node tests/pokemon_e2e.test.mjs");
  process.exit(2);
}
process.env.POKEMON_USERS_PATH = new URL("../Core/Commands/data/GIAITRI/Pokemon/users.json", import.meta.url).pathname;
const base = "../Core/Commands/";
const cmd = (await import(base + "pokemon.js")).default;
const S = await import(base + "data/GIAITRI/Pokemon/storage.js");
const { CONFIG } = await import(base + "data/GIAITRI/Pokemon/config.js");
const TG = (await import(base + "data/GIAITRI/TienGame/index.js")).default;
const H = await import(base + "data/GIAITRI/Pokemon/history.js");
const W = await import(base + "data/GIAITRI/Pokemon/world.js");
const OUT = os.tmpdir() + "/pk_e2e_out/"; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const k of Object.keys(CONFIG.cooldown)) CONFIG.cooldown[k] = 0;
let log = [], n = 0, pass = 0, fail = 0;
const adapter = {
  sendText: async ({ text }) => log.push({ t: "text", v: text }),
  sendImage: async ({ imagePath, caption }) => { const f = `${OUT}${String(++n).padStart(3, "0")}.png`; fs.copyFileSync(imagePath, f); log.push({ t: "img", v: caption || "", f }); fs.appendFileSync(OUT+"idx.txt", f.slice(-7)+" "+(caption||"")+"\n"); },
};
const config = { botPrefix: "." };
const mk = (uid, text, group = true) => ({ threadId: group ? "G1" : "U" + uid, type: group ? 1 : 0, data: { uidFrom: uid, dName: "User" + uid.slice(-2), content: text } });
async function say(uid, text) {
  log = [];
  const m = mk(uid, text);
  if (text.startsWith(".pokemon")) await cmd.run({ adapter, message: m, args: text.split(/\s+/).slice(1), config });
  else await cmd.onMessage({ adapter, message: m, config });
  return log;
}
const last = (l) => l.map((x) => x.v).join(" | ");
function ok(c, name, extra = "") { if (c) { pass++; } else { fail++; console.log("FAIL:", name, extra); } }
const A = "1111111111", B = "2222222222";

// help / starter
let l = await say(A, ".pokemon"); ok(l.some((x) => x.t === "img"), "help img");
l = await say(A, ".pokemon balo"); ok(/CHƯA|Chưa|chưa/i.test(last(l)) || l.some(x=>x.t==="img"), "balo pre-starter");
l = await say(A, ".pokemon thuphuc"); ok(l.length, "wild pre-starter");
l = await say(A, ".pokemon pet"); ok(l.some((x) => x.t === "img"), "starter select");
l = await say(A, "hello"); ok(l.length === 0, "ignore chat");
l = await say(A, "9"); ok(l.length === 0, "ignore bad number");
l = await say(A, "1"); ok(l.some((x) => /Bulbasaur/.test(x.v)), "choose starter", last(l));
l = await say(A, ".pokemon pet"); ok(l.some((x) => x.t === "img"), "pet info");
l = await say(B, ".pokemon pet"); l = await say(B, "2");
// double choose
l = await say(B, ".pokemon pet"); ok(l.some((x) => x.t === "img"), "pet after");
let t = await S.getTrainer(A); ok(t.collection.length === 1 && t.starterChosen, "one starter");

// quests
l = await say(A, ".pokemon nhiemvu"); ok(l.some((x) => x.t === "img"), "quest img");
const bal0 = await TG.getBalance(A);
l = await say(A, "1"); log.forEach(() => 0);
const bal1 = await TG.getBalance(A);
ok(bal1 > bal0 || /Chưa|Khoá|khoá/.test(last(l)), "claim 1", last(l) + bal0 + "/" + bal1);
// concurrent claim: quest 1 again x5
const bn = await TG.getBalance(A);
await Promise.all([1,2,3,4,5].map(() => say(A, "1")));
ok((await TG.getBalance(A)) === bn, "no double claim");
l = await say(A, "tatca");

// map travel
l = await say(A, ".pokemon map"); ok(l.some((x) => x.t === "img"), "map img");
const idx = (id) => W.NODES.findIndex((x) => x.id === id) + 1;
l = await say(A, "xem " + idx("pewter")); ok(l.some(x=>x.t==="img"), "map view");
l = await say(A, String(idx("pewter"))); // locked? 
console.log("travel pewter:", last(l).slice(0, 120));
const pal = W.getNode("pallet"); const nb = W.neighbors("pallet");
console.log("neighbors pallet", nb);
l = await say(A, ".pokemon map"); l = await say(A, String(idx(nb[0]))); console.log("travel1:", last(l).slice(0,100));

// wild battle loops
async function fightWild(uid, rounds = 60) {
  let res = "";
  for (let i = 0; i < rounds; i++) {
    const s0 = await say(uid, i % 7 === 3 ? "ball" : "1");
    res = last(s0);
    if (/Kết thúc trận|THU PHỤC|Đã thêm/.test(res) || !require_state(uid)) break;
  }
  return res;
}
const SM = await import(base + "data/GIAITRI/Pokemon/state.js");
const require_state = (uid) => SM.getState(uid, "G1");
await S.addItem(A, "pokeball", 10);
l = await say(A, ".pokemon thuphuc");
console.log("wild:", last(l).slice(0, 120));
ok(l.some((x) => x.t === "img"), "wild start");
let rr = await fightWild(A);
ok(!require_state(A), "wild ended", rr);
t = await S.getTrainer(A); console.log("after wild: pets", t.collection.map((p) => p.name + p.level), "stats", JSON.stringify(t.stats));

// heal, dung
l = await say(A, ".pokemon hoi"); console.log("hoi:", last(l).slice(0, 80));
l = await say(A, ".pokemon dung potion"); console.log("dung:", last(l).slice(0,80));

// upgrade flow
await S.addExp(A, 100000); await S.addItem(A, "rare_candy", 10);
l = await say(A, ".pokemon upt pet"); ok(l.some(x=>x.t==="img"), "upt img");
l = await say(A, "1"); console.log("train:", last(l).slice(0,100));
l = await say(A, "4"); console.log("candy:", last(l).slice(0,100));
for (let i=0;i<6;i++) await say(A, "4");
l = await say(A, "2"); console.log("learn list:", l.length, last(l).slice(0, 80));
l = await say(A, "1"); console.log("learn pick:", last(l).slice(0,80));
let st = SM.getState(A, "G1"); console.log("state after pick:", st?.type);
l = await say(A, st?.type === "LEARN_REPLACE" ? "1" : "1");
st = SM.getState(A, "G1"); console.log("state:", st?.type);
l = await say(A, "1"); console.log("learn confirm:", last(l).slice(0,100));
l = await say(A, ".pokemon upt pet"); l = await say(A, "3"); console.log("evo:", last(l).slice(0,120));
for (let i=0;i<3;i++) await say(A, "4"); await S.addExp(A, 0);
l = await say(A, ".pokemon upt pet"); l = await say(A, "3"); st = SM.getState(A, "G1"); console.log("evo state:", st?.type, last(l).slice(0,100));
if (st?.type === "EVOLVE_CONFIRM") { l = await say(A, "1"); console.log("evolved:", last(l).slice(0,100)); }

// eggs
await S.addItem(A, "egg_common", 2);
l = await say(A, ".pokemon egg ap common"); console.log("egg ap:", last(l).slice(0,80));
l = await say(A, ".pokemon egg no 1"); console.log("egg no early:", last(l).slice(0,100));
await S.mutateTrainer(A, (x) => { x.eggs[0].steps = 99999; });
l = await say(A, ".pokemon egg no 1"); ok(l.some(x=>x.t==="img"), "hatch", last(l));
l = await say(A, ".pokemon egg no 1"); ok(!l.some(x=>x.t==="img"), "no double hatch");

// solo
const startBalA = await TG.getBalance(A), startBalB = await TG.getBalance(B);
await S.mutateTrainer(B, (x)=>{ x.starterChosen = true; });
l = await say(A, ".pokemon solo"); ok(l.some(x=>x.t==="img"), "solo room");
l = await say(A, ".pokemon solo"); // existing room
l = await say(B, ".pokemon solo thamgia"); ok(l.some(x=>x.t==="img"), "join", last(l));
const room = SM.findSoloRoomByUser(A);
let g = 0, final = [];
while (SM.findSoloRoomByUser(A) && g++ < 200) {
  const cur = SM.findSoloRoomByUser(A); if (!cur) break;
  const who = cur.turn; const r = await say(who, String(1 + (g % 2)));
  if (r.some(x=>/THẮNG|THUA|HÒA/.test(x.v))) final = r;
}
console.log("solo done in", g, "msgs:", last(final).slice(0,200));
const mA = await TG.getBalance(A) - startBalA, mB = await TG.getBalance(B) - startBalB;
console.log("solo money delta", mA, mB);
ok(mA > 0 && mB > 0, "both paid");
const hist = H.matchesOf ? H.matchesOf(A) : [];
ok(hist.length === 1, "history 1", JSON.stringify(hist).slice(0,100));
// double settle
const { settleSolo } = await import(base + "data/GIAITRI/Pokemon/solo.js");
const r2 = await settleSolo(room, { kind: "draw" }); ok(r2.already, "settle twice blocked");
const r3 = await settleSolo({ ...room, settled: false }, { kind: "draw" }); ok(r3.duplicate, "dup match id blocked");
ok((await TG.getBalance(A)) - startBalA === mA, "no extra money");
// solo surrender + huy
l = await say(A, ".pokemon solo"); l = await say(B, ".pokemon solo thamgia");
l = await say(B, ".pokemon huy"); console.log("huy mid-solo:", last(l).slice(0,120));
ok(!SM.findSoloRoomByUser(A), "room closed");
l = await say(A, ".pokemon solo"); l = await say(A, ".pokemon huy"); ok(!SM.findSoloRoomByUser(A), "waiting room cancelled");
// huy no state
l = await say(A, ".pokemon huy"); ok(l.some(x=>x.t==="img"), "huy no state");
// rank, info
l = await say(A, ".pokemon rank"); ok(l.some(x=>x.t==="img"), "rank");
l = await say(A, ".pokemon info"); ok(l.some(x=>x.t==="img"), "info");
l = await say(A, ".pokemon balo item"); ok(l.some(x=>x.t==="img"), "kho");
l = await say(A, ".pokemon balo"); l = await say(A, "1"); ok(l.some(x=>x.t==="img"), "balo pick");
l = await say(A, ".pokemon set 1"); l = await say(A, ".pokemon foo"); ok(/không hợp lệ/.test(last(l)), "bad sub");
// gym
l = await say(A, ".pokemon gym"); console.log("gym:", last(l).slice(0,120));
console.log(`PASS ${pass} FAIL ${fail}`);
process.exit(0);
