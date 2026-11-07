import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = __dirname;
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const SEEDS_PATH = path.join(DATA_DIR, "seeds.json");
export const LANDS_PATH = path.join(DATA_DIR, "lands.json");
export const CROPS_PATH = path.join(DATA_DIR, "crops.json");
export const MEDICINES_PATH = path.join(DATA_DIR, "medicines.json");
export const TOOLS_PATH = path.join(DATA_DIR, "tools.json");
export const USERS_PATH = path.join(DATA_DIR, "users.json");
export const MARKET_PATH = path.join(DATA_DIR, "market.json");
export const ACHIEVEMENTS_PATH = path.join(DATA_DIR, "achievements.json");
export const IMG_DIR = path.join(DATA_DIR, "images");
export const TEMP_DIR = path.join(DATA_DIR, "temp");

const defaultConfig = {
  enabled: true,
  sessionTtlMs: 300000,
  maxLevel: 50,
  baseExpFarm: 80,
  expGrowthFarm: 1.18,
  maxPlotsPerPlayer: 48,
  harvestCooldownMs: 1500,
  plantCooldownMs: 800,
  sellCooldownMs: 1000,
  rankTop: 15,
  defaultLandId: "land_basic",
  titles: [
    { id: "novice", name: "Nông Dân Tập Sự", minLevel: 1 },
    { id: "gardener", name: "Người Làm Vườn", minLevel: 5 },
    { id: "pro", name: "Nhà Nông Chuyên Nghiệp", minLevel: 15 },
    { id: "tycoon", name: "Đại Gia Nông Trại", minLevel: 30 },
    { id: "legend", name: "Huyền Thoại Nông Nghiệp", minLevel: 45 },
  ],
};

const defaultTools = [
  { id: "tool_hoe_wood", name: "Cuốc Gỗ", type: "hoe", description: "Cuốc gỗ cơ bản. +5% sản lượng thu hoạch.", effect: { yieldBonus: 0.05 }, price: 2500, rarity: "common", unlockLevel: 1 },
  { id: "tool_hoe_iron", name: "Cuốc Sắt", type: "hoe", description: "Cuốc sắt chắc tay. +12% sản lượng thu hoạch.", effect: { yieldBonus: 0.12 }, price: 15000, rarity: "uncommon", unlockLevel: 5 },
  { id: "tool_hoe_gold", name: "Cuốc Vàng", type: "hoe", description: "Cuốc dát vàng quý hiếm. +25% sản lượng thu hoạch.", effect: { yieldBonus: 0.25 }, price: 90000, rarity: "rare", unlockLevel: 15 },
  { id: "tool_bucket_tin", name: "Xô Nước Thiếc", type: "bucket", description: "Xô tưới cây cơ bản. Cây lớn nhanh hơn 5%.", effect: { growthBonus: 0.05 }, price: 2000, rarity: "common", unlockLevel: 1 },
  { id: "tool_bucket_copper", name: "Xô Nước Đồng", type: "bucket", description: "Xô đồng giữ nước tốt. Cây lớn nhanh hơn 10%.", effect: { growthBonus: 0.1 }, price: 12000, rarity: "uncommon", unlockLevel: 5 },
  { id: "tool_bucket_gold", name: "Xô Nước Vàng", type: "bucket", description: "Xô vàng tưới cây mát lành. Cây lớn nhanh hơn 16%.", effect: { growthBonus: 0.16 }, price: 70000, rarity: "rare", unlockLevel: 15 },
  { id: "tool_sprinkler_auto", name: "Máy Tưới Tự Động", type: "sprinkler", description: "Tự động tưới toàn vườn. Cây lớn nhanh hơn 20%.", effect: { growthBonus: 0.2 }, price: 40000, rarity: "rare", unlockLevel: 8 },
  { id: "tool_sprinkler_pro", name: "Máy Tưới Siêu Cấp", type: "sprinkler", description: "Máy tưới năng lượng mặt trời. Cây lớn nhanh hơn 32%.", effect: { growthBonus: 0.32 }, price: 200000, rarity: "epic", unlockLevel: 20 },
];

const defaultSeeds = [
  {
    id: "seed_lua",
    name: "Hạt Lúa",
    description: "Lúa vàng truyền thống, dễ trồng, thu hoạch nhanh.",
    growTimeMs: 5 * 60 * 1000,
    yieldMin: 2,
    yieldMax: 4,
    baseSellPrice: 80,
    expOnPlant: 5,
    expOnHarvest: 15,
    rarity: "common",
    unlockLevel: 1,
    icon: "🌾",
    color: "#F5D76E",
  },
  {
    id: "seed_ca_chua",
    name: "Hạt Cà Chua",
    description: "Cà chua đỏ mọng, giá trị ổn định.",
    growTimeMs: 8 * 60 * 1000,
    yieldMin: 3,
    yieldMax: 5,
    baseSellPrice: 120,
    expOnPlant: 8,
    expOnHarvest: 25,
    rarity: "common",
    unlockLevel: 1,
    icon: "🍅",
    color: "#E74C3C",
  },
  {
    id: "seed_carot",
    name: "Hạt Cà Rốt",
    description: "Cà rốt giòn ngọt, thích hợp đất màu mỡ.",
    growTimeMs: 10 * 60 * 1000,
    yieldMin: 2,
    yieldMax: 6,
    baseSellPrice: 150,
    expOnPlant: 10,
    expOnHarvest: 30,
    rarity: "uncommon",
    unlockLevel: 3,
    icon: "🥕",
    color: "#E67E22",
  },
  {
    id: "seed_dua_hau",
    name: "Hạt Dưa Hấu",
    description: "Dưa hấu to ngọt, cần thời gian dài hơn.",
    growTimeMs: 20 * 60 * 1000,
    yieldMin: 1,
    yieldMax: 3,
    baseSellPrice: 350,
    expOnPlant: 15,
    expOnHarvest: 50,
    rarity: "uncommon",
    unlockLevel: 5,
    icon: "🍉",
    color: "#27AE60",
  },
  {
    id: "seed_nho",
    name: "Hạt Nho",
    description: "Nho tím cao cấp, giá trị cao.",
    growTimeMs: 30 * 60 * 1000,
    yieldMin: 4,
    yieldMax: 8,
    baseSellPrice: 280,
    expOnPlant: 20,
    expOnHarvest: 70,
    rarity: "rare",
    unlockLevel: 8,
    icon: "🍇",
    color: "#8E44AD",
  },
  {
    id: "seed_dao",
    name: "Hạt Đào",
    description: "Đào tiên thơm ngon, hiếm và quý.",
    growTimeMs: 45 * 60 * 1000,
    yieldMin: 2,
    yieldMax: 4,
    baseSellPrice: 600,
    expOnPlant: 30,
    expOnHarvest: 100,
    rarity: "rare",
    unlockLevel: 12,
    icon: "🍑",
    color: "#FF6B9D",
  },
  {
    id: "seed_dua_vang",
    name: "Hạt Dưa Vàng",
    description: "Dưa vàng thần kỳ, nông sản huyền thoại.",
    growTimeMs: 60 * 60 * 1000,
    yieldMin: 1,
    yieldMax: 2,
    baseSellPrice: 1500,
    expOnPlant: 50,
    expOnHarvest: 200,
    rarity: "epic",
    unlockLevel: 20,
    icon: "🍈",
    color: "#F1C40F",
  },
  {
    id: "seed_linh_chi",
    name: "Hạt Linh Chi",
    description: "Linh chi tiên thảo, chỉ dành cho nông dân bậc cao.",
    growTimeMs: 90 * 60 * 1000,
    yieldMin: 1,
    yieldMax: 1,
    baseSellPrice: 5000,
    expOnPlant: 80,
    expOnHarvest: 400,
    rarity: "legendary",
    unlockLevel: 35,
    icon: "🍄",
    color: "#E74C3C",
  },
];

const defaultLands = [
  {
    id: "land_basic",
    name: "Đất Cơ Bản",
    description: "Đất thường dành cho người mới bắt đầu.",
    price: 5000,
    plots: 4,
    unlockLevel: 1,
    growthBonus: 0,
    yieldBonus: 0,
    rarityBonus: 0,
    icon: "🟫",
    color: "#8D5A35",
    privileges: ["Trồng cây cơ bản"],
  },
  {
    id: "land_fertile",
    name: "Đất Màu Mỡ",
    description: "Đất giàu dinh dưỡng, cây phát triển nhanh hơn 15%.",
    price: 25000,
    plots: 6,
    unlockLevel: 5,
    growthBonus: 0.15,
    yieldBonus: 0.1,
    rarityBonus: 0,
    icon: "🟩",
    color: "#27AE60",
    privileges: ["+15% tốc độ phát triển", "+10% sản lượng"],
  },
  {
    id: "land_premium",
    name: "Đất Cao Cấp",
    description: "Đất cao cấp với nhiều ô trồng và hỗ trợ mạnh.",
    price: 80000,
    plots: 10,
    unlockLevel: 12,
    growthBonus: 0.25,
    yieldBonus: 0.2,
    rarityBonus: 0.05,
    icon: "🟨",
    color: "#F39C12",
    privileges: ["+25% tốc độ", "+20% sản lượng", "+5% hiếm"],
  },
  {
    id: "land_magic",
    name: "Đất Thần Kỳ",
    description: "Đất thần kỳ với hiệu ứng đặc biệt và cơ hội tăng giá trị.",
    price: 250000,
    plots: 16,
    unlockLevel: 25,
    growthBonus: 0.4,
    yieldBonus: 0.35,
    rarityBonus: 0.15,
    icon: "🟪",
    color: "#9B59B6",
    privileges: ["+40% tốc độ", "+35% sản lượng", "+15% hiếm", "Hiệu ứng đặc biệt"],
  },
];

const defaultMedicines = [
  {
    id: "med_growth_small",
    name: "Thuốc Tăng Trưởng Nhỏ",
    description: "Rút ngắn 20% thời gian sinh trưởng của 1 cây.",
    type: "growth",
    effect: { reducePercent: 0.2, target: "single" },
    price: 2000,
    rarity: "common",
    unlockLevel: 1,
    icon: "🧪",
    color: "#2ECC71",
  },
  {
    id: "med_growth_large",
    name: "Thuốc Tăng Trưởng Lớn",
    description: "Rút ngắn 40% thời gian sinh trưởng của 1 cây.",
    type: "growth",
    effect: { reducePercent: 0.4, target: "single" },
    price: 6000,
    rarity: "uncommon",
    unlockLevel: 5,
    icon: "⚗️",
    color: "#27AE60",
  },
  {
    id: "med_growth_field",
    name: "Thuốc Tăng Trưởng Toàn Vườn",
    description: "Rút ngắn 15% thời gian sinh trưởng toàn bộ cây đang trồng.",
    type: "growth",
    effect: { reducePercent: 0.15, target: "all" },
    price: 15000,
    rarity: "rare",
    unlockLevel: 10,
    icon: "🌿",
    color: "#1ABC9C",
  },
  {
    id: "med_x2_money",
    name: "Thuốc x2 Tiền",
    description: "Tăng gấp đôi giá bán nông sản thu hoạch từ 1 cây (không cộng dồn).",
    type: "x2money",
    effect: { multiplier: 2, target: "single", durationHarvests: 1 },
    price: 8000,
    rarity: "uncommon",
    unlockLevel: 3,
    icon: "💰",
    color: "#F1C40F",
  },
  {
    id: "med_rare_boost",
    name: "Thuốc Hiếm Hóa",
    description: "Tăng 1 bậc độ hiếm nông sản khi thu hoạch (tối đa epic).",
    type: "special",
    effect: { rarityUp: 1, target: "single", maxRarity: "epic" },
    price: 12000,
    rarity: "rare",
    unlockLevel: 8,
    icon: "✨",
    color: "#9B59B6",
  },
  {
    id: "med_golden",
    name: "Thuốc Vàng Kim",
    description: "Nông sản thu hoạch có hiệu ứng vàng kim, +50% giá bán.",
    type: "special",
    effect: { priceBonus: 0.5, visual: "golden", target: "single" },
    price: 20000,
    rarity: "epic",
    unlockLevel: 15,
    icon: "🌟",
    color: "#F39C12",
  },
];

const defaultMarket = {
  priceVarianceMin: 0.9,
  priceVarianceMax: 1.15,
  refreshIntervalMs: 30 * 60 * 1000,
  lastRefresh: 0,
  multipliers: {},
};

const defaultAchievements = [
  { id: "first_plant", name: "Gieo Hạt Đầu Tiên", description: "Trồng cây lần đầu", condition: { plants: 1 }, rewardExp: 50 },
  { id: "first_harvest", name: "Mùa Vụ Đầu", description: "Thu hoạch lần đầu", condition: { harvests: 1 }, rewardExp: 80 },
  { id: "sell_1000", name: "Buôn Bán Nhỏ", description: "Bán tổng 1.000 xu nông sản", condition: { soldValue: 1000 }, rewardExp: 100 },
  { id: "sell_50000", name: "Thương Gia Nông Sản", description: "Bán tổng 50.000 xu", condition: { soldValue: 50000 }, rewardExp: 300 },
  { id: "plant_50", name: "Tay Nghề", description: "Trồng 50 cây", condition: { plants: 50 }, rewardExp: 200 },
  { id: "harvest_100", name: "Thu Hoạch Siêu Cấp", description: "Thu hoạch 100 lần", condition: { harvests: 100 }, rewardExp: 400 },
  { id: "own_magic_land", name: "Chủ Đất Thần Kỳ", description: "Sở hữu Đất Thần Kỳ", condition: { landId: "land_magic" }, rewardExp: 500 },
  { id: "level_10", name: "Nông Dân Cấp 10", description: "Đạt cấp nông nghiệp 10", condition: { level: 10 }, rewardExp: 250 },
  { id: "level_30", name: "Đại Gia Nông Trại", description: "Đạt cấp nông nghiệp 30", condition: { level: 30 }, rewardExp: 800 },
];

function readJson(fp, fb) {
  try {
    if (!fs.existsSync(fp)) return structuredClone(fb);
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    return raw ?? structuredClone(fb);
  } catch {
    return structuredClone(fb);
  }
}

function writeJson(fp, data) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  try {
    fs.renameSync(tmp, fp);
  } catch {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  }
}

export function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  for (const sub of ["seeds", "crops", "lands", "medicines", "tools", "icons"]) {
    fs.mkdirSync(path.join(IMG_DIR, sub), { recursive: true });
  }
  if (!fs.existsSync(USERS_PATH)) writeJson(USERS_PATH, {});
  if (!fs.existsSync(CONFIG_PATH)) writeJson(CONFIG_PATH, defaultConfig);
  if (!fs.existsSync(SEEDS_PATH)) writeJson(SEEDS_PATH, defaultSeeds);
  if (!fs.existsSync(LANDS_PATH)) writeJson(LANDS_PATH, defaultLands);
  if (!fs.existsSync(MEDICINES_PATH)) writeJson(MEDICINES_PATH, defaultMedicines);
  if (!fs.existsSync(TOOLS_PATH)) writeJson(TOOLS_PATH, defaultTools);
  if (!fs.existsSync(MARKET_PATH)) writeJson(MARKET_PATH, defaultMarket);
  if (!fs.existsSync(ACHIEVEMENTS_PATH)) writeJson(ACHIEVEMENTS_PATH, defaultAchievements);
  if (!fs.existsSync(CROPS_PATH)) {
    // crops derived from seeds for product display
    const crops = defaultSeeds.map((s) => ({
      id: s.id.replace("seed_", "crop_"),
      seedId: s.id,
      name: s.name.replace("Hạt ", ""),
      baseSellPrice: s.baseSellPrice,
      rarity: s.rarity,
      icon: s.icon,
      color: s.color,
    }));
    writeJson(CROPS_PATH, crops);
  }
}

export function getConfig() {
  ensureDataFiles();
  return { ...defaultConfig, ...readJson(CONFIG_PATH, defaultConfig) };
}

export function getSeeds() {
  ensureDataFiles();
  return readJson(SEEDS_PATH, defaultSeeds);
}

export function getLands() {
  ensureDataFiles();
  return readJson(LANDS_PATH, defaultLands);
}

export function getCrops() {
  ensureDataFiles();
  return readJson(CROPS_PATH, []);
}

export function getMedicines() {
  ensureDataFiles();
  return readJson(MEDICINES_PATH, defaultMedicines);
}

export function getTools() {
  ensureDataFiles();
  return readJson(TOOLS_PATH, defaultTools);
}

export function getToolById(id) {
  return getTools().find((t) => t.id === id) || null;
}

export function getMarket() {
  ensureDataFiles();
  return readJson(MARKET_PATH, defaultMarket);
}

export function saveMarket(data) {
  writeJson(MARKET_PATH, data);
}

export function getAchievements() {
  ensureDataFiles();
  return readJson(ACHIEVEMENTS_PATH, defaultAchievements);
}

export function getUsers() {
  ensureDataFiles();
  return readJson(USERS_PATH, {});
}

export function saveUsers(users) {
  writeJson(USERS_PATH, users);
}

export function getSeedById(id) {
  return getSeeds().find((s) => s.id === id) || null;
}

export function getLandById(id) {
  return getLands().find((l) => l.id === id) || null;
}

export function getCropById(id) {
  return getCrops().find((c) => c.id === id) || null;
}

export function getMedicineById(id) {
  return getMedicines().find((m) => m.id === id) || null;
}

export function resolveImage(subdir, id) {
  const dir = path.join(IMG_DIR, subdir);
  if (!fs.existsSync(dir)) return null;
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    const p = path.join(dir, `${id}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export { writeJson, readJson };
