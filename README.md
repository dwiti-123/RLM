This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

# RLM — Reinforcement-Like Model (Retrieval-augmented LLM demo)

An interactive Next.js demo that answers questions about **long documents** without
ever feeding the full text to the LLM. The model only reads tiny ~250-char samples
and issues deterministic backend `query()` calls, so counting and filtering are exact.

It runs a **naive baseline side-by-side** (entire document pasted into the prompt) so
you can see the token-usage and answer trade-offs instantly.

## How it works

1. **Upload** any document (.txt, CSV, JSON, prose, etc.).
2. Backend auto-detects the best record splitter (`label`, `line`, `block`, `sentence`)
   by scoring each candidate on record evenness × coverage.
3. The RLM agent is given only:
   - total document length
   - the split strategy
   - two tools: `probe(offset)` and `query(match[], regex[], limit)`
4. The agent **never sees the document body**. It probes once or twice to learn the
   format, then runs exact `query()` scans that return ground-truth counts.
5. The naive baseline dumps the entire document into the prompt for comparison.

## Tech stack

- Next.js 16 (App Router), React 19, Tailwind CSS v4
- TypeScript
- Google Gemini (`gemini-flash-lite-latest`) via `@google/generative-ai`

## Getting started

```bash
npm install
```

Create an `.env` file with your Gemini API key:

```
GEMINI_API_KEY=your_key_here
```

Run the dev server:

```bash
npm run dev
```

Open http://localhost:3000, upload a document, and ask a question.

## Project structure

```
app/
├── api/
│   ├── upload/route.js        # doc store + record-index builder (splitter scoring)
│   ├── rlm-query/route.js     # RLM agent: probe/query tools, turn loop, trace
│   └── naive-query/route.js   # Naiive baseline: full doc in the prompt
├── page.tsx                   # UI: side-by-side RLM vs naive comparison
└── globals.css                # styling (paper/sans theme)
```

## Why?

Standard LLMs choke on documents larger than their context window. RLM-style
retrieval keeps context tiny and answers **exact** — the count from `query()` is
ground truth, not a guess.







