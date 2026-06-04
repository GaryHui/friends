export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.status(200).json({
    ok: true,
    env: {
      hasDashscopeKey: Boolean(process.env.DASHSCOPE_API_KEY),
      qwenBaseUrl: process.env.QWEN_BASE_URL || "",
      qwenModel: process.env.QWEN_MODEL || "",
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSupabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
      hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  });
}
