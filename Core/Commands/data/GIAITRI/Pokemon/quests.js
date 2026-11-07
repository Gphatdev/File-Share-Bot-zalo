/**
 * Nhiệm vụ Pokémon — hoàn thành bằng hành động thật (tiến độ suy ra từ dữ liệu bền vững của Trainer).
 * Tiền thưởng random trong khoảng [min,max], được roll 1 lần khi nhiệm vụ hoàn thành, lưu lại và chỉ trả 1 lần.
 * Thêm nhiệm vụ mới: thêm 1 dòng vào QUESTS (xem README_POKEMON.md).
 */
export const QUEST_CATS = {
  starter: { name: "Khởi đầu", order: 1 },
  explore: { name: "Khám phá", order: 2 },
  wild: { name: "Gặp Pokémon hoang", order: 3 },
  capture: { name: "Thu phục", order: 4 },
  level: { name: "Cấp độ & chiêu", order: 5 },
  evolve: { name: "Tiến hóa", order: 6 },
  hatch: { name: "Ấp trứng", order: 7 },
  win: { name: "Chiến thắng", order: 8 },
  gym: { name: "Gym", order: 9 },
  collect: { name: "Sưu tầm", order: 10 },
  story: { name: "Hành trình Kanto", order: 11 },
};

// q(id, cat, name, desc, type, target, exp, [minMoney,maxMoney], { requires, param, items })
const Q = (id, cat, name, description, type, target, exp, money, extra = {}) => ({ id, cat, name, description, type, target, expReward: exp, money, requires: [], ...extra });

const LIST = [
  // starter
  Q("newbie_pick", "starter", "Nhiệm vụ tân binh", "Chọn Pokémon đầu tiên.", "pick_starter", 1, 100, [100, 500]),
  // explore
  Q("explore_3", "explore", "Lữ khách", "Ghé thăm 3 địa điểm khác nhau.", "visit_count", 3, 150, [200, 800], { requires: ["newbie_pick"] }),
  Q("explore_10", "explore", "Nhà thám hiểm", "Ghé thăm 10 địa điểm khác nhau.", "visit_count", 10, 600, [800, 2500], { requires: ["explore_3"] }),
  // wild
  Q("meet_1", "wild", "Lần đầu chạm trán", "Gặp 1 Pokémon hoang dã (.pokemon thuphuc).", "wild_met", 1, 100, [100, 500], { requires: ["newbie_pick"] }),
  Q("meet_20", "wild", "Quen thuộc với hoang dã", "Gặp 20 Pokémon hoang dã.", "wild_met", 20, 400, [500, 1500], { requires: ["meet_1"] }),
  // capture
  Q("capture_1", "capture", "Người thu phục", "Thu phục 1 Pokémon. (Thưởng thêm 1 Trứng Thường)", "capture", 1, 500, [500, 1500], { requires: ["newbie_pick"], items: { egg_common: 1 } }),
  Q("capture_5", "capture", "Thợ săn Pokémon", "Thu phục 5 Pokémon.", "capture", 5, 1500, [1500, 4000], { requires: ["capture_1"] }),
  Q("species_10", "capture", "Nhà nghiên cứu", "Sở hữu 10 loài Pokémon khác nhau.", "species_count", 10, 3000, [2000, 6000], { requires: ["capture_5"] }),
  // level & moves
  Q("level_5", "level", "Nhà huấn luyện", "Nâng Pokémon lên Level 5.", "pet_level", 5, 1000, [1000, 3000], { requires: ["newbie_pick"] }),
  Q("level_10", "level", "Nhà huấn luyện chuyên nghiệp", "Nâng Pokémon lên Level 10.", "pet_level", 10, 3000, [1000, 3500], { requires: ["level_5"] }),
  Q("level_20", "level", "Huấn luyện viên tinh anh", "Nâng Pokémon lên Level 20.", "pet_level", 20, 6000, [3000, 8000], { requires: ["level_10"] }),
  Q("learn_1", "level", "Học chiêu mới", "Dạy Pokémon 1 chiêu mới (.pokemon upt pet).", "moves_learned", 1, 300, [300, 1200], { requires: ["level_5"] }),
  Q("learn_5", "level", "Bậc thầy chiêu thức", "Dạy chiêu mới 5 lần.", "moves_learned", 5, 1200, [1500, 4000], { requires: ["learn_1"] }),
  // evolve
  Q("evolve_1", "evolve", "Tiến hóa đầu tiên", "Tiến hóa 1 Pokémon.", "evolutions", 1, 1500, [1500, 5000], { requires: ["level_10"] }),
  Q("evolve_3", "evolve", "Nhà tiến hóa", "Tiến hóa 3 lần.", "evolutions", 3, 4000, [3000, 9000], { requires: ["evolve_1"] }),
  // hatch
  Q("hatch_1", "hatch", "Chào đời!", "Ấp nở 1 quả trứng (.pokemon egg).", "hatched", 1, 800, [800, 3000], { requires: ["capture_1"] }),
  Q("hatch_5", "hatch", "Trại ấp trứng", "Ấp nở 5 quả trứng.", "hatched", 5, 3000, [3000, 8000], { requires: ["hatch_1"] }),
  // win
  Q("first_solo", "win", "Nhà huấn luyện mới", "Tham gia 1 trận Solo.", "solo_play", 1, 300, [500, 2000], { requires: ["newbie_pick"] }),
  Q("win_1", "win", "Chiến thắng đầu tiên", "Thắng 1 trận Solo.", "solo_win", 1, 300, [500, 2000], { requires: ["first_solo"] }),
  Q("win_3_solo", "win", "Chiến binh Pokémon", "Thắng 3 trận Solo.", "solo_win", 3, 1000, [1000, 3500], { requires: ["win_1"] }),
  Q("win_10_solo", "win", "Bậc Thầy chiến đấu", "Thắng 10 trận Solo.", "solo_win", 10, 5000, [3000, 9000], { requires: ["win_3_solo"] }),
  Q("wild_win_10", "win", "Dọn đường", "Hạ gục 10 Pokémon hoang dã.", "wild_wins", 10, 600, [800, 2500], { requires: ["meet_1"] }),
  // gym
  Q("gym_1", "gym", "Huy hiệu đầu tiên", "Đánh bại Gym Leader Brock (Boulder Badge).", "badges", 1, 1000, [3000, 10000], { requires: ["level_10"] }),
  Q("gym_3", "gym", "Ba huy hiệu", "Sở hữu 3 huy hiệu Gym.", "badges", 3, 2500, [3000, 10000], { requires: ["gym_1"] }),
  Q("gym_5", "gym", "Năm huy hiệu", "Sở hữu 5 huy hiệu Gym.", "badges", 5, 5000, [5000, 15000], { requires: ["gym_3"] }),
  Q("gym_8", "gym", "Nhà vô địch Kanto Gym", "Sở hữu đủ 8 huy hiệu Gym.", "badges", 8, 12000, [10000, 30000], { requires: ["gym_5"] }),
  // collect
  Q("collect_5", "collect", "Bộ sưu tập Pokémon", "Sở hữu 5 Pokémon.", "collection", 5, 2000, [1500, 5000], { requires: ["capture_1"] }),
  Q("collect_10", "collect", "Bộ sưu tập huyền thoại", "Sở hữu 10 Pokémon.", "collection", 10, 5000, [3000, 9000], { requires: ["collect_5"] }),
  // story
  Q("story_viridian", "story", "Rời Pallet Town", "Đến Viridian City.", "visit_node", 1, 150, [200, 800], { param: "viridian", requires: ["newbie_pick"] }),
  Q("story_pewter", "story", "Thành phố đá", "Đến Pewter City.", "visit_node", 1, 250, [300, 1000], { param: "pewter", requires: ["story_viridian"] }),
  Q("story_cerulean", "story", "Vượt Mt. Moon", "Đến Cerulean City.", "visit_node", 1, 500, [800, 2500], { param: "cerulean", requires: ["story_pewter", "gym_1"] }),
  Q("story_indigo", "story", "Đỉnh cao Liên đoàn", "Đến Indigo Plateau.", "visit_node", 1, 10000, [10000, 30000], { param: "indigo", requires: ["gym_8"] }),
];

export const QUESTS = Object.fromEntries(LIST.map((q, i) => [q.id, { ...q, order: i + 1 }]));

export function listQuests() {
  return Object.values(QUESTS).sort((a, b) => a.order - b.order);
}
export function getQuest(id) {
  return QUESTS[id] || null;
}
// tương thích tên cũ
export const listMissions = listQuests;
export const getMission = getQuest;

/** Giá trị tiến độ hiện tại của nhiệm vụ, suy ra từ trạng thái thật của Trainer */
export function evalProgress(def, t) {
  const s = t.stats || {};
  switch (def.type) {
    case "pick_starter": return t.starterChosen || (t.collection || []).length ? 1 : 0;
    case "visit_count": return (t.visited || []).length;
    case "visit_node": return (t.visited || []).includes(def.param) ? 1 : 0;
    case "wild_met": return s.wildMet || 0;
    case "wild_wins": return s.wildWins || 0;
    case "capture": return s.captures || 0;
    case "species_count": return (t.dex?.caught || []).length;
    case "pet_level": return Math.max(0, ...(t.collection || []).map((p) => p.level || 0));
    case "moves_learned": return s.learned || 0;
    case "evolutions": return s.evolutions || 0;
    case "hatched": return s.hatched || 0;
    case "solo_play": return (s.wins || 0) + (s.losses || 0) + (s.draws || 0);
    case "solo_win": return s.wins || 0;
    case "badges": return (t.badges || []).length;
    case "collection": return (t.collection || []).length;
    default: return 0;
  }
}

export const QUEST_STATUS = { locked: "Khoá", available: "Chưa làm", in_progress: "Đang làm", completed: "Nhận thưởng", claimed: "Đã nhận" };
