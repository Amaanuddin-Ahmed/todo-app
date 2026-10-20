# Agent Context

This file helps future AI sessions understand the project quickly.

## Commands

```bash
npm run dev          # Start dev server with --watch (port 3000)
npm run start        # Production start (no watch)
npm run lint         # ESLint check
npm run format       # Prettier write
npm run format:check # Prettier check only
npm run test         # Run all tests (node:test)
npm run db:migrate   # Run database migration (idempotent)
```

## Structure Conventions

- **src/** = Server code (Express, runs on Vercel)
  - `create-app.js` = Factory function for testing (inject repositories)
  - `app.js` = Vercel entry point (default export)
  - `middleware/` = Express middleware (error-handler, logging, validation)
  - `routes/` = Route handlers (health, tasks)
  - `services/` = Business logic (tasks-service)
  - `repositories/` = Data access (tasks-repository, SQL only here)
- **public/** = Client code (served by Vercel CDN, no build step)
  - `index.html`, `styles.css`, `js/api.js`, `js/app.js`
- **db/** = Database migration
  - `schema.sql` = DDL
  - `migrate.js` = Runner (uses DATABASE_URL_UNPOOLED)
- **scripts/** = Local-only scripts (dev.js)
- **test/** = Tests
  - `unit/` = Fake repository, fast
  - `integration/` = Real DB (requires TEST_DATABASE_URL)

## Code Style

- ESM (`type: "module"` in package.json)
- Clear names, small functions, comments only for "why"
- No inline scripts/styles in HTML
- Parameterized SQL only (no string interpolation)
- Client renders user text with `textContent` only (XSS-safe)
- Error responses: `{ error: { code, message } }` — no stack traces

## Architecture Rules (Non-Negotiable)

1. **3 tiers**: Browser → Express API → PostgreSQL
2. **Browser talks only to /api** — no DB access, no credentials
3. **Only repository layer touches SQL**
4. **Server is testable**: `createApp({ tasksRepository })` accepts fake repo
5. **Vercel entry**: `src/app.js` default exports the Express app

## Environment

- Local: `.env.local` (git-ignored)
- Vercel: Injected via Neon integration (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`)
- Preview/Production: Separate Neon branches
- `.env.example` has placeholders only — never commit real secrets

## Database

- Table: `tasks (id UUID PK, title TEXT 1-200, completed BOOL, created_at, updated_at)`
- Index: `created_at DESC` for newest-first queries
- Migration is idempotent (`IF NOT EXISTS`, transactional)

## Testing

- Unit tests use in-memory fake repository (no DB needed)
- Integration test runs only when `TEST_DATABASE_URL` is set
- Run `npm audit --omit=dev` before deploy

## Deployment

- `vercel` = preview deployment
- `vercel --prod` = production (or push to main after Git connect)
- `vercel.json` only has headers for static assets (CSP, etc.)
- No `build` step, no `outputDirectory` — zero-config Express

## Common Tasks

- **Add endpoint**: Route → Service → Repository → Test
- **Change schema**: Edit `db/schema.sql` → `npm run db:migrate` → commit
- **Update client**: Edit `public/` → test locally → deploy
- **Debug production**: `vercel logs <deployment-url>`

## Risks to Avoid

- Don't put SQL outside `repositories/`
- Don't use `innerHTML` with user data
- Don't commit `.env.local` or `.vercel/`
- Don't add CORS — same-origin by design
- Don't skip migration before deploy (preview gets own DB branch)
