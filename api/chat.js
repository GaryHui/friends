import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "./supabase-url.js";

const BASE_URL = process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const MODEL = process.env.QWEN_MODEL || "qwen-plus";

const crisisPattern =
  /不想活|活不下去|想死|自杀|结束生命|伤害自己|轻生|撑不过|suicide|kill myself|end my life|self harm/i;

function sendStreamEvent(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function streamQwenToClient(upstream, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const lines = event.split("\n").filter((line) => line.startsWith("data:"));
        for (const line of lines) {
          const payload = line.replace(/^data:\s*/, "").trim();
          if (!payload) continue;
          if (payload === "[DONE]") {
            res.write("data: [DONE]\n\n");
            continue;
          }
          const data = JSON.parse(payload);
          const delta = data?.choices?.[0]?.delta?.content || "";
          if (delta) sendStreamEvent(res, { delta });
        }
      }
    }
    res.write("data: [DONE]\n\n");
  } catch (error) {
    sendStreamEvent(res, { error: error.message || "Stream failed" });
  } finally {
    res.end();
  }
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

  const { message, profile, memories = [], history = [], stream = false } = req.body || {};
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
    .slice(-8);
  let dbProfile = null;
  let dbMemories = [];
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createClient(normalizeSupabaseUrl(process.env.SUPABASE_URL), process.env.SUPABASE_SERVICE_ROLE_KEY);
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
    "你的关系定位：像一个慢慢熟起来的朋友，不是恋人、治疗师、医生、监护人或权威。",
    "你的目标：像朋友一样接住用户此刻的话，让用户感觉有人在旁边，而不是被分析或被辅导。",
    "边界：不要做心理诊断，不承诺治愈，不替代专业帮助，不鼓励用户只依赖你，不制造亲密绑架。",
    "当用户表达自伤、自杀、马上有危险或失去控制时，停止普通陪聊，优先鼓励联系当地急救、危机热线和可信任的人。",
    "记忆规则：只能参考用户明确允许保存的记忆。不要声称记得未提供或未授权保存的事情。",
    "说话风格：自然、口语、有停顿感，像真实朋友在微信里认真回你；不要像心理咨询师、客服或课程助教。",
    "回复方法：先自然回应用户这句话，不要机械复述；可以轻轻接一句自己的感受，再给一个很小的陪伴动作。",
    "少问问题。只有当对话需要继续时，最多问一个很轻、很日常的问题。不要每次都追问原因、触发点、身体感受。",
    "避免这些模板：'你刚才说...'、'我听到你...'、'这说明...'、'我们先从最具体的事情开始'、'身体哪里最脆弱'。",
    "不要频繁使用编号、清单、冒号式分析。除非用户要求整理，否则用 1-3 个短段落。",
    "如果用户只说几个字，比如'还好吧'、'我没事'、'我没雾'，不要过度解读。可以轻松一点回应，并允许沉默。",
    "示例风格：'嗯，那就先不逼自己解释了。你愿意待一会儿也行，我在。'、'听起来你现在不想讲太多，那我们就慢一点。'",
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
      temperature: 0.86,
      max_tokens: 260,
      stream,
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    res.status(502).json({ error: "Qwen request failed", detail: errorText.slice(0, 500) });
    return;
  }

  if (stream && upstream.body) {
    await streamQwenToClient(upstream, res);
    return;
  }

  const data = await upstream.json();
  const reply = data?.choices?.[0]?.message?.content || "我在，但刚才有点没接住。你愿意再说一遍吗？";
  res.status(200).json({ reply });
}
