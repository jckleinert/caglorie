// CAGlorie game rules + storage. Everything the browser must not be trusted with lives here.
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ---- economy (edit here, the client only displays what the server sends) ----
export const FOODS = {
  snack: { id: "snack", name: "Snack",     cooldown: 1 * 3600e3,  min: 20,  max: 60,   cost: 30 },
  meal:  { id: "meal",  name: "Meal",      cooldown: 6 * 3600e3,  min: 150, max: 400,  cost: 60,  nft: true },
  big:   { id: "big",   name: "Big Order", cooldown: 12 * 3600e3, min: 500, max: 1200, cost: 100, nft: true },
  choc:  { id: "choc",  name: "Chocolate", cooldown: 24 * 3600e3, min: 800, max: 2000, buy: 150 },
};
export const SUPER_MULT = 2;
export const START_CAG = 200;
export const NFT_PRICE = 5000;
export const PRIZE_POOL = 100000;
export const MIN_QUALIFY = 1000;
export const DEV_TOOLS = process.env.DEV_TOOLS !== "off"; // set DEV_TOOLS=off in Vercel to disable cheats

export function weekId(d = new Date()) {
  const day = (d.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return mon.toISOString().slice(0, 10);
}
export function weekEnd() { return new Date(weekId() + "T00:00:00Z").getTime() + 7 * 864e5; }

const pkey = id => `player:${id}`;
const lbkey = week => `lb:${week}`;
const namekey = name => `name:${name.toLowerCase()}`;

export async function loadPlayer(id) {
  const p = await redis.get(pkey(id));
  if (!p) return null;
  const w = weekId();
  if (p.week !== w) { p.week = w; p.calories = 0; }   // weekly reset
  p.owned ||= {}; p.supersized ||= {}; p.lastEaten ||= {};
  return p;
}

export async function savePlayer(p) {
  await redis.set(pkey(p.id), p);
  await redis.zadd(lbkey(p.week), { score: p.calories, member: p.name });
}

export async function createPlayer(id, name) {
  name = String(name || "").trim().slice(0, 16);
  if (!name) throw new Error("Name required");
  const taken = await redis.get(namekey(name));
  if (taken && taken !== id) throw new Error("That name is taken");
  const p = { id, name, calories: 0, alltime: 0, week: weekId(), cag: START_CAG, nft: false, sound: true,
              lastEaten: {}, supersized: {}, owned: {}, created: Date.now() };
  await redis.set(namekey(name), id);
  await savePlayer(p);
  return p;
}

const remaining = (p, f) => { const t = p.lastEaten[f.id]; return t ? Math.max(0, t + f.cooldown - Date.now()) : 0; };

export function eat(p, foodId) {
  const f = FOODS[foodId]; if (!f) throw new Error("Unknown food");
  if (remaining(p, f) > 0) throw new Error("Still digesting");
  if (f.nft && !p.nft) throw new Error("CAG NFT holders only");
  if (f.buy) { if (!p.owned[f.id]) throw new Error("Buy it first"); p.owned[f.id] = false; }
  const up = !!p.supersized[f.id];
  let gain = f.min + Math.floor(Math.random() * (f.max - f.min + 1));
  if (up) gain *= SUPER_MULT;
  p.calories += gain; p.alltime += gain;
  p.lastEaten[f.id] = Date.now(); p.supersized[f.id] = false;
  return gain;
}

export function supersize(p, foodId) {
  const f = FOODS[foodId]; if (!f || !f.cost) throw new Error("Can't supersize that");
  if (f.nft && !p.nft) throw new Error("CAG NFT holders only");
  if (p.supersized[f.id]) throw new Error("Already large");
  if (p.cag < f.cost) throw new Error("Not enough $CAG");
  p.cag -= f.cost; p.supersized[f.id] = true;
}

export function buy(p, foodId) {
  const f = FOODS[foodId]; if (!f || !f.buy) throw new Error("Can't buy that");
  if (remaining(p, f) > 0) throw new Error("Still digesting");
  if (p.owned[f.id]) throw new Error("Already bought");
  if (p.cag < f.buy) throw new Error("Not enough $CAG");
  p.cag -= f.buy; p.owned[f.id] = true;
}

export function buyNft(p) {
  if (p.nft) throw new Error("Already a holder");
  if (p.cag < NFT_PRICE) throw new Error("Not enough $CAG");
  p.cag -= NFT_PRICE; p.nft = true;
}

export async function leaderboard(p) {
  const week = weekId();
  const raw = await redis.zrange(lbkey(week), 0, -1, { rev: true, withScores: true });
  const rows = []; for (let i = 0; i < raw.length; i += 2) rows.push({ name: raw[i], calories: Number(raw[i + 1]) });
  const qualified = rows.filter(r => r.calories >= MIN_QUALIFY);
  const total = qualified.reduce((s, r) => s + r.calories, 0);
  const payout = r => r.calories >= MIN_QUALIFY && total ? Math.floor(PRIZE_POOL * r.calories / total) : 0;
  const top = rows.slice(0, 15).map((r, i) => ({ rank: i + 1, ...r, qualified: r.calories >= MIN_QUALIFY, payout: payout(r) }));
  let me = null;
  if (p) {
    const idx = rows.findIndex(r => r.name === p.name);
    me = { calories: p.calories, qualified: p.calories >= MIN_QUALIFY, payout: payout({ calories: p.calories }),
           rank: p.calories > 0 && idx >= 0 ? idx + 1 : null };
  }
  return { week, weekEnd: weekEnd(), pool: PRIZE_POOL, minQualify: MIN_QUALIFY, rows: top, me, players: rows.length };
}

export function publicState(p) {
  return { id: p.id, name: p.name, calories: p.calories, alltime: p.alltime, week: p.week, cag: p.cag, nft: p.nft,
           sound: p.sound, lastEaten: p.lastEaten, supersized: p.supersized, owned: p.owned };
}
