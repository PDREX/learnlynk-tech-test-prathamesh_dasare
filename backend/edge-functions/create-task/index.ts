// index.ts — Edge Function (fetches tenant_id from application before insert)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0";

const SUPABASE_URL = "https://zwfldlbyujrzlnozrlkw.supabase.co";
// REPLACE this with your project's anon public key (for UI deployment)
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3ZmxkbGJ5dWpyemxub3pybGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Mzg1NjQsImV4cCI6MjA4MDQxNDU2NH0.wdo-XQhISw-jlUKlDUkazjcmITOCRclwt8ECc1c2Zas";

const ALLOWED_TYPES = ["call", "email", "review"];

serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

    const bearer = req.headers.get("authorization") ?? "";
    const token = bearer.startsWith("Bearer ") ? bearer.split(" ")[1] : null;

    // Create supabase client with anon key
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

    // If caller provided a JWT, attach it (so RLS will treat request as that user)
    if (token) {
      // setAuth attaches Authorization header for subsequent requests
      try { supabase.auth.setAuth(token); } catch (e) { /* ignore if not supported */ }
    }

    const body = await req.json().catch(() => ({}));
    const { application_id, task_type, due_at, title } = body ?? {};

    if (!application_id) return json({ success: false, error: "application_id required" }, 400);
    if (!task_type) return json({ success: false, error: "task_type required" }, 400);
    if (!ALLOWED_TYPES.includes(task_type)) {
      return json({ success: false, error: `task_type must be one of: ${ALLOWED_TYPES.join(", ")}` }, 400);
    }
    if (!due_at) return json({ success: false, error: "due_at required (ISO 8601)" }, 400);

    const dueDate = new Date(due_at);
    if (isNaN(dueDate.getTime())) return json({ success: false, error: "due_at is not a valid date" }, 400);
    if (dueDate <= new Date()) return json({ success: false, error: "due_at must be in the future" }, 400);

    // Fetch application to obtain tenant_id (and confirm application exists)
    const { data: app, error: appError } = await supabase
      .from("applications")
      .select("id, tenant_id")
      .eq("id", application_id)
      .maybeSingle();

    if (appError) {
      console.error("Failed to fetch application:", appError);
      return json({ success: false, error: "Failed to fetch application", details: appError }, 500);
    }
    if (!app) {
      return json({ success: false, error: "application_id not found" }, 400);
    }
    if (!app.tenant_id) {
      return json({ success: false, error: "application missing tenant_id" }, 500);
    }

    // Build insert payload using tenant_id from application
    const payload = {
      application_id,
      type: task_type,
      due_at: dueDate.toISOString(),
      title: title ?? null,
      tenant_id: app.tenant_id,
      status: "open",
    };

    const { data: insertData, error: insertError } = await supabase
      .from("tasks")
      .insert(payload)
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("Insert error:", insertError);
      return json({ success: false, error: "DB insert failed", details: insertError }, 500);
    }
    if (!insertData || !insertData.id) {
      return json({ success: false, error: "DB insert did not return id" }, 500);
    }

    return json({ success: true, task_id: insertData.id }, 200);
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ success: false, error: "Unexpected error", details: String(err) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
