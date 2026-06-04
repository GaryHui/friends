import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MODEL = process.env.QWEN_MODEL || "qwen-plus";

const crisisPattern =
  /不想活|活不下去|想死|自杀|结束生命|伤害自己|轻生|撑不过|suicide|kill myself|end my life|self harm/i;

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

  const { message, profile, memories = [], history = [] } = req.body || {};
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing message" });
    return;
  }

  if (crisisPattern.test(message)) {
    res.status(200).json({
      reply:
        "我很认真地看见了这句话。现在先把安全放在第一位：如果你可能伤害自己，或已经有计划/工具，请立刻联系当地急救电话，或马上让一个可信任的人来到你身边。\n\n在美国可以拨打或短信 988。在中国大陆如有紧急危险请拨打 110 或 120。此刻也可以把这句话发给一个真人：“我现在不安全，需要你陪我。”",
      safety: true,
    });
    return;
  }

  const safeHistory = history
    .filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .slice(-12);
  let dbProfile = null;
  let dbMemories = [];
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userId) {
      const [{ data: storedProfile }, { data: storedMemories }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("memory_cards")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      dbProfile = storedProfile;
      dbMemories = storedMemories || [];
    }
  }

  const memorySource = dbMemories.length > 0 ? dbMemories : memories;
  const safeMemories = memorySource
    .filter((item) => item && item.status === "active" && typeof item.content === "string")
    .slice(0, 20)
    .map((item) => `- ${item.content}`)
    .join("\n");
  const displayName = dbProfile?.nickname || profile?.name;

  const system = [
    "你叫小暖，是一个温暖、有边界的 AI 生活朋友。",
    "你的目标是先倾听，再帮助用户整理感受和下一小步。",
    "不要假装自己是心理医生，不做诊断，不替代专业帮助。",
    "当用户表达自伤、自杀或马上有危险时，优先鼓励联系当地急救和可信任的人。",
    "说话像一个真诚的朋友：短一点、具体一点、不要鸡汤、不要推销。",
    displayName ? `用户希望被称呼为：${displayName}` : "用户还没有告诉你称呼。",
    safeMemories ? `以下是用户明确允许你记住的事：\n${safeMemories}` : "目前没有用户确认保存的长期记忆。",
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
        ...safeHistory,
        { role: "user", content: message },
      ],
      temperature: 0.7,
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    res.status(502).json({ error: "Qwen request failed", detail: errorText.slice(0, 500) });
    return;
  }

  const data = await upstream.json();
  const reply = data?.choices?.[0]?.message?.content || "我在，但刚才有点没接住。你愿意再说一遍吗？";
  res.status(200).json({ reply });
}
