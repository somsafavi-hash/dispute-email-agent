# Dispute Email Agent

AI-powered email generator for debt dispute processing. Upload a seller CSV, add optional context, and generate personalized draft emails for each seller row instantly.

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

## How It Works

- Upload any CSV with seller data (column names are auto-detected)
- Optionally add context (sender info, recipient, dispute instructions)
- Agent generates a personalized email per row using Claude
- Copy each draft individually

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/somsafavi-hash/dispute-email-agent)

Add `ANTHROPIC_API_KEY` as an environment variable in your Vercel project settings.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Anthropic Claude API
