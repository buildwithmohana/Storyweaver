// ============================================================================
// Storyweaver — generate-story Edge Function
// ----------------------------------------------------------------------------
// Treats Claude as a backend: the browser calls this function (authenticated
// with the signed-in parent's Supabase JWT), and the function calls the Claude
// Messages API using the secret ANTHROPIC_API_KEY that never leaves the server.
//
// Deploy + secret setup: see SUPABASE_FUNCTIONS.md.
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy generate-story
//
// JWT verification is ON by default, so only signed-in users can call it.
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// Structured-output schema — Claude returns exactly this shape.
const STORY_SCHEMA = {
  type: "object",
  properties: {
    tldr: {
      type: "array",
      items: { type: "string" },
      description: "Exactly 3 short 'quick peek' bullet points, one sentence each.",
    },
    body: {
      type: "string",
      description: "The full bedtime story as flowing prose.",
    },
  },
  required: ["tldr", "body"],
  additionalProperties: false,
};

const LENGTH_GUIDE: Record<string, string> = {
  "1 min": "about 120–180 words",
  "3 min": "about 300–450 words",
  "5 min": "about 600–800 words",
};

function buildUserPrompt(p: {
  character: string;
  lesson: string;
  length?: string;
  notes?: string;
  child?: { name?: string; age?: number | string; gender?: string; preferences?: string } | null;
}): string {
  const lengthTarget = LENGTH_GUIDE[p.length ?? ""] ?? "about 300–450 words";
  const lines = [
    `Write a soothing bedtime story for a child.`,
    ``,
    `- Main character: ${p.character}`,
    `- Lesson the story should gently teach: ${p.lesson}`,
    `- Target length: ${lengthTarget}`,
  ];
  if (p.child) {
    const bits: string[] = [];
    if (p.child.name) bits.push(`name: ${p.child.name}`);
    if (p.child.age !== undefined && p.child.age !== null && `${p.child.age}` !== "") bits.push(`age: ${p.child.age}`);
    if (p.child.gender) bits.push(`gender: ${p.child.gender}`);
    if (bits.length) lines.push(`- The child listening — ${bits.join(", ")} (tune vocabulary and length to their age).`);
    if (p.child.preferences) lines.push(`- The child's standing likes/dislikes: ${p.child.preferences}`);
  }
  if (p.notes && p.notes.trim()) lines.push(`- Extra request for tonight: ${p.notes.trim()}`);
  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth: the platform verifies the JWT (verify_jwt on), but require the header too.
  if (!req.headers.get("Authorization")) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Server not configured: ANTHROPIC_API_KEY is missing" }, 500);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const character = (payload?.character ?? "").toString().trim();
  const lesson = (payload?.lesson ?? "").toString().trim();
  if (!character || !lesson) return json({ error: "character and lesson are required" }, 400);

  const model = Deno.env.get("STORY_MODEL") || "claude-opus-5";

  const system =
    "You are a warm, gentle bedtime-story writer for young children. " +
    "Write calming, wholesome, age-appropriate stories with a soft, reassuring tone and a peaceful ending that helps a child drift off to sleep. " +
    "Never include anything scary, violent, sad-without-resolution, or otherwise unsuitable for a young child at bedtime. " +
    "Weave the requested lesson in naturally through the story rather than stating it as a moral. " +
    "Write the story in third person about the given character. " +
    "Return exactly 3 short 'quick peek' bullets in `tldr` and the full story in `body`.";

  const userPrompt = buildUserPrompt({
    character, lesson, length: payload?.length, notes: payload?.notes, child: payload?.child,
  });

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        // effort:low keeps a bedtime story fast and inexpensive; adaptive thinking stays on.
        output_config: { effort: "low", format: { type: "json_schema", schema: STORY_SCHEMA } },
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (e) {
    return json({ error: "Could not reach the Claude API: " + (e as Error).message }, 502);
  }

  const data = await anthropicRes.json().catch(() => null);
  if (!anthropicRes.ok) {
    return json({ error: data?.error?.message || `Claude API error (${anthropicRes.status})` }, 502);
  }
  if (data?.stop_reason === "refusal") {
    return json({ error: "The story request was declined. Try rephrasing the character or lesson." }, 422);
  }

  const textBlock = Array.isArray(data?.content) ? data.content.find((b: any) => b.type === "text") : null;
  if (!textBlock?.text) return json({ error: "No story returned by the model" }, 502);

  let parsed: any;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return json({ error: "Model returned malformed JSON" }, 502);
  }

  const tldr = Array.isArray(parsed?.tldr) ? parsed.tldr.map((t: unknown) => String(t)).slice(0, 3) : [];
  const body = typeof parsed?.body === "string" ? parsed.body : "";
  if (!tldr.length || !body) return json({ error: "Model response was incomplete" }, 502);

  return json({ tldr, body, model }, 200);
});
