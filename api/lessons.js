import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "./supabase-url.js";

function toClientLesson(row) {
  return {
    id: row.id,
    scope: row.scope,
    sourceType: row.source_type,
    lessonType: row.lesson_type,
    title: row.title,
    principle: row.principle,
    doExample: row.do_example,
    avoidExample: row.avoid_example,
    riskNote: row.risk_note,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

export default async function handler(req, res) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Missing Supabase server config" });
    return;
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const supabase = createClient(normalizeSupabaseUrl(process.env.SUPABASE_URL), process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("companion_lessons")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      res.status(500).json({ error: "Failed to load lessons", detail: error.message });
      return;
    }
    res.status(200).json({ lessons: (data || []).map(toClientLesson) });
    return;
  }

  if (req.method === "PATCH") {
    const { id, status } = req.body || {};
    if (!id || !["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "Invalid lesson update" });
      return;
    }
    const patch = {
      status,
      updated_at: new Date().toISOString(),
      approved_at: status === "approved" ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase
      .from("companion_lessons")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) {
      res.status(500).json({ error: "Failed to update lesson", detail: error.message });
      return;
    }
    res.status(200).json({ lesson: toClientLesson(data) });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
