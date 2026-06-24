# Dispute Email Agent

AI-powered email generator for debt dispute processing. Upload a seller CSV, add optional context, and generate personalized draft emails for each seller row instantly.

This repo also includes **Talonflame**, an approval-gated email send orchestrator. Talonflame renders a plain-text email, opens an Asana approval task, waits for the configured approver to complete it, and only then delegates delivery to the Microsoft email provider through the communication runtime.

## Getting Started

1. Clone the repo
2. Install dependencies:
   ```bash
   npm install
   ```
3. Add your Anthropic API key to `.env.local`:
   ```
   ANTHROPIC_API_KEY=your_key_here
   ```
4. Run the dev server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

## CSV Draft Email Generator

### How It Works

- Upload any CSV with seller data (column names are auto-detected)
- Optionally add context (sender info, recipient, dispute instructions)
- Agent generates a personalized email per row using Claude
- Copy each draft individually

## Talonflame Approval-Gated Sending

Talonflame provides a repeatable server-side workflow for email approval and delivery:

1. Accept a pinned request contract: `sender`, `recipient`, `approver`, `subject`, `body`, and `requestId`.
2. Resolve Asana gids to real identities and email addresses.
3. Validate the approver has access to the configured Asana approval project.
4. Render one plain-text email.
5. Start one Step Functions execution keyed by `requestId`.
6. Wait for Asana approval through the Step Functions task-token flow.
7. Send through the Microsoft provider only after approval.

API routes:

- `POST /api/talonflame/requests` starts an approval-gated send request.
- `POST /api/talonflame/asana-webhook` handles Asana webhook handshakes and approval callbacks.

Required Talonflame environment variables:

- `TALONFLAME_ASANA_ACCESS_TOKEN`
- `TALONFLAME_ASANA_PROJECT_GID`
- `TALONFLAME_STATE_MACHINE_ARN`
- `MEOWTH_APPROVAL_TOKEN_LOOKUP_URL` for webhook callbacks

See [`docs/talonflame/README.md`](docs/talonflame/README.md) for the full runtime configuration, request example, state-machine notes, and verification plan.

## Development Checks

```bash
npm run ci
```

`npm run ci` runs tests, lint, and the production build.

## CI/CD

GitHub Actions is configured in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).

The pipeline runs on pull requests, pushes to `main`, and manual dispatch:

1. Install dependencies with `npm ci`.
2. Run `npm test`.
3. Run `npm run lint`.
4. Run `npm run build`.
5. Deploy a Vercel preview for same-repository pull requests when Vercel secrets are configured.
6. Deploy to Vercel production after pushes to `main` when Vercel secrets are configured.

Deployment is skipped safely if any of these GitHub secrets are missing:

- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/somsafavi-hash/dispute-email-agent)

Add `ANTHROPIC_API_KEY` as an environment variable in your Vercel project settings for the draft generator. Add the Talonflame variables above when deploying approval-gated sending.

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Anthropic Claude API
- AWS Step Functions
- Asana API
- Microsoft Graph email delivery via the communication provider
