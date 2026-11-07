/**
 * Danh mục vật phẩm Pokémon (một nguồn duy nhất cho Shop, balo, hiệu ứng, ảnh).
 * id = khoá trong trainer.inventory (giữ id cũ: pokeball, greatball, ultraball, masterball, rare_candy).
 * official=true: vật phẩm có trong game chính thức. official=false: vật phẩm riêng của project (ghi rõ).
 */
export const ITEMS = {
  // ── Bóng ──
  pokeball:   { id: "pokeball",   sprite: "poke-ball",   name: "Poké Ball",   cat: "ball", price: 200,   rarity: "common",    ball: 1,   official: true, desc: "Bóng tiêu chuẩn. Tỉ lệ bắt x1." },
  greatball:  { id: "greatball",  sprite: "great-ball",  name: "Great Ball",  cat: "ball", price: 600,   rarity: "uncommon",  ball: 1.5, official: true, desc: "Bóng tốt hơn Poké Ball. Tỉ lệ bắt x1.5." },
  ultraball:  { id: "ultraball",  sprite: "ultra-ball",  name: "Ultra Ball",  cat: "ball", price: 1200,  rarity: "rare",      ball: 2,   official: true, desc: "Bóng hiệu suất cao. Tỉ lệ bắt x2." },
  masterball: { id: "masterball", sprite: "master-ball", name: "Master Ball", cat: "ball", price: 50000, rarity: "legendary", ball: 255, official: true, desc: "Bắt chắc chắn mọi Pokémon hoang." },
  // ── Hồi phục ──
  potion:       { id: "potion",       sprite: "potion",       name: "Potion",       cat: "heal", price: 200,  rarity: "common",   heal: 20,  official: true, desc: "Hồi 20 HP.", legacy: ["pokemon_food"] },
  super_potion: { id: "super_potion", sprite: "super-potion", name: "Super Potion", cat: "heal", price: 700,  rarity: "uncommon", heal: 60,  official: true, desc: "Hồi 60 HP.", legacy: ["super_food"] },
  hyper_potion: { id: "hyper_potion", sprite: "hyper-potion", name: "Hyper Potion", cat: "heal", price: 1500, rarity: "rare",     heal: 120, official: true, desc: "Hồi 120 HP.", legacy: ["premium_food"] },
  revive:       { id: "revive",       sprite: "revive",       name: "Revive",       cat: "heal", price: 2500, rarity: "rare",     revive: 0.5, official: true, desc: "Cứu Pokémon ngất, hồi 50% HP." },
  // ── Berry ──
  oran_berry:   { id: "oran_berry",   sprite: "oran-berry",   name: "Oran Berry",   cat: "berry", price: 100, rarity: "common",   heal: 10, official: true, desc: "Hồi 10 HP." },
  sitrus_berry: { id: "sitrus_berry", sprite: "sitrus-berry", name: "Sitrus Berry", cat: "berry", price: 400, rarity: "uncommon", healPct: 0.25, official: true, desc: "Hồi 25% HP tối đa." },
  // ── Kẹo ──
  rare_candy: { id: "rare_candy", sprite: "rare-candy", name: "Rare Candy", cat: "candy", price: 5000, rarity: "legendary", levelUp: 1, official: true, desc: "Tăng ngay 1 level (không vượt 100). Không tự học chiêu/tiến hóa." },
  // ── Đá tiến hóa ──
  fire_stone:    { id: "fire_stone",    sprite: "fire-stone",    name: "Fire Stone",    cat: "evo", price: 3000, rarity: "rare", stone: "fire-stone",    official: true, desc: "Tiến hóa Vulpix, Growlithe, Eevee (Flareon)." },
  water_stone:   { id: "water_stone",   sprite: "water-stone",   name: "Water Stone",   cat: "evo", price: 3000, rarity: "rare", stone: "water-stone",   official: true, desc: "Tiến hóa Poliwhirl, Shellder, Staryu, Eevee (Vaporeon)." },
  thunder_stone: { id: "thunder_stone", sprite: "thunder-stone", name: "Thunder Stone", cat: "evo", price: 3000, rarity: "rare", stone: "thunder-stone", official: true, desc: "Tiến hóa Pikachu, Eevee (Jolteon)." },
  leaf_stone:    { id: "leaf_stone",    sprite: "leaf-stone",    name: "Leaf Stone",    cat: "evo", price: 3000, rarity: "rare", stone: "leaf-stone",    official: true, desc: "Tiến hóa Gloom, Weepinbell, Exeggcute." },
  moon_stone:    { id: "moon_stone",    sprite: "moon-stone",    name: "Moon Stone",    cat: "evo", price: 3000, rarity: "rare", stone: "moon-stone",    official: true, desc: "Tiến hóa Nidorina, Nidorino, Clefairy, Jigglypuff." },
  linking_cord:  { id: "linking_cord",  sprite: "linking-cord",  name: "Linking Cord",  cat: "evo", price: 8000, rarity: "epic", stone: "trade", official: true, desc: "Thay trao đổi: tiến hóa Kadabra, Machoke, Graveler, Haunter (vật phẩm chính thức từ Legends: Arceus)." },
  // ── Trứng (cơ chế của project, không phải vật phẩm chính thức Gen 1) ──
  egg_common:   { id: "egg_common",   sprite: null, egg: "common",   name: "Trứng Thường",   cat: "egg", price: 3000,  rarity: "common",   official: false, desc: "Trứng Pokémon phổ biến. Ấp bằng bước đi/trận chiến." },
  egg_uncommon: { id: "egg_uncommon", sprite: null, egg: "uncommon", name: "Trứng Hiếm",     cat: "egg", price: 8000,  rarity: "uncommon", official: false, desc: "Có thể nở Pokémon khá hiếm. Cần 1 Huy hiệu để nở." },
  egg_rare:     { id: "egg_rare",     sprite: null, egg: "rare",     name: "Trứng Cực Hiếm", cat: "egg", price: 25000, rarity: "rare",     official: false, desc: "Có thể nở Pokémon quý. Cần 3 Huy hiệu để nở." },
};

export const ITEM_CATS = {
  ball: { name: "Bóng bắt", order: 1 },
  heal: { name: "Hồi phục", order: 2 },
  berry: { name: "Berry", order: 3 },
  candy: { name: "Kẹo", order: 4 },
  evo: { name: "Tiến hóa", order: 5 },
  egg: { name: "Trứng", order: 6 },
};

export const LEGACY_ITEM_MAP = {};
for (const it of Object.values(ITEMS)) for (const old of it.legacy || []) LEGACY_ITEM_MAP[old] = it.id;

export function canonicalItemId(id) {
  const k = String(id || "").toLowerCase().replace(/-/g, "_");
  return LEGACY_ITEM_MAP[k] || k;
}
export function getItem(id) {
  return ITEMS[canonicalItemId(id)] || null;
}
export function listItems(cat) {
  return Object.values(ITEMS).filter((i) => !cat || i.cat === cat);
}
export function isPokemonItem(id) {
  return !!getItem(id);
}
/** Đá tiến hóa mà item này cung cấp (để so với evolution.item) */
export function itemForStone(stone) {
  return Object.values(ITEMS).find((i) => i.stone === stone) || null;
}
// Tương thích cũ
export const POKEBALLS = Object.fromEntries(
  Object.values(ITEMS).filter((i) => i.cat === "ball").map((i) => [i.id, { ...i, multiplier: i.ball, color: { pokeball: "#EF4444", greatball: "#3B82F6", ultraball: "#FBBF24", masterball: "#A855F7" }[i.id], description: i.desc }])
);
