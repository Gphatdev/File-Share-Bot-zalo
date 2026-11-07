/**
 * Pokemon — cấu hình tập trung (chỉnh số ở đây, không rải trong code).
 */
export const CONFIG = {
  // Phần thưởng Solo (EXP giữ nguyên cũ: thắng +500, thua +150; tiền random trong khoảng)
  solo: {
    win: { exp: 500, money: [1000, 5000] },
    lose: { exp: 150, money: [200, 1500] },
    draw: { exp: 150, money: [200, 1500] },
    petExp: { win: 150, lose: 50, draw: 80 },   // EXP cho Pokémon xuất trận đầu
    maxTurns: 60,          // quá số lượt → hòa
    roomTtlMs: 10 * 60 * 1000,
    idleForfeitMs: 5 * 60 * 1000,
    historyKeep: 500,
  },
  // Cooldown (ms) chống spam
  cooldown: {
    wild: 4000,
    heal: 30000,
    travel: 2500,
    gym: 8000,
    eggStep: 3000,        // khoảng cách tối thiểu giữa 2 lần cộng bước ấp trứng
    hatch: 3000,
  },
  trainer: { maxCollection: 50, maxParty: 6, itemStack: 99, eggSlots: 3 },
  battle: { critRate: 1 / 16, critMult: 1.5, stab: 1.5, sessionTtlMs: 5 * 60 * 1000 },
  // Bước ấp trứng cộng khi làm hành động thật
  eggSteps: { travelPerHop: 40, wildEncounter: 25, wildWin: 40, solo: 30, gym: 60 },
  // Tiền thưởng nhiệm vụ nằm trong quests.js (mỗi nhiệm vụ có khoảng riêng)
};

export const BADGES = [
  { id: "boulder", name: "Boulder Badge", leader: "Brock", city: "pewter" },
  { id: "cascade", name: "Cascade Badge", leader: "Misty", city: "cerulean" },
  { id: "thunder", name: "Thunder Badge", leader: "Lt. Surge", city: "vermilion" },
  { id: "rainbow", name: "Rainbow Badge", leader: "Erika", city: "celadon" },
  { id: "soul", name: "Soul Badge", leader: "Koga", city: "fuchsia" },
  { id: "marsh", name: "Marsh Badge", leader: "Sabrina", city: "saffron" },
  { id: "volcano", name: "Volcano Badge", leader: "Blaine", city: "cinnabar" },
  { id: "earth", name: "Earth Badge", leader: "Giovanni", city: "viridian" },
];

export function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
