/**
 * Sinh asset của project: trứng (eggs/*.png), nền bản đồ (maps/kanto_base.png), tia sáng (effects/rays.png)
 * Chạy: node Core/Commands/data/GIAITRI/Pokemon/tools/gen_art.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "canvas";
import { drawEggArt, drawRays, paintMapBase } from "../ui/art.js";
import { NODES, EDGES } from "../world.js";
import { ASSET_ROOT } from "../assets.js";

for (const d of ["eggs", "maps", "effects"]) fs.mkdirSync(path.join(ASSET_ROOT, d), { recursive: true });
for (const tier of ["common", "uncommon", "rare"]) {
  const c = createCanvas(360, 440); const x = c.getContext("2d");
  drawEggArt(x, 180, 220, 250, 330, tier);
  fs.writeFileSync(path.join(ASSET_ROOT, "eggs", `${tier}.png`), c.toBuffer());
}
{
  const c = createCanvas(2000, 1280); const x = c.getContext("2d"); x.scale(2, 2);
  paintMapBase(x, NODES, EDGES);
  fs.writeFileSync(path.join(ASSET_ROOT, "maps", "kanto_base.png"), c.toBuffer());
}
{
  const c = createCanvas(800, 800); const x = c.getContext("2d");
  drawRays(x, 400, 400, 400, "#ffffff", 28, 3);
  fs.writeFileSync(path.join(ASSET_ROOT, "effects", "rays.png"), c.toBuffer());
}
console.log("gen_art xong:", ASSET_ROOT);
