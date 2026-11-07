import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = __dirname;
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const FISH_PATH = path.join(DATA_DIR, "fish.json");
export const MAPS_PATH = path.join(DATA_DIR, "maps.json");
export const RODS_PATH = path.join(DATA_DIR, "rods.json");
export const BAITS_PATH = path.join(DATA_DIR, "baits.json");
export const USERS_PATH = path.join(DATA_DIR, "users.json");
export const FISH_IMG_DIR = path.join(DATA_DIR, "fish");
export const TEMP_DIR = path.join(DATA_DIR, "temp");
const defaultConfig = { enabled:true,cooldownMs:8000,successRate:0.82,baseExpPerCatch:100,defaultRodId:"rod_tre",defaultBaitId:"bait_giun",defaultMapId:"ho_be",defaultBaitAmount:9,failConsumeBait:true,rarityWeights:{common:55,uncommon:25,rare:12,epic:5.5,legendary:2,mythic:0.5},sizePriceFactor:1,maxLevel:50,baseExpFishing:100,expGrowthFishing:1.2,rankTop:15,sessionTtlMs:300000 };
function readJson(fp, fb) { try { if (!fs.existsSync(fp)) return structuredClone(fb); return JSON.parse(fs.readFileSync(fp,"utf8")) ?? structuredClone(fb); } catch { return structuredClone(fb); } }
function writeJson(fp, data) { fs.mkdirSync(path.dirname(fp),{recursive:true}); const tmp=`${fp}.${process.pid}.tmp`; fs.writeFileSync(tmp,JSON.stringify(data,null,2),"utf8"); try{fs.renameSync(tmp,fp);}catch{fs.writeFileSync(fp,JSON.stringify(data,null,2),"utf8");} }
export function ensureDataFiles() { fs.mkdirSync(DATA_DIR,{recursive:true}); fs.mkdirSync(FISH_IMG_DIR,{recursive:true}); fs.mkdirSync(TEMP_DIR,{recursive:true}); for (const r of ["common","uncommon","rare","epic","legendary","mythic"]) fs.mkdirSync(path.join(FISH_IMG_DIR,r),{recursive:true}); if (!fs.existsSync(USERS_PATH)) writeJson(USERS_PATH,{}); if (!fs.existsSync(CONFIG_PATH)) writeJson(CONFIG_PATH,defaultConfig); }
export function getConfig() { ensureDataFiles(); return { ...defaultConfig, ...readJson(CONFIG_PATH, defaultConfig) }; }
export function getFishList() { return readJson(FISH_PATH, []); }
export function getMaps() { return readJson(MAPS_PATH, []); }
export function getRods() { return readJson(RODS_PATH, []); }
export function getBaits() { return readJson(BAITS_PATH, []); }
export function getUsers() { ensureDataFiles(); return readJson(USERS_PATH, {}); }
export function saveUsers(users) { writeJson(USERS_PATH, users); }
export function safeNumber(v, fb=0) { const n=Number(v); return Number.isFinite(n)?n:fb; }
export function resolveFishImage(fish) {
  if (!fish) return null;
  const rel = fish.image || `${fish.rarity||"common"}/${fish.id}.png`;
  const full = path.join(FISH_IMG_DIR, rel);
  if (fs.existsSync(full)) return full;
  const rarDir = path.join(FISH_IMG_DIR, fish.rarity||"common");
  if (fs.existsSync(rarDir)) { const files=fs.readdirSync(rarDir).filter(f=>/\.(png|jpg|jpeg|webp)$/i.test(f)); if(files.length) return path.join(rarDir,files[0]); }
  for (const r of ["common","uncommon","rare","epic","legendary","mythic"]) { const d=path.join(FISH_IMG_DIR,r); if(!fs.existsSync(d)) continue; const files=fs.readdirSync(d).filter(f=>/\.(png|jpg|jpeg|webp)$/i.test(f)); if(files.length) return path.join(d,files[0]); }
  return null;
}
