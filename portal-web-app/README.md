# portal-web-app

Wydzielona aplikacja portalowa z repo `iclean-room`.

## Co zawiera
- `src` (portal UI + serwisy + auth + dataconnect-generated)
- `index.html`, `vite.config.js`, `package.json`
- `index.js` (runtime serwer na PORT dla hostingu)

## Uruchomienie lokalne
1. `cd portal-web-app`
2. `npm install`
3. skopiuj `.env.example` do `.env` i uzupelnij
4. `npm run dev`

## Produkcja
- build: `npm run build`
- start: `npm run start`
