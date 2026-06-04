const state = {
  tone: localStorage.getItem("nuanyou-tone") || "gentle",
  profile: JSON.parse(localStorage.getItem("nuanyou-profile") || "null"),
  memories: JSON.parse(localStorage.getItem("nuanyou-memories") || "[]"),
  pendingMemory: null,
  messages: JSON.parse(localStorage.getItem("nuanyou-messages") || "[]"),
  moods: JSON.parse(localStorage.getItem("nuanyou-moods") || "[]"),
  supabase: null,
  session: null,
  breathTimer: null,
  breathIndex: 0,
};

const responses = {
  gentle: [
    "我听见了。你现在不是在小题大做，而是在承受一件真的让你很累的事。",
    "先不用急着变好。我们就把这一刻放在桌面上，看清它一点点。",
    "你已经撑了很久。能把这句话说出来，本身就是在给自己留一盏灯。",
  ],
  clear: [
    "我们先把它拆开：事实是什么，你的感受是什么，你最需要被帮到的地方是什么？",
    "这件事现在很重，但它不等于你整个人生。先找一个今天能做的小动作。",
    "如果脑子里全是糟糕结论，先暂停评判，只记录此刻发生了什么。",
  ],
  hope: [
    "你没有被这一刻定义。哪怕只是往前挪一点点，也算数。",
    "我愿意陪你把今天过完。先从一杯水、一次深呼吸、一次求助开始。",
    "现在很暗，但你正在寻找出口。这个动作很重要，也很勇敢。",
  ],
};

const crisisPatterns = [
  /不想活|活不下去|想死|自杀|结束生命|伤害自己|轻生|撑不过/i,
  /suicide|kill myself|end my life|self harm/i,
];

const messagesEl = document.querySelector("#messages");
const inputEl = document.querySelector("#message-input");
const pageTitleEl = document.querySelector("#page-title");
const topEyebrowEl = document.querySelector("#top-eyebrow");
const appShellEl = document.querySelector("#app-shell");
const memoryRequestEl = document.querySelector("#memory-request");
const memoryTextEl = document.querySelector("#memory-text");
const memoryListEl = document.querySelector("#memory-list");
const chatRecordListEl = document.querySelector("#chat-record-list");
const authPanelEl = document.querySelector("#auth-panel");
const authToggleEl = document.querySelector("#auth-toggle");
const authFormEl = document.querySelector("#auth-form");
const authStatusEl = document.querySelector("#auth-status");

function persist() {
  localStorage.setItem("nuanyou-tone", state.tone);
  localStorage.setItem("nuanyou-profile", JSON.stringify(state.profile));
  localStorage.setItem("nuanyou-memories", JSON.stringify(state.memories));
  localStorage.setItem("nuanyou-messages", JSON.stringify(state.messages));
  localStorage.setItem("nuanyou-moods", JSON.stringify(state.moods));
}

function addMessage(role, text, kind = "") {
  const message = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    role,
    text,
    kind,
    at: new Date().toISOString(),
  };
  state.messages.push(message);
  persist();
  renderMessages();
  renderRecords();
  syncMessage(message);
}

function renderMessages() {
  messagesEl.innerHTML = "";
  if (state.messages.length === 0) {
    state.messages = [
      {
        role: "friend",
        text: getOpeningMessage(),
        at: new Date().toISOString(),
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      },
    ];
    persist();
  }

  state.messages.forEach((message) => {
    const bubble = document.createElement("div");
    bubble.className = `message ${message.role} ${message.kind || ""}`.trim();
    bubble.textContent = message.text;
    messagesEl.appendChild(bubble);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function renderRecords() {
  memoryListEl.innerHTML = "";
  chatRecordListEl.innerHTML = "";

  if (state.memories.length === 0) {
    memoryListEl.innerHTML = '<p class="muted">还没有长期记忆。小暖想记住什么，会先问你。</p>';
  } else {
    state.memories.forEach((memory) => {
      const item = document.createElement("article");
      item.className = "record-item";
      item.innerHTML = `
        <p>${memory.content}</p>
        <div class="record-meta">
          <span>${memory.type} · ${formatTime(memory.createdAt)}</span>
          <button class="delete-record" data-memory-id="${memory.id}" type="button">删除</button>
        </div>
      `;
      memoryListEl.appendChild(item);
    });
  }

  const userVisibleMessages = state.messages.filter((message) => message.text);
  if (userVisibleMessages.length === 0) {
    chatRecordListEl.innerHTML = '<p class="muted">还没有聊天记录。</p>';
  } else {
    userVisibleMessages.forEach((message) => {
      const item = document.createElement("article");
      item.className = "record-item";
      item.innerHTML = `
        <p>${message.text}</p>
        <div class="record-meta">
          <span>${message.role === "friend" ? "小暖" : "你"} · ${formatTime(message.at)}</span>
          <button class="delete-record" data-message-id="${message.id}" type="button">删除</button>
        </div>
      `;
      chatRecordListEl.appendChild(item);
    });
  }
}

function getOpeningMessage() {
  const name = state.profile?.name ? `${state.profile.name}，` : "";
  return `${name}我在。你可以从一句很乱的话开始，不需要组织好，也不需要显得坚强。`;
}

async function initSupabase() {
  if (location.protocol === "file:" || !window.supabase) return;

  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;
    const config = await response.json();
    if (!config.supabaseUrl || !config.supabaseAnonKey) return;

    state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;
    updateAuthUi();
    if (state.session) {
      await loadCloudState();
    }

    state.supabase.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      updateAuthUi();
      if (session) {
        await loadCloudState();
      }
    });
  } catch {
    state.supabase = null;
  }
}

function updateAuthUi() {
  if (!state.supabase) {
    authToggleEl.textContent = "本地";
    authToggleEl.disabled = true;
    return;
  }
  authToggleEl.textContent = state.session ? "退出" : "登录";
  authStatusEl.textContent = state.session ? "已登录，记录会同步到你的账号。" : "";
}

async function loadCloudState() {
  if (!state.supabase || !state.session) return;

  const userId = state.session.user.id;
  const [{ data: profile }, { data: memories }, { data: messages }] = await Promise.all([
    state.supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    state.supabase
      .from("memory_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    state.supabase
      .from("messages")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  if (profile) {
    state.profile = {
      name: profile.nickname || "",
      metAt: profile.created_at,
    };
    state.tone = profile.companion_tone || state.tone;
  }

  if (memories) {
    state.memories = memories.map((memory) => ({
      id: memory.id,
      type: memory.type,
      content: memory.content,
      status: memory.status,
      createdAt: memory.created_at,
    }));
  }

  if (messages && messages.length > 0) {
    state.messages = messages.map((message) => ({
      id: message.id,
      role: message.role === "assistant" ? "friend" : "user",
      text: message.content,
      at: message.created_at,
    }));
  }

  persist();
  appShellEl.classList.toggle("intro-mode", !state.profile);
  renderMessages();
  renderRecords();
  renderMoods();
}

async function saveProfileRemote() {
  if (!state.supabase || !state.session || !state.profile) return;
  await state.supabase.from("profiles").upsert({
    user_id: state.session.user.id,
    nickname: state.profile.name || null,
    companion_tone: state.tone,
    updated_at: new Date().toISOString(),
  });
}

async function syncMessage(message) {
  if (!state.supabase || !state.session || !message?.text) return;
  await state.supabase.from("messages").upsert({
    id: message.id,
    user_id: state.session.user.id,
    role: message.role === "friend" ? "assistant" : "user",
    content: message.text,
    created_at: message.at,
  });
}

async function syncMemory(memory) {
  if (!state.supabase || !state.session || !memory) return;
  await state.supabase.from("memory_cards").upsert({
    id: memory.id,
    user_id: state.session.user.id,
    type: memory.type || "preference",
    content: memory.content,
    status: memory.status || "active",
    sensitivity: memory.sensitivity || "low",
    created_at: memory.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function deleteMessageRemote(messageId) {
  if (!state.supabase || !state.session) return;
  await state.supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("user_id", state.session.user.id);
}

async function deleteMemoryRemote(memoryId) {
  if (!state.supabase || !state.session) return;
  await state.supabase
    .from("memory_cards")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", memoryId)
    .eq("user_id", state.session.user.id);
}

function hasCrisisLanguage(text) {
  return crisisPatterns.some((pattern) => pattern.test(text));
}

function detectMemoryCandidate(text) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const patterns = [
    {
      type: "preference",
      test: /叫我|称呼我|我叫|我的名字|可以叫我/,
      content: cleaned,
      prompt: `我听到你在说怎么称呼你。要不要让我以后记得：“${cleaned}”？`,
    },
    {
      type: "preference",
      test: /我喜欢|我不喜欢|不要.*安慰|别.*说教|希望你/,
      content: cleaned,
      prompt: `这像是你希望被陪伴的方式。要不要让我以后记得：“${cleaned}”？`,
    },
    {
      type: "trigger",
      test: /让我难受|让我崩溃|最怕|触发|一听到.*就|每次.*都会/,
      content: cleaned,
      prompt: `这可能是一个会刺痛你的触发点。要不要让我以后小心记得：“${cleaned}”？`,
    },
    {
      type: "support",
      test: /对我有用|能让我好一点|会舒服|缓过来|帮到我/,
      content: cleaned,
      prompt: `这像是一个能帮到你的办法。要不要让我以后记得：“${cleaned}”？`,
    },
  ];

  const match = patterns.find((item) => item.test.test(cleaned));
  if (!match || cleaned.length > 120) return null;
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type: match.type,
    content: match.content,
    prompt: match.prompt,
    createdAt: new Date().toISOString(),
  };
}

function showMemoryRequest(candidate) {
  state.pendingMemory = candidate;
  memoryTextEl.textContent = candidate.prompt;
  memoryRequestEl.classList.remove("hidden");
}

function hideMemoryRequest() {
  state.pendingMemory = null;
  memoryRequestEl.classList.add("hidden");
}

function makeReply(text) {
  const lower = text.toLowerCase();
  const base = responses[state.tone][Math.floor(Math.random() * responses[state.tone].length)];

  if (/复盘|review|总结|发生了什么/.test(lower)) {
    return `${base}\n\n我们按复盘来走：\n1. 发生了什么：先只写事实，不急着评价自己。\n2. 你被影响的点：是委屈、害怕、羞耻，还是失望？\n3. 可以做的一步：今晚只选一个动作，比如发一条消息、洗个澡、早点睡，或者把明天第一件事写下来。\n\n你不需要一次想明白全部。能把今天放下去一点，就已经是在照顾自己了。`;
  }

  if (/计划|今晚|明天|小计划|plan/.test(lower)) {
    return `${base}\n\n给你一个很小的今晚计划：\n1. 先喝水，离开屏幕 2 分钟。\n2. 写下“今天最重的一件事”和“我能放到明天的一件事”。\n3. 如果还有力气，给一个可信任的人发一句：我今天有点低落，想有人陪我说两句。\n\n计划不用漂亮，只要能让今晚轻一点。`;
  }

  if (/沟通|草稿|发给|怎么说|回复|message/.test(lower)) {
    return `${base}\n\n可以先这样写：\n“我今天状态不太好，不一定需要你立刻解决什么，只是想有个人听我说几句。如果你方便，能陪我聊一会儿吗？”\n\n不用写得完美。能让真实的人靠近你一点，就已经很好了。`;
  }

  if (/孤单|孤独|没人|alone|lonely/.test(lower)) {
    return `${base}\n\n孤独最折磨人的地方，是它会让你误以为“没有人会在乎”。此刻先让我陪你说下去：这种孤独最近是从什么时候变重的？`;
  }

  if (/累|疲惫|没力气|撑不住|exhausted|tired/.test(lower)) {
    return `${base}\n\n我们先不要求你解决整个人生。现在可以只做一个低消耗动作：喝水、坐直一点、或者给一个可信任的人发一句“我今天不太好”。`;
  }

  if (/焦虑|害怕|恐惧|panic|anxious/.test(lower)) {
    return `${base}\n\n试着告诉我：最让你害怕的画面是什么？如果它真的发生，你最需要谁或什么来帮你撑住？`;
  }

  return `${base}\n\n如果愿意，我们可以继续沿着这句话走：这件事里最刺痛你的部分是什么？`;
}

function showCrisisSupport() {
  addMessage(
    "friend",
    "我很认真地看见了这句话。现在先把安全放在第一位：如果你可能伤害自己，或已经有计划/工具，请立刻联系当地急救电话，或马上让一个可信任的人来到你身边。\n\n在美国可以拨打或短信 988。在中国大陆如有紧急危险请拨打 110 或 120。此刻也可以把这句话发给一个真人：“我现在不安全，需要你陪我。”",
    "safety",
  );
  pageTitleEl.textContent = "先保护你自己";
}

async function getAiReply(text) {
  if (location.protocol === "file:") {
    return makeReply(text);
  }

  const history = state.messages.slice(-12).map((message) => ({
    role: message.role === "friend" ? "assistant" : "user",
    content: message.text,
  }));

  try {
    const accessToken = state.session?.access_token;
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        message: text,
        profile: state.profile,
        memories: state.memories.slice(0, 20),
        history,
      }),
    });

    if (!response.ok) {
      return makeReply(text);
    }

    const data = await response.json();
    return data.reply || makeReply(text);
  } catch {
    return makeReply(text);
  }
}

document.querySelector("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;

  addMessage("user", text);
  inputEl.value = "";
  const memoryCandidate = detectMemoryCandidate(text);

  window.setTimeout(async () => {
    if (hasCrisisLanguage(text)) {
      showCrisisSupport();
    } else {
      const reply = await getAiReply(text);
      addMessage("friend", reply);
      if (memoryCandidate) {
        showMemoryRequest(memoryCandidate);
      }
    }
  }, 420);
});

document.querySelector("#clear-chat").addEventListener("click", () => {
  state.messages = [];
  persist();
  renderMessages();
  renderRecords();
});

document.querySelector("#remember-yes").addEventListener("click", () => {
  if (!state.pendingMemory) return;
  const memory = {
    ...state.pendingMemory,
    status: "active",
  };
  state.memories.unshift(memory);
  addMessage("friend", "好，我会记住这件事。以后我会更小心地按你的方式靠近你。");
  hideMemoryRequest();
  persist();
  renderRecords();
  syncMemory(memory);
});

document.querySelector("#remember-session").addEventListener("click", () => {
  addMessage("friend", "好，这次我会放在心上，但不会留下来。");
  hideMemoryRequest();
  persist();
});

document.querySelector("#remember-no").addEventListener("click", () => {
  addMessage("friend", "好，我不记。谢谢你告诉我边界。");
  hideMemoryRequest();
  persist();
});

document.querySelectorAll(".prompt-list button, .soft-prompts button").forEach((button) => {
  button.addEventListener("click", () => {
    inputEl.value = button.dataset.prompt;
    inputEl.focus();
  });
});

document.querySelectorAll(".segment").forEach((button) => {
  button.classList.toggle("active", button.dataset.tone === state.tone);
  button.addEventListener("click", () => {
    state.tone = button.dataset.tone;
    document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    persist();
  });
});

document.querySelectorAll(".intro-choice").forEach((button) => {
  button.addEventListener("click", () => {
    state.tone = button.dataset.tone;
    document.querySelectorAll(".intro-choice").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`.segment[data-tone="${state.tone}"]`)?.classList.add("active");
    persist();
  });
});

document.querySelector("#intro-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#nickname-input").value.trim();
  state.profile = {
    name,
    metAt: new Date().toISOString(),
  };
  state.messages = [];
  persist();
  renderMessages();
  switchView("chat");
  appShellEl.classList.remove("intro-mode");
  topEyebrowEl.textContent = name ? `欢迎你，${name}` : "欢迎你";
  saveProfileRemote();
});

document.querySelector("#reset-profile").addEventListener("click", () => {
  state.profile = null;
  state.messages = [];
  persist();
  renderRecords();
  appShellEl.classList.add("intro-mode");
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  document.querySelector("#intro-view").classList.add("active");
  pageTitleEl.textContent = "先认识一下，好吗？";
  topEyebrowEl.textContent = "第一次见面";
});

authToggleEl.addEventListener("click", async () => {
  if (!state.supabase) return;
  if (state.session) {
    await state.supabase.auth.signOut();
    state.session = null;
    updateAuthUi();
    return;
  }
  authPanelEl.classList.toggle("hidden");
});

authFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.supabase) return;
  const email = document.querySelector("#auth-email").value.trim();
  if (!email) return;
  authStatusEl.textContent = "正在发送登录链接...";
  const { error } = await state.supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: location.origin,
    },
  });
  authStatusEl.textContent = error ? `发送失败：${error.message}` : "登录链接已发送，请打开邮箱确认。";
});

window.addEventListener("hashchange", () => {
  state.supabase?.auth.getSession().then(({ data }) => {
    state.session = data.session;
    updateAuthUi();
  });
});

function switchView(view) {
  document.querySelectorAll(".nav-tab").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  document.querySelector(`#${view}-view`).classList.add("active");
  pageTitleEl.textContent =
    {
      chat: "今天可以不用一个人硬撑",
      mood: "给今天一个温柔的收尾",
      comfort: "先让身体慢下来",
      records: "你可以决定哪些留下",
      plans: "一些以后可以再打开的陪伴",
      safety: "需要时，请先联系真人",
    }[view] || "暖友";
  if (view !== "plans") {
    topEyebrowEl.textContent =
      view === "chat" && state.profile?.name ? `欢迎你，${state.profile.name}` : "欢迎回来";
  }
  if (view === "records") {
    renderRecords();
  }
}

document.querySelectorAll(".nav-tab, .tiny-member").forEach((button) => {
  button.addEventListener("click", () => {
    switchView(button.dataset.view);
  });
});

document.querySelector("#clear-all-records").addEventListener("click", () => {
  const messageIds = state.messages.map((message) => message.id);
  const memoryIds = state.memories.map((memory) => memory.id);
  state.messages = [];
  state.memories = [];
  persist();
  renderMessages();
  renderRecords();
  messageIds.forEach((id) => deleteMessageRemote(id));
  memoryIds.forEach((id) => deleteMemoryRemote(id));
});

document.querySelector("#records-view").addEventListener("click", (event) => {
  const memoryId = event.target.dataset.memoryId;
  const messageId = event.target.dataset.messageId;
  if (memoryId) {
    state.memories = state.memories.filter((memory) => memory.id !== memoryId);
    deleteMemoryRemote(memoryId);
  }
  if (messageId) {
    state.messages = state.messages.filter((message) => message.id !== messageId);
    deleteMessageRemote(messageId);
  }
  persist();
  renderMessages();
  renderRecords();
});

const moodRange = document.querySelector("#mood-range");
const moodValue = document.querySelector("#mood-value");
moodRange.addEventListener("input", () => {
  moodValue.textContent = moodRange.value;
});

function renderMoods() {
  const list = document.querySelector("#mood-list");
  list.innerHTML = "";
  if (state.moods.length === 0) {
    list.innerHTML = '<p class="muted">还没有复盘记录。第一次记录不需要准确，只需要诚实。</p>';
    return;
  }

  state.moods.slice(0, 6).forEach((mood) => {
    const item = document.createElement("article");
    item.className = "mood-item";
    item.innerHTML = `<strong>${mood.label} ${mood.score}/10</strong><p>${mood.note || "没有补充文字"}</p><small>${mood.time}</small>`;
    list.appendChild(item);
  });
}

document.querySelector("#mood-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.moods.unshift({
    score: moodRange.value,
    label: document.querySelector("#mood-label").value,
    note: document.querySelector("#mood-note").value.trim(),
    time: new Date().toLocaleString("zh-CN", { hour12: false }),
  });
  document.querySelector("#mood-note").value = "";
  persist();
  renderMoods();
});

document.querySelector("#clear-moods").addEventListener("click", () => {
  state.moods = [];
  persist();
  renderMoods();
});

const breathSteps = [
  { label: "吸气", className: "expand", copy: "慢慢吸气，让肩膀放松。" },
  { label: "停留", className: "", copy: "停留两秒，不需要用力。" },
  { label: "呼气", className: "contract", copy: "把气缓慢呼出，像放下一点重量。" },
];

document.querySelector("#start-breath").addEventListener("click", () => {
  const circle = document.querySelector("#breath-circle");
  const copy = document.querySelector("#breath-copy");
  const button = document.querySelector("#start-breath");

  if (state.breathTimer) {
    window.clearInterval(state.breathTimer);
    state.breathTimer = null;
    button.textContent = "开始";
    circle.textContent = "吸气";
    circle.className = "breath-circle";
    copy.textContent = "跟着圆圈节奏：吸气 4 秒，停留 2 秒，呼气 6 秒。";
    return;
  }

  button.textContent = "暂停";
  state.breathIndex = 0;
  const tick = () => {
    const step = breathSteps[state.breathIndex % breathSteps.length];
    circle.textContent = step.label;
    circle.className = `breath-circle ${step.className}`.trim();
    copy.textContent = step.copy;
    state.breathIndex += 1;
  };
  tick();
  state.breathTimer = window.setInterval(tick, 4000);
});

document.querySelectorAll("#step-grid button").forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("done");
  });
});

renderMessages();
renderMoods();
renderRecords();
initSupabase();

if (state.profile) {
  appShellEl.classList.remove("intro-mode");
  topEyebrowEl.textContent = state.profile.name ? `欢迎你，${state.profile.name}` : "欢迎回来";
  switchView("chat");
} else {
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  document.querySelector("#intro-view").classList.add("active");
}
