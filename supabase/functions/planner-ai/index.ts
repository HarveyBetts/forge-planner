// Supabase Edge Function (Deno) — Forge planner AI.   STATUS: REFERENCE SKETCH, UNTESTED.
// Claude Code: finish, test with mocks, then deploy (see docs/HUMAN_TODO.md H5).
//
// Rules (docs/SECURITY.md): require a valid user JWT; enforce a hard per-user daily cap;
// the Anthropic key lives ONLY in function secrets; send scenario JSON only (never bank data);
// cap input and output size.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAILY_CAP = Number(Deno.env.get("AI_DAILY_CAP") ?? "30");
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5"; // verify current model id in the docs
const MAX_INPUT_CHARS = 20000;
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*", // set to the Pages origin in production
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return json({ error: "unauthorised" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: allowed, error: capErr } = await admin.rpc("bump_ai_usage", { p_user: user.id, p_cap: DAILY_CAP });
  if (capErr) return json({ error: "usage check failed" }, 500);
  if (!allowed) return json({ error: "daily AI limit reached" }, 429);

  let body: { question?: string; scenario?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const question = String(body.question ?? "").slice(0, 2000);
  const scenario = JSON.stringify(body.scenario ?? {}).slice(0, MAX_INPUT_CHARS);
  if (!question) return json({ error: "question required" }, 400);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system:
        "You are Forge's planning assistant. You get a user's financial scenario as JSON (real terms, today's money). " +
        "Explain trade-offs plainly, give ranges not certainties, state assumptions, and never present output as regulated financial advice. " +
        "If asked to change the plan, reply with a short explanation and a JSON patch inside a ```json block.",
      messages: [{ role: "user", content: `Scenario:\n${scenario}\n\nQuestion: ${question}` }],
    }),
  });
  if (!r.ok) return json({ error: "ai upstream error", status: r.status }, 502);
  const out = await r.json();
  const text = (out.content ?? []).filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text).join("\n");
  return json({ answer: text });
});
