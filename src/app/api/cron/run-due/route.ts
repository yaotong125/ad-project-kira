import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

function verifyBearer(header: string | null, secret: string): boolean {
  if (!header || !header.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice("Bearer ".length).trim());
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

async function handleCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured on the server." },
      { status: 503 },
    );
  }

  if (!verifyBearer(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY)?.trim();
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run scheduled jobs." },
      { status: 503 },
    );
  }

  const asOfParam = request.nextUrl.searchParams.get("asOf");
  const slugParam = request.nextUrl.searchParams.get("org");
  const asOf = asOfParam && /^\d{4}-\d{2}-\d{2}$/.test(asOfParam) ? asOfParam : null;
  const slug = slugParam && /^[a-z0-9-]+$/.test(slugParam) ? slugParam : null;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("run_scheduled_automations_system", {
    p_as_of: asOf,
    p_slug: slug,
  });

  if (error) {
    console.error("[cron/run-due] RPC error:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) }, { status: 200 });
}

/** Vercel Cron sends GET with Authorization: Bearer <CRON_SECRET>. */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

/** Also accepts POST for GitHub Actions / external schedulers. */
export async function POST(request: NextRequest) {
  return handleCron(request);
}
