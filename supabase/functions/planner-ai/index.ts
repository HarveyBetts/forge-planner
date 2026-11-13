// Supabase Edge Function (Deno): Forge planner AI. All the logic lives in handler.js (tested in Node with
// mocks: tests/planner-ai.test.js). This file only wires in the real services.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets; see docs/HUMAN_TODO.md H5):
//   ANTHROPIC_API_KEY   required — lives ONLY here, never in the app or in git
//   AI_DAILY_CAP        optional, default 20 questions per person per day (UTC)
//   ALLOWED_ORIGIN      optional, default https://harveybetts.github.io (comma-separate several)
//   ANTHROPIC_MODEL     optional, default claude-opus-5-5
//   AI_EFFORT           optional, low | medium | high (default medium)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import Anthropic from "npm:@anthropic-ai/sdk@1.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { createHandler } from "./handler.js";

const env = (name: string) => Deno.env.get(name) ?? "";

const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 1, timeout: 120_000 });
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handler = createHandler({
  env: { get: env },
  // Verifies the user's access token with Supabase Auth (signature, expiry, not signed out).
  async getUser(token: string) {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data?.user ? null : { id: data.user.id };
  },
  // Atomic per-user daily counter (supabase/schema.sql → bump_ai_usage). true = still under the cap.
  async bumpUsage(userId: string, cap: number) {
    const { data, error } = await admin.rpc("bump_ai_usage", { p_user: userId, p_cap: cap });
    if (error) throw new Error("usage check failed");
    return data === true;
  },
  // deno-lint-ignore no-explicit-any
  callModel: (params: any) => anthropic.beta.messages.create(params),
  // Status codes only: never the question, the plan, tokens or upstream error text.
  log: (event: string, fields: Record<string, unknown>) => console.log(JSON.stringify({ event, ...fields })),
});

Deno.serve(handler);
