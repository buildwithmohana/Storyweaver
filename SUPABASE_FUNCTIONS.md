# Storyweaver — real AI story generation (Claude via Supabase)

Storyweaver generates each story with Claude. The browser never sees the
Anthropic API key: it calls a **Supabase Edge Function** ([`generate-story`](supabase/functions/generate-story/index.ts))
which holds the secret key and calls the Claude Messages API server-side.

```mermaid
graph LR
  A["App (browser)"] -->|"DB.generateStory() + user JWT"| B["Edge Function<br/>generate-story"]
  B -->|"x-api-key (secret)"| C["Claude Messages API"]
  C -->|"{ tldr, body }"| B --> A
```

Until the function is deployed, the app automatically falls back to its built-in
template stories — so nothing breaks; you just don't get unique AI stories yet.

---

## Prerequisites

- **An Anthropic API key.** Create one at <https://console.anthropic.com> →
  **API keys**. (This is billed usage — Claude charges per token.)
- **The Supabase CLI.** Install: <https://supabase.com/docs/guides/cli>
  (e.g. `npm i -g supabase`, `brew install supabase/tap/supabase`, or `scoop install supabase`).

## 1. Link the CLI to your project (one time)

```bash
supabase login
supabase link --project-ref gunqtnjyymgstxkwwyhl
```

Run these from the `bedtime-story-app` folder (it contains `supabase/functions/…`).

## 2. Store your Anthropic key as a secret

The key lives only in Supabase, never in the repo or the browser:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

> Do **not** paste your key into chat or commit it. `supabase secrets set` is the
> only place it should go.

## 3. Deploy the function

```bash
supabase functions deploy generate-story
```

That's it. The app calls it automatically on the next "Generate story". JWT
verification is on by default, so only signed-in users can invoke it.

## 4. Test it

- In the app, log in, enter a character and a lesson, and tap **Generate story**.
  You should get a fresh, unique story (tap **Regenerate** for a brand-new one).
- Or from the terminal:

```bash
curl -i -X POST \
  "https://gunqtnjyymgstxkwwyhl.supabase.co/functions/v1/generate-story" \
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{"character":"a brave little fox named Momo","lesson":"Kindness","length":"3 min"}'
```

(Use a real logged-in user's access token; the `sb_publishable_…` key alone
won't pass JWT verification.)

- Watch logs live while testing: `supabase functions logs generate-story`

---

## Choosing the model (cost vs. speed)

The function defaults to **`claude-opus-5`** — the most capable model. For a
high-volume, latency-sensitive bedtime-story app you may prefer a faster, cheaper
model; both are more than capable here. Override without editing code by setting a
secret, then redeploying:

```bash
supabase secrets set STORY_MODEL=claude-haiku-4-5   # fastest & cheapest
# or
supabase secrets set STORY_MODEL=claude-sonnet-5    # strong balance
supabase functions deploy generate-story
```

| Model | Input $/1M | Output $/1M | Notes |
| ----- | ---------- | ----------- | ----- |
| `claude-opus-5` (default) | $5.00 | $25.00 | Most capable |
| `claude-sonnet-5` | $3.00 | $15.00 | Strong balance |
| `claude-haiku-4-5` | $1.00 | $5.00 | Fastest, cheapest — great fit for this use case |

The function requests `effort: "low"` and structured JSON output to keep each
story fast and inexpensive regardless of model.

---

## How the app uses it

- [`js/db.js`](js/db.js) exposes `DB.generateStory({ character, lesson, length, notes, child })`,
  which calls `supabase.functions.invoke('generate-story', …)` with the signed-in
  user's JWT attached automatically.
- [`index.html`](index.html) `generateStoryContent()` calls that, and on any
  error (function not deployed, network, API error, safety refusal) falls back to
  the local `STORY_BANK`. **Regenerate** asks Claude for a genuinely new story
  each time (or cycles template variants in fallback mode).
- The generated `tldr` + `body` are saved to the `stories` table on **Done**,
  exactly like before — the only change is where the words come from.
