/**
 * Gym Kanto (FireRed/LeafGreen). Đội hình đối chiếu Bulbapedia (Brock/Misty/Surge/Erika/Koga/Sabrina/Blaine đã xác minh;
 * Giovanni: Rhyhorn Lv45 đã xác minh, các con còn lại theo dữ liệu Red/Blue/FRLG quen thuộc).
 */
export const GYMS = {
  pewter:    { city: "pewter",    leader: "Brock",     type: "rock",     badge: "boulder", order: 1, team: [["geodude", 12], ["onix", 14]] },
  cerulean:  { city: "cerulean",  leader: "Misty",     type: "water",    badge: "cascade", order: 2, team: [["staryu", 18], ["starmie", 21]] },
  vermilion: { city: "vermilion", leader: "Lt. Surge", type: "electric", badge: "thunder", order: 3, team: [["voltorb", 21], ["pikachu", 18], ["raichu", 24]] },
  celadon:   { city: "celadon",   leader: "Erika",     type: "grass",    badge: "rainbow", order: 4, team: [["victreebel", 29], ["tangela", 24], ["vileplume", 29]] },
  fuchsia:   { city: "fuchsia",   leader: "Koga",      type: "poison",   badge: "soul",    order: 5, team: [["koffing", 37], ["muk", 39], ["koffing", 37], ["weezing", 43]] },
  saffron:   { city: "saffron",   leader: "Sabrina",   type: "psychic",  badge: "marsh",   order: 6, team: [["kadabra", 38], ["mr-mime", 37], ["venomoth", 38], ["alakazam", 43]] },
  cinnabar:  { city: "cinnabar",  leader: "Blaine",    type: "fire",     badge: "volcano", order: 7, team: [["growlithe", 42], ["ponyta", 40], ["rapidash", 42], ["arcanine", 47]] },
  viridian:  { city: "viridian",  leader: "Giovanni",  type: "ground",   badge: "earth",   order: 8, team: [["rhyhorn", 45], ["dugtrio", 42], ["nidoqueen", 44], ["nidoking", 45], ["rhydon", 50]] },
};
export function gymAt(nodeId) {
  return GYMS[nodeId] || null;
}
