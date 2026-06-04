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
  diaryOpen: false,
  diaryPageIndex: 0,
  selectedDiaryMessages: new Set(),
  memoryLoginNoticeShown: localStorage.getItem("nuanyou-memory-login-notice") === "1",
};

const responses = {
  gentle: [
    "嗯，我在。你不用把话说得很完整，先这样说一点也可以。",
    "那我们先不急着分析，坐一会儿也行。",
    "听起来你今天有点被磨住了。先别逼自己马上振作。",
  ],
  clear: [
    "我先陪你把话理顺一点，不急着下结论。",
    "先抓住一个最具体的点就好，别一下子处理全部。",
    "我们可以慢慢拆，不用把自己审问一遍。",
  ],
  hope: [
    "先把今晚过掉就好，不用一下子把人生都想明白。",
    "你能来这里说一句，其实已经是在给自己留一点余地了。",
    "我们先把这几分钟照顾好，后面的事晚一点再看。",
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
const diaryClosedEl = document.querySelector("#diary-closed");
const diaryOpenEl = document.querySelector("#diary-open");
const diaryBookEl = document.querySelector("#diary-book");
const diaryDaysEl = document.querySelector("#diary-days");
const diaryDateTitleEl = document.querySelector("#diary-date-title");
const diarySelectedCountEl = document.querySelector("#diary-selected-count");
const diaryEntryListEl = document.querySelector("#diary-entry-list");
const authPanelEl = document.querySelector("#auth-panel");
const authToggleEl = document.querySelector("#auth-toggle");
const authFormEl = document.querySelector("#auth-form");
const authStatusEl = document.querySelector("#auth-status");
const thinkingEl = document.querySelector("#thinking");
const memoryLoginNoteEl = document.querySelector("#memory-login-note");
const memoryLoginButtonEl = document.querySelector("#memory-login-button");
const roomWhisperEl = document.querySelector("#room-whisper");

function persist() {
  localStorage.setItem("nuanyou-tone", state.tone);
  localStorage.setItem("nuanyou-profile", JSON.stringify(state.profile));
  localStorage.setItem("nuanyou-memories", JSON.stringify(state.memories));
  localStorage.setItem("nuanyou-messages", JSON.stringify(state.messages));
  localStorage.setItem("nuanyou-moods", JSON.stringify(state.moods));
}

function createMessage(role, text, kind = "", options = {}) {
  const { persistNow = true, syncNow = true } = options;
  const message = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    role,
    text,
    kind,
    at: new Date().toISOString(),
  };
  state.messages.push(message);
  if (persistNow) persist();
  renderMessages();
  if (persistNow) renderRecords();
  if (syncNow) syncMessage(message);
  return message;
}

function addMessage(role, text, kind = "") {
  return createMessage(role, text, kind);
}

function updateMessage(message, text, options = {}) {
  const { persistNow = false, syncNow = false } = options;
  message.text = text;
  renderMessages();
  if (persistNow) {
    persist();
    renderRecords();
  }
  if (syncNow) syncMessage(message);
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
  const latestFriendMessage = [...state.messages].reverse().find((message) => message.role === "friend" && message.text);
  roomWhisperEl.textContent = latestFriendMessage
    ? latestFriendMessage.text.replace(/\s+/g, " ").slice(0, 86)
    : "我们可以慢慢说，不用一次讲清楚。";
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setThinking(isThinking) {
  thinkingEl.classList.toggle("hidden", !isThinking);
}

function shouldShowMemoryLoginNotice() {
  return state.supabase && !state.session && !state.memoryLoginNoticeShown;
}

function showMemoryLoginNotice() {
  state.memoryLoginNoticeShown = true;
  localStorage.setItem("nuanyou-memory-login-notice", "1");
  addMessage(
    "friend",
    "先轻轻提醒你一下：如果现在没有登录，我可以陪你聊，但这些长期记忆不会同步到你的账号里。等你愿意让小暖下次也认出你、记得你授权留下的事，可以点右上角“登录”建立档案；你仍然可以随时删除记录。",
  );
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

function formatDiaryDate(value) {
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function getDiaryDayKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDiaryPages() {
  const pages = new Map();
  state.messages
    .filter((message) => message.text)
    .forEach((message) => {
      const key = getDiaryDayKey(message.at);
      if (!pages.has(key)) {
        pages.set(key, {
          key,
          title: formatDiaryDate(message.at),
          messages: [],
        });
      }
      pages.get(key).messages.push(message);
    });
  return [...pages.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function clampDiaryPage() {
  const pages = getDiaryPages();
  if (pages.length === 0) {
    state.diaryPageIndex = 0;
    return pages;
  }
  state.diaryPageIndex = Math.max(0, Math.min(state.diaryPageIndex, pages.length - 1));
  return pages;
}

function renderRecords() {
  memoryListEl.innerHTML = "";

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

  diaryClosedEl.classList.toggle("hidden", state.diaryOpen);
  diaryOpenEl.classList.toggle("hidden", !state.diaryOpen);
  const pages = clampDiaryPage();
  diaryDaysEl.innerHTML = "";
  diaryEntryListEl.innerHTML = "";

  if (pages.length === 0) {
    diaryDateTitleEl.textContent = "还没有聊天记录";
    diarySelectedCountEl.textContent = "未选择";
    diaryDaysEl.innerHTML = '<p class="muted">开始聊几句后，这里会自动变成按天翻看的页面。</p>';
    diaryEntryListEl.innerHTML = '<p class="muted">这里还很空。等你和小暖聊过的话，会像电子书一样收在这里。</p>';
    return;
  }

  pages.forEach((page, index) => {
    const button = document.createElement("button");
    button.className = `diary-day ${index === state.diaryPageIndex ? "active" : ""}`.trim();
    button.type = "button";
    button.dataset.pageIndex = index;
    button.innerHTML = `<span>${page.title}</span><small>${page.messages.length} 条</small>`;
    diaryDaysEl.appendChild(button);
  });

  const page = pages[state.diaryPageIndex];
  diaryDateTitleEl.textContent = page.title;
  const selectedOnPage = page.messages.filter((message) => state.selectedDiaryMessages.has(message.id));
  diarySelectedCountEl.textContent = selectedOnPage.length ? `已选择 ${selectedOnPage.length} 条` : `第 ${state.diaryPageIndex + 1} / ${pages.length} 页`;

  page.messages.forEach((message) => {
    const item = document.createElement("article");
    item.className = "diary-entry";
    item.innerHTML = `
      <input type="checkbox" data-diary-select="${message.id}" ${state.selectedDiaryMessages.has(message.id) ? "checked" : ""} aria-label="选择这条记录" />
      <div>
        <small>${message.role === "friend" ? "小暖" : "你"} · ${formatTime(message.at)}</small>
        <p>${message.text}</p>
      </div>
      <div class="diary-entry-actions">
        <button data-diary-keep="${message.id}" type="button">保留</button>
        <button class="delete-record" data-message-id="${message.id}" type="button">删除</button>
      </div>
    `;
    diaryEntryListEl.appendChild(item);
  });
}

function turnDiaryPage(direction) {
  const pages = getDiaryPages();
  if (pages.length === 0) return;
  const nextIndex = Math.max(0, Math.min(state.diaryPageIndex + direction, pages.length - 1));
  if (nextIndex === state.diaryPageIndex) return;
  state.diaryPageIndex = nextIndex;
  diaryBookEl.classList.remove("flipping-next", "flipping-prev");
  diaryBookEl.classList.add(direction > 0 ? "flipping-next" : "flipping-prev");
  renderRecords();
  window.setTimeout(() => {
    diaryBookEl.classList.remove("flipping-next", "flipping-prev");
  }, 360);
}

function deleteMessagesByIds(messageIds) {
  if (messageIds.length === 0) return;
  state.messages = state.messages.filter((message) => !messageIds.includes(message.id));
  messageIds.forEach((id) => {
    state.selectedDiaryMessages.delete(id);
    deleteMessageRemote(id);
  });
  persist();
  renderMessages();
  renderRecords();
}

function deleteCurrentDiaryPage() {
  const pages = clampDiaryPage();
  const page = pages[state.diaryPageIndex];
  if (!page) return;
  deleteMessagesByIds(page.messages.map((message) => message.id));
}

function clearDiarySelection() {
  state.selectedDiaryMessages.clear();
  renderRecords();
}

function selectCurrentDiaryPage() {
  const pages = clampDiaryPage();
  const page = pages[state.diaryPageIndex];
  if (!page) return;
  page.messages.forEach((message) => state.selectedDiaryMessages.add(message.id));
  renderRecords();
}

function toggleDiaryMessage(messageId, isSelected) {
  if (isSelected) {
    state.selectedDiaryMessages.add(messageId);
  } else {
    state.selectedDiaryMessages.delete(messageId);
  }
  renderRecords();
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
      await syncLocalStateRemote();
      await loadCloudState();
    }

    state.supabase.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      updateAuthUi();
      if (session) {
        await syncLocalStateRemote();
        await loadCloudState();
      }
    });
  } catch {
    state.supabase = null;
    updateAuthUi();
  }
}

function updateAuthUi() {
  if (!state.supabase) {
    authToggleEl.textContent = "本地";
    authToggleEl.disabled = true;
    memoryLoginNoteEl.classList.remove("hidden");
    return;
  }
  authToggleEl.disabled = false;
  authToggleEl.textContent = state.session ? "退出" : "登录";
  authStatusEl.textContent = state.session ? "已登录，记录会同步到你的账号。" : "";
  memoryLoginNoteEl.classList.toggle("hidden", Boolean(state.session));
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

async function syncLocalStateRemote() {
  if (!state.supabase || !state.session) return;
  await saveProfileRemote();
  await Promise.all([
    ...state.messages.filter((message) => message.text).map((message) => syncMessage(message)),
    ...state.memories.filter((memory) => memory.status !== "deleted").map((memory) => syncMemory(memory)),
  ]);
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
    return `${base}\n\n孤单的时候，最难受的常常不是没人说话，是感觉自己像不被任何地方接住。你不用马上讲原因，可以先告诉我：现在是在房间里、路上，还是刚忙完？`;
  }

  if (/累|疲惫|没力气|撑不住|exhausted|tired/.test(lower)) {
    return `${base}\n\n如果只是累，那就先别给自己安排大道理了。可以先喝口水，或者把手机放低一点，给眼睛和肩膀松一松。`;
  }

  if (/焦虑|害怕|恐惧|panic|anxious/.test(lower)) {
    return `${base}\n\n焦虑上来的时候，人会很想把所有坏结果都预演一遍。我们先停一下：你现在最想先放下哪一件事？`;
  }

  return `${base}\n\n你可以继续说，也可以只发几个词。我会跟着你的节奏来。`;
}

function showCrisisSupport() {
  addMessage(
    "friend",
    "我很认真地看见了这句话。现在先把安全放在第一位：如果你可能伤害自己，或已经有计划/工具，请立刻联系当地急救电话，或马上让一个可信任的人来到你身边。\n\n在美国可以拨打或短信 988。在中国大陆如有紧急危险请拨打 110 或 120。此刻也可以把这句话发给一个真人：“我现在不安全，需要你陪我。”",
    "safety",
  );
  pageTitleEl.textContent = "先保护你自己";
}

function readJsonError(response, fallbackStatus) {
  return response
    .json()
    .catch(() => null)
    .then((data) => data || { error: fallbackStatus });
}

async function readStreamReply(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

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
        if (!payload || payload === "[DONE]") continue;
        const data = JSON.parse(payload);
        if (data.error) throw new Error(data.error);
        if (data.delta) {
          fullText += data.delta;
          onDelta(data.delta, fullText);
        }
      }
    }
  }

  return fullText;
}

async function getAiReply(text, onDelta) {
  if (location.protocol === "file:") {
    return makeReply(text);
  }

  const history = state.messages.slice(0, -1).slice(-8).map((message) => ({
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
        stream: true,
      }),
    });

    if (!response.ok) {
      const data = await readJsonError(response, response.status);
      return `小暖现在还没有连上真正的 AI。\n\n接口返回：${data.error || response.status}\n${data.detail ? `\n细节：${data.detail}` : ""}\n\n你可以先检查 Vercel 环境变量里有没有 DASHSCOPE_API_KEY、QWEN_BASE_URL、QWEN_MODEL。`;
    }

    if (response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
      const streamed = await readStreamReply(response, onDelta);
      return streamed || makeReply(text);
    }

    const data = await response.json();
    return data.reply || makeReply(text);
  } catch {
    return "小暖现在连不上后端接口，所以暂时只能用本地预设回复。请检查 Vercel 是否成功部署了 `/api/chat`，以及浏览器 Network 里 `/api/chat` 是否返回 200。";
  }
}

document.querySelector("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;

  addMessage("user", text);
  inputEl.value = "";
  setThinking(true);
  if (shouldShowMemoryLoginNotice()) {
    showMemoryLoginNotice();
  }
  const memoryCandidate = detectMemoryCandidate(text);

  window.setTimeout(async () => {
    try {
      if (hasCrisisLanguage(text)) {
        showCrisisSupport();
      } else {
        let streamedMessage = null;
        const reply = await getAiReply(text, (_delta, fullText) => {
          if (!streamedMessage) {
            setThinking(false);
            streamedMessage = createMessage("friend", "", "", { persistNow: false, syncNow: false });
          }
          updateMessage(streamedMessage, fullText);
        });
        if (streamedMessage) {
          updateMessage(streamedMessage, reply, { persistNow: true, syncNow: true });
        } else {
          addMessage("friend", reply);
        }
        if (memoryCandidate) {
          showMemoryRequest(memoryCandidate);
        }
      }
    } finally {
      setThinking(false);
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
  if (state.supabase && !state.session) {
    addMessage(
      "friend",
      "我可以先陪你聊，但如果你希望我下次也记得这件事，需要先用邮箱登录建立你的档案。登录后，你仍然可以随时删除这条记忆。",
    );
    authPanelEl.classList.remove("hidden");
    authStatusEl.textContent = "登录后再点“记住”，我才会把这件事放进你的长期记忆。";
    return;
  }
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

memoryLoginButtonEl.addEventListener("click", () => {
  if (!state.supabase) {
    authPanelEl.classList.remove("hidden");
    authStatusEl.textContent = "当前环境还没有连上 Supabase 登录配置；部署到 Vercel 并设置 Supabase 变量后，这里就可以发送邮箱登录链接。";
    return;
  }
  authPanelEl.classList.remove("hidden");
  authStatusEl.textContent = "输入邮箱后，我会发一封登录链接。登录后，小暖才会拥有账号记忆。";
  document.querySelector("#auth-email").focus();
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
      emailRedirectTo: `${location.origin}${location.pathname}`,
    },
  });
  authStatusEl.textContent = error ? `发送失败：${error.message}` : "登录链接已发送，请打开邮箱确认。";
});

window.addEventListener("hashchange", () => {
  state.supabase?.auth.getSession().then(({ data }) => {
    state.session = data.session;
    updateAuthUi();
    if (state.session) {
      syncLocalStateRemote().then(() => loadCloudState());
    }
  });
});

window.addEventListener("focus", () => {
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
      chat: "别觉得自己孤单，总会有人愿意陪你聊聊",
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
  state.selectedDiaryMessages.clear();
  persist();
  renderMessages();
  renderRecords();
  messageIds.forEach((id) => deleteMessageRemote(id));
  memoryIds.forEach((id) => deleteMemoryRemote(id));
});

document.querySelector("#open-diary").addEventListener("click", () => {
  state.diaryOpen = true;
  renderRecords();
});

document.querySelector("#close-diary").addEventListener("click", () => {
  state.diaryOpen = false;
  clearDiarySelection();
});

document.querySelector("#prev-diary-page").addEventListener("click", () => {
  turnDiaryPage(-1);
});

document.querySelector("#next-diary-page").addEventListener("click", () => {
  turnDiaryPage(1);
});

document.querySelector("#keep-selected-records").addEventListener("click", () => {
  clearDiarySelection();
});

document.querySelector("#select-day-records").addEventListener("click", () => {
  selectCurrentDiaryPage();
});

document.querySelector("#delete-selected-records").addEventListener("click", () => {
  deleteMessagesByIds([...state.selectedDiaryMessages]);
});

document.querySelector("#delete-day-records").addEventListener("click", () => {
  deleteCurrentDiaryPage();
});

document.querySelector("#records-view").addEventListener("click", (event) => {
  const memoryId = event.target.dataset.memoryId;
  const messageId = event.target.dataset.messageId;
  const diaryKeepId = event.target.dataset.diaryKeep;
  const pageIndex = event.target.dataset.pageIndex;
  if (pageIndex !== undefined) {
    const nextIndex = Number(pageIndex);
    if (!Number.isNaN(nextIndex)) {
      const direction = nextIndex > state.diaryPageIndex ? 1 : -1;
      state.diaryPageIndex = nextIndex;
      diaryBookEl.classList.remove("flipping-next", "flipping-prev");
      diaryBookEl.classList.add(direction > 0 ? "flipping-next" : "flipping-prev");
      renderRecords();
      window.setTimeout(() => {
        diaryBookEl.classList.remove("flipping-next", "flipping-prev");
      }, 360);
    }
  }
  if (diaryKeepId) {
    state.selectedDiaryMessages.delete(diaryKeepId);
    renderRecords();
  }
  if (memoryId) {
    state.memories = state.memories.filter((memory) => memory.id !== memoryId);
    deleteMemoryRemote(memoryId);
  }
  if (messageId) {
    deleteMessagesByIds([messageId]);
    return;
  }
  persist();
  renderMessages();
  renderRecords();
});

document.querySelector("#records-view").addEventListener("change", (event) => {
  const messageId = event.target.dataset.diarySelect;
  if (messageId) {
    toggleDiaryMessage(messageId, event.target.checked);
  }
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
updateAuthUi();
initSupabase();

if (state.profile) {
  appShellEl.classList.remove("intro-mode");
  topEyebrowEl.textContent = state.profile.name ? `欢迎你，${state.profile.name}` : "欢迎回来";
  switchView("chat");
} else {
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  document.querySelector("#intro-view").classList.add("active");
}
