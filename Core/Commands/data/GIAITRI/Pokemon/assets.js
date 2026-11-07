/**
 * Hệ thống asset trung tâm:  assets/pokemon/{species,items,eggs,maps,effects,ui}
 * Mọi màn hình lấy ảnh qua file này (cache + fallback + báo thiếu). Không dùng emoji/placeholder giả danh ảnh chính thức.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadImage } from "canvas";
import { SPECIES } from "./db.js";
import { ITEMS } from "./items.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ASSET_ROOT = process.env.POKEMON_ASSET_DIR || path.resolve(__dirname, "..", "..", "..", "..", "..", "assets", "pokemon");
export const DIRS = { species: "species", items: "items", eggs: "eggs", maps: "maps", effects: "effects", ui: "ui" };

const cache = new Map();
const warned = new Set();

export function assetPath(kind, name) {
  return path.join(ASSET_ROOT, DIRS[kind] || kind, name);
}
export function speciesFile(id) {
  return assetPath("species", `${id}.png`);
}
export function itemFile(itemId) {
  const it = ITEMS[itemId];
  return it?.sprite ? assetPath("items", `${it.sprite}.png`) : null;
}
export function badgeFile(badgeId) {
  return assetPath("ui", path.join("badges", `${badgeId}.png`));
}
export function eggFile(tier) {
  return assetPath("eggs", `${tier}.png`);
}

async function load(file, label) {
  if (!file) return null;
  if (cache.has(file)) return cache.get(file);
  let img = null;
  if (fs.existsSync(file)) {
    try { img = await loadImage(file); } catch (e) { if (!warned.has(file)) { warned.add(file); console.error(`[pokemon assets] ảnh lỗi ${label}:`, e.message); } }
  } else if (!warned.has(file)) {
    warned.add(file);
    console.warn(`[pokemon assets] THIẾU ảnh ${label}: ${file}`);
  }
  cache.set(file, img);
  return img;
}
export const loadSpecies = (id) => load(speciesFile(id), `species/${id}`);
export const loadItem = (id) => load(itemFile(id), `items/${id}`);
export const loadBadge = (id) => load(badgeFile(id), `badge/${id}`);
export const loadEgg = (tier) => load(eggFile(tier), `egg/${tier}`);
export const loadMapBase = () => load(assetPath("maps", "kanto_base.png"), "maps/kanto_base");
export const loadEffect = (name) => load(assetPath("effects", `${name}.png`), `effects/${name}`);

/** Báo cáo độ phủ asset (dùng trong test & README) */
export function verifyAssets() {
  const missing = { species: [], items: [], eggs: [], maps: [], badges: [] };
  for (const id of Object.keys(SPECIES)) if (!fs.existsSync(speciesFile(id))) missing.species.push(id);
  for (const it of Object.values(ITEMS)) {
    if (it.sprite && !fs.existsSync(itemFile(it.id))) missing.items.push(it.id);
  }
  for (const tier of ["common", "uncommon", "rare"]) if (!fs.existsSync(eggFile(tier))) missing.eggs.push(tier);
  if (!fs.existsSync(assetPath("maps", "kanto_base.png"))) missing.maps.push("kanto_base");
  for (const b of ["boulder", "cascade", "thunder", "rainbow", "soul", "marsh", "volcano", "earth"]) if (!fs.existsSync(badgeFile(b))) missing.badges.push(b);
  return missing;
}
