<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Single Next.js 16 (App Router) service; no database, Docker, or external service is needed for local dev. Dependencies are installed by the startup update script (`npm install`).

- Run dev server: `npm run dev` (http://localhost:3000). Lint/test/build/CI commands are defined in `package.json` scripts (`npm run lint`, `npm test`, `npm run build`, `npm run ci`).
- The core flow (CSV upload → `POST /api/generate-email` → static V1 draft) needs no env vars or secrets. V1 returns the same hard-coded subject/body for every row regardless of CSV contents or context.
- The Talonflame routes (`/api/talonflame/*`) require external integration env vars (Asana / AWS Step Functions / Microsoft Graph — see `README.md` and `docs/talonflame/`). These are only needed when exercising approval-gated sending; the rest of the app and all current tests run without them.
- `.env*` files are gitignored.
