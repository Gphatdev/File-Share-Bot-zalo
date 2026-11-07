/**
 * Nạp dữ liệu chính thức đã build (db/*.json) — xem tools/build_db.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "db");
const load = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));

export const SPECIES = load("species.json");
export const MOVES = load("moves.json");
export const GROWTH = load("growth.json");
export const ENCOUNTERS = load("encounters.json");
