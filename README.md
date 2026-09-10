# CAGlorie — deploy en Vercel con base de datos

## Qué hay acá
- `index.html` — landing
- `caglorie.html` — el juego (habla con `/api/game`)
- `api/game.js` — la API (una sola función serverless)
- `lib/game.js` — reglas del juego y economía (calorías, cooldowns, precios, premio semanal)
- `package.json` — dependencia `@upstash/redis`

La base de datos es **Upstash Redis**, que se instala desde el Marketplace de Vercel.

## Pasos (una sola vez)
1. Subí esta carpeta a un repo de GitHub (o arrastrala en vercel.com → Add New → Project).
2. En Vercel, importá el proyecto. Framework: **Other**. Deploy.
3. En el proyecto → pestaña **Storage** → **Create Database** → elegí **Upstash** → **Redis** → plan Free → **Connect** al proyecto.
   Vercel agrega solas las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
4. **Redeploy** (Deployments → ⋯ → Redeploy) para que la API tome las variables.
5. Abrí `https://tu-proyecto.vercel.app/caglorie.html`.

## Cómo funciona
- Cada navegador recibe un id anónimo (guardado en `localStorage`) y elige un nombre. Cuando llegue la wallet, el id pasa a ser la dirección.
- Timers, calorías, $CAG y NFT viven en Redis. El navegador solo muestra y pide acciones; el servidor valida (cooldowns, saldo, NFT) y responde el estado nuevo.
- Leaderboard: un ranking por semana (`lb:AAAA-MM-DD`, lunes 00:00 UTC). Al cambiar la semana, las calorías semanales vuelven a 0; el all-time se mantiene.

## Ajustar la economía
Todo está arriba de `lib/game.js`: `FOODS` (rangos, cooldowns, costos), `START_CAG`, `NFT_PRICE`, `PRIZE_POOL`, `MIN_QUALIFY`.

## Dev tools
Los botones de trampa (+100 $CAG, toggle NFT, reset) funcionan por defecto. Para desactivarlos en producción:
Vercel → Settings → Environment Variables → `DEV_TOOLS` = `off` → Redeploy.

## Próximo paso (web3)
Reemplazar en `api/game.js`: el id anónimo por una firma de wallet, `p.cag` por el balance real del token, `p.nft` por la lectura del contrato del NFT, y `supersize/buy` por transacciones confirmadas.
