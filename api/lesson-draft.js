import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "./supabase-url.js";

const BASE_URL = process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MODEL = process.env.QWEN_MODEL || "qwen-plus";

function extractJson(text) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeLesson(raw, material) {
  const fallback = {
    lesson_type: "empathy",
    title: "一条新的陪伴原则",
    principle: material.slice(0, 180),
    do_example: "先接住对方当下的感受，再给一个很小、很容易回应的出口。",
    avoid_example: "不要把对方的话立刻变成分析、说教或套路化亲密。",
    risk_note: "避免操控、PUA、性别刻板印象和制造依赖。",
  };
  const lesson = { ...fallback, ...(raw || {}) };
  const allowedTypes = new Set(["empathy", "romance", "boundary", "conversation", "safety"]);
  return {
    lesson_type: allowedTypes.has(lesson.lesson_type) ? lesson.lesson_type : "empathy",
    title: String(lesson.title || fallback.title).slice(0, 80),
    principle: String(lesson.principle || fallback.principle).slice(0, 700),
    do_example: String(lesson.do_example || fallback.do_example).slice(0, 500),
    avoid_example: String(lesson.avoid_example || fallback.avoid_example).slice(0, 500),
    risk_note: String(lesson.risk_note || fallback.risk_note).slice(0, 500),
  };
}

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
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing DASHSCOPE_API_KEY" });
    return;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Missing Supabase server config" });
    return;
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const { material = "", sourceType = "curated_note" } = req.body || {};
  const text = String(material).trim();
  if (text.length < 20 || text.length > 4000) {
    res.status(400).json({ error: "Material must be 20-4000 characters" });
    return;
  }

  const supabase = createClient(normalizeSupabaseUrl(process.env.SUPABASE_URL), process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  const system = [
    "你是小暖的情商学习整理器。",
    "任务：把用户提供的素材压缩成一条可审核的情商原则。",
    "原则必须温柔、健康、有边界；去掉PUA、操控、吊胃口、性别刻板印象、制造依赖、露骨成人内容。",
    "只输出 JSON，不要输出解释。",
    "JSON 字段：lesson_type, title, principle, do_example, avoid_example, risk_note。",
    "lesson_type 只能是 empathy, romance, boundary, conversation, safety 之一。",
  ].join("\n");

  const upstream = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      temperature: 0.35,
      max_tokens: 650,
      stream: false,
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    res.status(502).json({ error: "Qwen request failed", detail: errorText.slice(0, 500) });
    return;
  }

  const data = await upstream.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const lesson = normalizeLesson(extractJson(content), text);
  const { data: inserted, error } = await supabase
    .from("companion_lessons")
    .insert({
      user_id: userId,
      scope: "user",
      source_type: sourceType,
      lesson_type: lesson.lesson_type,
      title: lesson.title,
      principle: lesson.principle,
      do_example: lesson.do_example,
      avoid_example: lesson.avoid_example,
      risk_note: lesson.risk_note,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to save lesson", detail: error.message });
    return;
  }

  res.status(200).json({ lesson: toClientLesson(inserted) });
}
