// Single endpoint for the game. POST { id, action, ... } → { state, now, ... }
import * as G from "../lib/game.js";

const ID_RE = /^[a-z0-9-]{8,64}$/;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { id, action } = body;
    if (!ID_RE.test(id || "")) return res.status(400).json({ error: "Bad player id" });

    let p = await G.loadPlayer(id);
    const out = { now: Date.now(), config: { foods: G.FOODS, superMult: G.SUPER_MULT, nftPrice: G.NFT_PRICE, dev: G.DEV_TOOLS } };

    switch (action) {
      case "init":
        if (!p) { if (!body.name) return res.status(200).json({ ...out, state: null }); p = await G.createPlayer(id, body.name); }
        break;
      case "leaderboard":
        return res.status(200).json({ ...out, leaderboard: await G.leaderboard(p) });
      case "eat":       need(p); out.gain = G.eat(p, body.food); break;
      case "supersize": need(p); G.supersize(p, body.food); break;
      case "buy":       need(p); G.buy(p, body.food); break;
      case "buyNft":    need(p); G.buyNft(p); break;
      case "sound":     need(p); p.sound = !!body.on; break;
      // ---- dev cheats (disable with DEV_TOOLS=off) ----
      case "devAddCag": need(p); dev(); p.cag += 100; break;
      case "devZeroCag":need(p); dev(); p.cag = 0; break;
      case "devNft":    need(p); dev(); p.nft = !p.nft; break;
      case "devReset":  need(p); dev(); Object.assign(p, { calories: 0, alltime: 0, cag: G.START_CAG, nft: false, lastEaten: {}, supersized: {}, owned: {} }); break;
      default: return res.status(400).json({ error: "Unknown action" });
    }
    await G.savePlayer(p);
    out.state = G.publicState(p);
    out.leaderboard = await G.leaderboard(p);
    return res.status(200).json(out);
  } catch (e) {
    console.error("[api/game]", e);
    return res.status(400).json({ error: e.message || "Error" });
  }
}
function need(p) { if (!p) throw new Error("Player not found — reload the page"); }
function dev() { if (!G.DEV_TOOLS) throw new Error("Dev tools are off"); }
