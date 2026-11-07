/**
 * Tải & chuẩn hóa ảnh Pokémon vào assets/pokemon (cần `sharp`):  node fetch_assets.mjs
 * Nguồn: PokeAPI/sprites (GitHub). Ảnh là tác phẩm của Nintendo/Game Freak/The Pokémon Company — chỉ dùng cho bot fan, phi thương mại.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(process.argv[2] ? path.resolve(process.argv[2]) + "/" : import.meta.url);
const sharp = require("sharp");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..", "assets", "pokemon");
const species = JSON.parse(fs.readFileSync(path.join(__dirname, "../db/species.json"), "utf8"));
const RAW = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";
const ITEMS = ["poke-ball","great-ball","ultra-ball","master-ball","potion","super-potion","hyper-potion","max-potion","full-restore","revive","max-revive","rare-candy","oran-berry","sitrus-berry","pecha-berry","cheri-berry","fire-stone","water-stone","thunder-stone","leaf-stone","moon-stone","linking-cord","exp-share","lucky-egg","antidote","full-heal"];
async function dl(url) { for (let i = 0; i < 4; i++) { try { const r = await fetch(url); if (r.status === 404) return null; if (!r.ok) throw new Error(r.status); return Buffer.from(await r.arrayBuffer()); } catch (e) { if (i === 3) throw e; } } }
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }
const missing = [];
await pool(Object.values(species), 8, async (s) => {
  const out = path.join(ROOT, "species", `${s.id}.png`);
  if (fs.existsSync(out)) return;
  const buf = await dl(`${RAW}/pokemon/other/official-artwork/${s.dex}.png`);
  if (!buf) return missing.push(s.id);
  await sharp(buf).trim().resize({ width: 360, height: 360, fit: "inside" }).png({ compressionLevel: 9 }).toFile(out);
});
await pool(ITEMS, 6, async (id) => {
  const out = path.join(ROOT, "items", `${id}.png`);
  if (fs.existsSync(out)) return;
  const buf = await dl(`${RAW}/items/${id}.png`);
  if (!buf) return missing.push("item:" + id);
  await sharp(buf).trim().resize({ width: 160, height: 160, fit: "inside", kernel: "nearest" }).png().toFile(out);
});
const BADGES = ["boulder", "cascade", "thunder", "rainbow", "soul", "marsh", "volcano", "earth"];
fs.mkdirSync(path.join(ROOT, "ui", "badges"), { recursive: true });
await pool(BADGES.map((id, i) => [id, i + 1]), 4, async ([id, n]) => {
  const out = path.join(ROOT, "ui", "badges", `${id}.png`);
  if (fs.existsSync(out)) return;
  const buf = await dl(`${RAW}/badges/${n}.png`);
  if (!buf) return missing.push("badge:" + id);
  await sharp(buf).resize({ width: 160, height: 160, fit: "inside", kernel: "nearest" }).png().toFile(out);
});
fs.writeFileSync(path.join(ROOT, "MISSING.txt"), missing.join("\n") + "\n");
console.log("missing:", missing);
