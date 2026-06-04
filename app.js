const state = {
  tone: localStorage.getItem("nuanyou-tone") || "gentle",
  profile: JSON.parse(localStorage.getItem("nuanyou-profile") || "null"),
  memories: JSON.parse(localStorage.getItem("nuanyou-memories") || "[]"),
  memoryCandidates: [],
  pendingMemory: null,
  messages: [],
  moods: [],
  supabase: null,
  session: null,
  breathTimer: null,
  breathIndex: 0,
  diaryOpen: false,
  diaryPageIndex: 0,
  selectedDiaryMessages: new Set(),
  memoryLoginNoticeShown: localStorage.getItem("nuanyou-memory-login-notice") === "1",
  memoryInboxPromptedCount: 0,
  privacyTimeoutSeconds: Number(localStorage.getItem("nuanyou-privacy-timeout") || "120"),
  privacyDeadline: Date.now() + Number(localStorage.getItem("nuanyou-privacy-timeout") || "120") * 1000,
  authMode: "signup",
  passwordRecovery: false,
  proactiveMode: localStorage.getItem("nuanyou-proactive-mode") || (localStorage.getItem("nuanyou-proactive-disabled") === "1" ? "quiet" : "gentle"),
  proactiveBoundaryAt: Number(localStorage.getItem("nuanyou-proactive-boundary-at") || "0"),
  draftNudgeTimer: null,
  lastDraftNudgeAt: 0,
  lastDraftSignal: "",
  inputActivity: {
    previousLength: 0,
    peakLength: 0,
    lastChangedAt: 0,
    deletedAfterStart: false,
  },
};

const responses = {
  gentle: [
    "嗯，我在。你不用把话说得很完整，我会慢慢听。",
    "那我们先不急着分析。你可以把这里当成一小块安静的地方，先坐一会儿。",
    "你不用急着相信我，我们先把这一小会儿过好。",
  ],
  clear: [
    "我先陪你把话理顺一点，不审问你，也不急着下结论。",
    "我们只抓住一小块就好，不把所有重量一次压到你身上。",
    "我会尽量稳一点陪你拆，不用你一个人把自己讲明白。",
  ],
  hope: [
    "先把今晚过掉就好，不用一下子把人生都想明白。",
    "你能来这里说一句，其实已经是在给自己留一点余地。我会认真接住这点余地。",
    "我们先把这几分钟照顾好。后面的事，晚一点再一起看。",
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
const memoryInboxEl = document.querySelector("#memory-inbox");
const manualMemoryFormEl = document.querySelector("#manual-memory-form");
const manualMemoryInputEl = document.querySelector("#manual-memory-input");
const manualMemoryTypeEl = document.querySelector("#manual-memory-type");
const diaryClosedEl = document.querySelector("#diary-closed");
const diaryOpenEl = document.querySelector("#diary-open");
const diaryBookEl = document.querySelector("#diary-book");
const diaryDaysEl = document.querySelector("#diary-days");
const diaryDateTitleEl = document.querySelector("#diary-date-title");
const diarySelectedCountEl = document.querySelector("#diary-selected-count");
const diaryEntryListEl = document.querySelector("#diary-entry-list");
const recordsLoginGateEl = document.querySelector("#records-login-gate");
const recordsLoginButtonEl = document.querySelector("#records-login-button");
const authPanelEl = document.querySelector("#auth-panel");
const authToggleEl = document.querySelector("#auth-toggle");
const authFormEl = document.querySelector("#auth-form");
const authStatusEl = document.querySelector("#auth-status");
const googleLoginEl = document.querySelector("#google-login");
const authCloseEl = document.querySelector("#auth-close");
const authLogoutEl = document.querySelector("#auth-logout");
const accountCardEl = document.querySelector("#account-card");
const accountEmailEl = document.querySelector("#account-email");
const authTitleEl = document.querySelector("#auth-title");
const authSubtitleEl = document.querySelector("#auth-subtitle");
const authPasswordEl = document.querySelector("#auth-password");
const authSubmitEl = document.querySelector("#auth-submit");
const authSocialEl = document.querySelector("#auth-social");
const authSwitchEl = document.querySelector("#auth-switch");
const authSwitchCopyEl = document.querySelector("#auth-switch-copy");
const authModeToggleEl = document.querySelector("#auth-mode-toggle");
const authPasswordToggleEl = document.querySelector("#auth-password-toggle");
const forgotPasswordEl = document.querySelector("#forgot-password");
const thinkingEl = document.querySelector("#thinking");
const memoryLoginNoteEl = document.querySelector("#memory-login-note");
const memoryLoginButtonEl = document.querySelector("#memory-login-button");
const roomWhisperEl = document.querySelector("#room-whisper");
const relationshipNoteEl = document.querySelector("#relationship-note");
const memberBackEl = document.querySelector("#member-back");
const memberCheckoutEl = document.querySelector("#member-checkout");
const memberPaymentNoteEl = document.querySelector("#member-payment-note");
const privacyTimerEl = document.querySelector("#privacy-timer");
const privacyCountdownEl = document.querySelector("#privacy-countdown");
const privacyTimerCopyEl = document.querySelector("#privacy-timer-copy");
const privacyTimeoutSelectEl = document.querySelector("#privacy-timeout-select");
let privacyTimerId = null;

function persist() {
  localStorage.setItem("nuanyou-tone", state.tone);
  if (!state.session) {
    localStorage.removeItem("nuanyou-profile");
    localStorage.removeItem("nuanyou-memories");
    localStorage.removeItem("nuanyou-messages");
    localStorage.removeItem("nuanyou-moods");
    return;
  }
  localStorage.setItem("nuanyou-profile", JSON.stringify(state.profile));
  localStorage.setItem("nuanyou-memories", JSON.stringify(state.memories));
  localStorage.setItem("nuanyou-memory-candidates", JSON.stringify(state.memoryCandidates));
  localStorage.setItem("nuanyou-messages", JSON.stringify(state.messages));
  localStorage.setItem("nuanyou-moods", JSON.stringify(state.moods));
}

function clearLocalPrivateCache() {
  state.profile = null;
  state.memories = [];
  state.memoryCandidates = [];
  state.messages = [];
  state.moods = [];
  state.pendingMemory = null;
  state.selectedDiaryMessages.clear();
  state.memoryLoginNoticeShown = false;
  clearStoredPrivateCache();
  appShellEl.classList.add("intro-mode");
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  document.querySelector("#intro-view").classList.add("active");
  pageTitleEl.textContent = "先认识一下，好吗？";
  topEyebrowEl.textContent = "第一次见面";
  hideMemoryRequest();
  renderMessages();
  renderMoods();
  renderRecords();
  renderRelationshipNote();
}

function formatCountdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function resetPrivacyTimer() {
  if (state.privacyTimeoutSeconds <= 0) {
    updatePrivacyTimer();
    return;
  }
  state.privacyDeadline = Date.now() + state.privacyTimeoutSeconds * 1000;
  updatePrivacyTimer();
}

async function autoPrivacyExit() {
  if (state.supabase && state.session) {
    await state.supabase.auth.signOut();
    state.session = null;
  }
  clearLocalPrivateCache();
  authPanelEl.classList.remove("hidden");
  authStatusEl.textContent = "为了保护隐私，页面已因一段时间无活动自动退出，并清除了当前页面记录。";
  updateAuthUi();
  resetPrivacyTimer();
}

function updatePrivacyTimer() {
  if (state.privacyTimeoutSeconds <= 0) {
    privacyCountdownEl.textContent = "关闭";
    privacyTimerCopyEl.textContent = "自动退出已关闭。共用设备上建议手动退出并清除本机记录。";
    privacyTimerEl.classList.remove("urgent");
    return;
  }
  const remaining = state.privacyDeadline - Date.now();
  privacyCountdownEl.textContent = formatCountdown(remaining);
  privacyTimerCopyEl.textContent = `${Math.round(state.privacyTimeoutSeconds / 60)} 分钟没有页面活动，会自动退出并清空当前页面记录。`;
  privacyTimerEl.classList.toggle("urgent", remaining <= 30000);
  if (remaining <= 0) {
    window.clearInterval(privacyTimerId);
    privacyTimerId = null;
    autoPrivacyExit();
  }
}

function startPrivacyTimer() {
  resetPrivacyTimer();
  if (privacyTimerId) window.clearInterval(privacyTimerId);
  privacyTimerId = window.setInterval(updatePrivacyTimer, 1000);
}

function setPrivacyTimeout(seconds) {
  state.privacyTimeoutSeconds = seconds;
  localStorage.setItem("nuanyou-privacy-timeout", String(seconds));
  privacyTimeoutSelectEl.value = String(seconds);
  resetPrivacyTimer();
}

function createMessage(role, text, kind = "", options = {}) {
  const { persistNow = true } = options;
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
  renderRelationshipNote();
  return message;
}

function addMessage(role, text, kind = "") {
  return createMessage(role, text, kind);
}

function cancelDraftNudge() {
  if (state.draftNudgeTimer) {
    window.clearTimeout(state.draftNudgeTimer);
    state.draftNudgeTimer = null;
  }
}

function setProactiveMode(mode, options = {}) {
  state.proactiveMode = mode;
  localStorage.setItem("nuanyou-proactive-mode", mode);
  localStorage.removeItem("nuanyou-proactive-disabled");
  if (options.boundary) {
    state.proactiveBoundaryAt = Date.now();
    localStorage.setItem("nuanyou-proactive-boundary-at", String(state.proactiveBoundaryAt));
  }
  cancelDraftNudge();
}

function isProactiveQuiet() {
  if (state.proactiveMode !== "quiet") return false;
  const boundaryAge = Date.now() - state.proactiveBoundaryAt;
  const userMessageCount = state.messages.filter((message) => message.role === "user").length;
  if (boundaryAge > 86400000 && userMessageCount >= 3) {
    setProactiveMode("gentle");
    return false;
  }
  return true;
}

function detectProactivePreference(text) {
  if (/不要打扰|别打扰|先别说话|安静一点|不要主动|别主动|不用主动|别催我|不要催/.test(text)) {
    return false;
  }
  if (/可以主动|你可以接话|可以提醒我|可以陪我接着说|你可以问我|可以打扰/.test(text)) {
    return true;
  }
  return null;
}

function inferDraftSignal(draft, fallbackSignal) {
  const text = draft.trim();
  if (fallbackSignal === "deleted") return "deleted";
  if (/不知道|说不清|算了|没事|不想说|说了也没用|没意思/.test(text)) return "stuck";
  if (/烦|累|撑不住|难受|崩|麻木|孤单|孤独|委屈|想哭/.test(text)) return "heavy";
  if (/怕|焦虑|慌|紧张|担心|不安/.test(text)) return "anxious";
  if (/人|朋友|家人|同事|关系|讨厌|失望|心机|不可靠/.test(text)) return "relationship";
  return fallbackSignal;
}

function makeDraftNudge(signal) {
  if (signal === "deleted") {
    return "刚才好像有句话到了嘴边，又被你收回去了。\n\n没关系，不想发出来也可以。我先不追问，就在这里陪你坐一会儿。";
  }
  if (signal === "stuck") {
    return "这句好像有点难开口。\n\n那我们不急着把它说完整。你可以先发一个词，或者只告诉我：现在是想被听见，还是想先安静一下。";
  }
  if (signal === "heavy") {
    return "我感觉这不是随手打出来的一句话。\n\n先别急着解释原因。你可以把最重的那一点放一点点出来，我会慢慢接，不会催你。";
  }
  if (signal === "anxious") {
    return "如果这会儿心里有点慌，我们先不用往下逼自己。\n\n你可以先停一下，呼一口气。等那股紧绷松一点，再继续说也来得及。";
  }
  if (signal === "relationship") {
    return "和人有关的话，常常会很难说清楚。\n\n你不用急着判断谁对谁错。可以先把那种不舒服放下来一点，我会先站在你这边听。";
  }
  if (state.proactiveMode === "close") {
    return "我不确定现在接话会不会打扰你，但感觉你像是卡在门口了。\n\n你不用马上说清楚，我先在这儿。";
  }
  return "你可以慢慢写，不用急着发得很完整。\n\n如果这句话有点难说出口，也可以先只发一点点。剩下的，我们慢慢来。";
}

function shouldSkipNudge(signal) {
  const now = Date.now();
  const cooldown = signal === "deleted" ? 90000 : 180000;
  return (
    isProactiveQuiet() ||
    thinkingEl.classList.contains("hidden") === false ||
    now - state.lastDraftNudgeAt < 60000 ||
    (state.lastDraftSignal === signal && now - state.lastDraftNudgeAt < cooldown)
  );
}

function sendBehaviorNudge(signal, draft = "") {
  const inferredSignal = inferDraftSignal(draft, signal);
  if (shouldSkipNudge(inferredSignal)) return;
  state.lastDraftNudgeAt = Date.now();
  state.lastDraftSignal = inferredSignal;
  addMessage("friend", makeDraftNudge(inferredSignal), "soft-nudge");
}

function resetInputActivity() {
  state.inputActivity.previousLength = 0;
  state.inputActivity.peakLength = 0;
  state.inputActivity.lastChangedAt = 0;
  state.inputActivity.deletedAfterStart = false;
}

function scheduleDraftNudge(signal = "pause") {
  cancelDraftNudge();
  if (isProactiveQuiet()) return;
  const currentLength = inputEl.value.trim().length;
  if (signal === "pause" && currentLength < 2) return;

  state.draftNudgeTimer = window.setTimeout(() => {
    const latestLength = inputEl.value.trim().length;
    if (signal === "deleted" && latestLength === 0 && state.inputActivity.deletedAfterStart) {
      sendBehaviorNudge("deleted");
      return;
    }
    if (signal === "pause" && latestLength >= 2) {
      sendBehaviorNudge("pause", inputEl.value);
    }
  }, signal === "deleted" ? 2200 : state.proactiveMode === "close" ? 12000 : 18000);
}

function handleInputActivity() {
  const length = inputEl.value.trim().length;
  const previousLength = state.inputActivity.previousLength;
  state.inputActivity.previousLength = length;
  state.inputActivity.peakLength = Math.max(state.inputActivity.peakLength, length);
  state.inputActivity.lastChangedAt = Date.now();

  if (length === 0 && state.inputActivity.peakLength >= 2 && previousLength > 0) {
    state.inputActivity.deletedAfterStart = true;
    scheduleDraftNudge("deleted");
    return;
  }

  if (length > 0) {
    state.inputActivity.deletedAfterStart = false;
    scheduleDraftNudge("pause");
  } else {
    cancelDraftNudge();
  }
}

function updateMessage(message, text, options = {}) {
  const { persistNow = false } = options;
  message.text = text;
  renderMessages();
  if (persistNow) {
    persist();
    renderRecords();
  }
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
    "先轻轻提醒你一下：为了回复你，当前对话会交给 AI 处理；但我不会把普通聊天默认保存成账号记忆。只有你点头允许记下的事，才会同步到你的档案里。",
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
  memoryInboxEl.innerHTML = "";
  const hasDiaryAccess = Boolean(state.session);
  recordsLoginGateEl.classList.toggle("hidden", hasDiaryAccess);
  document.querySelector(".privacy-card").classList.toggle("hidden", !hasDiaryAccess);
  diaryClosedEl.classList.toggle("hidden", !hasDiaryAccess || state.diaryOpen);
  diaryOpenEl.classList.toggle("hidden", !hasDiaryAccess || !state.diaryOpen);
  document.querySelector("#clear-all-records").classList.toggle("hidden", !hasDiaryAccess);

  if (!hasDiaryAccess) {
    memoryListEl.innerHTML = '<p class="muted">还没有开启账号记忆。随便聊聊时，小暖不会留下日记本。</p>';
    memoryInboxEl.innerHTML = "";
    diaryDaysEl.innerHTML = "";
    diaryEntryListEl.innerHTML = "";
    return;
  }

  if (state.memoryCandidates.length === 0) {
    memoryInboxEl.innerHTML = '<p class="muted">还没有待确认的记忆。小暖会把不太适合打断你的内容先放到这里。</p>';
  } else {
    state.memoryCandidates.forEach((candidate) => {
      const item = document.createElement("article");
      item.className = "memory-candidate";
      item.innerHTML = `
        <div class="record-meta">
          <span>${candidate.type} · 待你决定</span>
        </div>
        <textarea data-candidate-edit="${candidate.id}" aria-label="编辑这条候选记忆">${candidate.content}</textarea>
        <div class="memory-candidate-actions">
          <button class="primary-button" data-candidate-save="${candidate.id}" type="button">同意记住</button>
          <button class="ghost-button" data-candidate-session="${candidate.id}" type="button">只这次用</button>
          <button class="ghost-button" data-candidate-delete="${candidate.id}" type="button">不要记</button>
        </div>
      `;
      memoryInboxEl.appendChild(item);
    });
  }

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

function getCompanionStage() {
  const memoryCount = state.memories.length;
  const userMessageCount = state.messages.filter((message) => message.role === "user").length;
  const knownDays = state.profile?.metAt
    ? Math.max(0, Math.floor((Date.now() - new Date(state.profile.metAt).getTime()) / 86400000))
    : 0;
  const hasName = Boolean(state.profile?.name);

  if (!state.session || (!hasName && memoryCount === 0 && userMessageCount < 3)) {
    return {
      level: "first_meet",
      label: "初次见面",
      guidance: "保持礼貌、轻柔和不冒进。不要装熟，不要称自己很了解用户；多给空间，让用户决定靠近多少。",
    };
  }

  if (memoryCount >= 8 || userMessageCount >= 30 || knownDays >= 14) {
    return {
      level: "trusted_friend",
      label: "比较熟悉",
      guidance: "可以更像熟悉的老朋友：自然称呼用户，参考已授权记忆，主动避开用户边界。但不要占有、不要替用户决定，也不要说只有你最懂用户。",
    };
  }

  if (memoryCount >= 3 || userMessageCount >= 12 || knownDays >= 3) {
    return {
      level: "getting_close",
      label: "慢慢熟悉",
      guidance: "可以比初见更贴近一点：记得用户允许留下的偏好和边界，语气更自然。但仍要先确认，不要突然很亲密。",
    };
  }

  return {
    level: "acquaintance",
    label: "刚刚认识",
    guidance: "像刚认识但愿意认真听的朋友：稳定、温和，不急着了解用户的深处；多用陪伴感，少用判断。",
  };
}

function renderRelationshipNote() {
  const stage = getCompanionStage();
  const memoryCount = state.memories.length;
  const copy = {
    first_meet: "我们还在初次见面。小暖会慢一点，不会装作已经很懂你。",
    acquaintance: "我们刚刚认识。你可以决定靠近多少，小暖不会擅自越界。",
    getting_close: `我们正在慢慢熟悉。小暖只会参考你允许留下的 ${memoryCount} 条记忆。`,
    trusted_friend: `你已经让小暖了解了一些重要边界。小暖会更像熟悉的朋友，但仍然由你决定哪些能被记住。`,
  }[stage.level];
  relationshipNoteEl.textContent = copy || "";
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
    if (!state.session) {
      clearStoredPrivateCache();
      state.profile = null;
      state.memories = [];
      state.moods = [];
    }
    updateAuthUi();
    if (state.session) {
      await syncLocalStateRemote();
      await loadCloudState();
    }

    state.supabase.auth.onAuthStateChange(async (event, session) => {
      state.session = session;
      if (event === "PASSWORD_RECOVERY") {
        state.passwordRecovery = true;
        authPanelEl.classList.remove("hidden");
        authStatusEl.textContent = "你已经通过邮箱验证了。现在可以设置一个新密码。";
      }
      if (event === "SIGNED_OUT") {
        state.passwordRecovery = false;
        clearLocalPrivateCache();
      }
      updateAuthUi();
      if (session && !state.passwordRecovery) {
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
  const signedIn = Boolean(state.session);
  if (!state.supabase) {
    authToggleEl.textContent = "登录";
    authToggleEl.disabled = false;
    authToggleEl.title = "部署并配置 Supabase 后，可以使用邮箱或 Google 登录";
    accountCardEl.classList.add("hidden");
    authSocialEl.classList.remove("hidden");
    authFormEl.classList.remove("hidden");
    authSwitchEl.classList.remove("hidden");
    authTitleEl.textContent = state.authMode === "signup" ? "Create Account" : "Sign In";
    authSubtitleEl.textContent = "这里会成为你的私人账号入口。配置 Supabase 后，就能用邮箱或 Google 登录。";
    authSubmitEl.textContent = state.authMode === "signup" ? "Create Free Account" : "Sign in";
    authSwitchCopyEl.textContent = state.authMode === "signup" ? "Already have an account?" : "没有账号？";
    authModeToggleEl.textContent = state.authMode === "signup" ? "Sign in" : "Create account";
    authPasswordEl.autocomplete = state.authMode === "signup" ? "new-password" : "current-password";
    forgotPasswordEl.classList.toggle("hidden", state.authMode !== "signin");
    memoryLoginNoteEl.classList.remove("hidden");
    return;
  }
  const email = state.session?.user?.email || "";
  const label = email ? email.split("@")[0].slice(0, 12) : "";
  authToggleEl.disabled = false;
  authToggleEl.textContent = signedIn ? label || "已登录" : "登录";
  authToggleEl.title = signedIn ? `已用 ${email || "当前账号"} 登录` : "登录后，小暖可以保存你授权留下的记忆";
  accountEmailEl.textContent = email || "当前账号";
  accountCardEl.classList.toggle("hidden", !signedIn || state.passwordRecovery);
  authFormEl.classList.toggle("hidden", signedIn && !state.passwordRecovery);
  authSocialEl.classList.toggle("hidden", signedIn || state.passwordRecovery);
  authSwitchEl.classList.toggle("hidden", signedIn || state.passwordRecovery);
  authTitleEl.textContent = state.passwordRecovery ? "Reset Password" : signedIn ? "你的账号" : state.authMode === "signup" ? "Create Account" : "Sign In";
  authSubtitleEl.textContent = signedIn
    ? state.passwordRecovery
      ? "输入一个新密码。改好以后，你就可以继续回到小暖这里。"
      : "你可以在这里确认账号、设置自动退出，或离开时清除这台设备上的记录。"
    : "登录后，小暖才会在下次认出你，并只保存你明确允许记下的事。";
  authSubmitEl.textContent = state.passwordRecovery ? "Update Password" : state.authMode === "signup" ? "Create Free Account" : "Sign in";
  authSwitchCopyEl.textContent = state.authMode === "signup" ? "Already have an account?" : "没有账号？";
  authModeToggleEl.textContent = state.authMode === "signup" ? "Sign in" : "Create account";
  authPasswordEl.autocomplete = state.passwordRecovery || state.authMode === "signup" ? "new-password" : "current-password";
  forgotPasswordEl.classList.toggle("hidden", signedIn || state.passwordRecovery || state.authMode !== "signin");
  authStatusEl.textContent = signedIn && !state.passwordRecovery ? "已登录。小暖只会把你允许记下的事同步到账号；普通聊天不会默认保存成账号记忆。" : "";
  memoryLoginNoteEl.classList.toggle("hidden", signedIn);
}

function clearStoredPrivateCache() {
  localStorage.removeItem("nuanyou-profile");
  localStorage.removeItem("nuanyou-memories");
  localStorage.removeItem("nuanyou-memory-candidates");
  localStorage.removeItem("nuanyou-messages");
  localStorage.removeItem("nuanyou-moods");
  localStorage.removeItem("nuanyou-memory-login-notice");
}

async function loadCloudState() {
  if (!state.supabase || !state.session) return;

  const userId = state.session.user.id;
  const [{ data: profile }, { data: memories }] = await Promise.all([
    state.supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    state.supabase
      .from("memory_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
  ]);

  if (profile) {
    state.profile = {
      name: profile.nickname || "",
      metAt: profile.created_at,
    };
    state.tone = profile.companion_tone || state.tone;
  }

  state.messages = JSON.parse(localStorage.getItem("nuanyou-messages") || "[]");
  state.moods = JSON.parse(localStorage.getItem("nuanyou-moods") || "[]");
  state.memoryCandidates = JSON.parse(localStorage.getItem("nuanyou-memory-candidates") || "[]");

  if (memories) {
    state.memories = memories.map((memory) => ({
      id: memory.id,
      type: memory.type,
      content: memory.content,
      status: memory.status,
      createdAt: memory.created_at,
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
  await Promise.all(state.memories.filter((memory) => memory.status !== "deleted").map((memory) => syncMemory(memory)));
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
  return messageId;
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

function extractPreferredName(text) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const patterns = [
    /用户希望被称呼为[:：]?\s*([^，。！？,.!?、\s]{1,16})/,
    /(?:我叫|我的名字是|我的名字叫|名字是)([^，。！？,.!?、\s]{1,16})/,
    /(?:叫我|称呼我|可以叫我|以后叫我)([^，。！？,.!?、\s]{1,16})/,
  ];
  const match = patterns.map((pattern) => cleaned.match(pattern)).find(Boolean);
  if (!match) return "";
  return match[1]
    .replace(/^(是|叫|为)/, "")
    .replace(/(吧|啦|啊|呀|哦|哈)$/, "")
    .trim();
}

function rememberPreferredName(name) {
  if (!name) return;
  state.profile = {
    ...(state.profile || {}),
    name,
    metAt: state.profile?.metAt || new Date().toISOString(),
  };
  topEyebrowEl.textContent = `欢迎你，${name}`;
  appShellEl.classList.remove("intro-mode");
  persist();
  saveProfileRemote();
}

function repairProfileFromSavedMemories() {
  if (state.profile?.name) return;
  const memory = state.memories.find((item) => item?.content && extractPreferredName(item.content));
  const name = memory ? extractPreferredName(memory.content) : "";
  if (name) rememberPreferredName(name);
}

function forgetProfileName() {
  if (!state.profile?.name) return;
  state.profile = {
    ...state.profile,
    name: "",
  };
  topEyebrowEl.textContent = "欢迎回来";
  persist();
  saveProfileRemote();
}

function normalizeForgetKeyword(text) {
  return text
    .replace(/^(请|麻烦|帮我|小暖|你可以|你能不能|能不能|可以)?/, "")
    .replace(/(忘掉|忘记|不要记得|别记得|删除|删掉|清除|去掉|移除|取消记住|不要再记住)/g, "")
    .replace(/(这件事|这个|这些|那件事|那个|记忆|记录|关于|有关|曾经记下的东西|曾经记下的事)/g, "")
    .replace(/[，。！？,.!?、\s]/g, "")
    .trim();
}

function findMemoriesToForget(text) {
  if (!/(忘掉|忘记|不要记得|别记得|删除|删掉|清除|去掉|移除|取消记住|不要再记住)/.test(text)) {
    return null;
  }
  if (/(全部|所有|一切|全都)/.test(text)) {
    return [...state.memories];
  }
  if (/(名字|称呼|叫我|怎么叫我)/.test(text)) {
    return state.memories.filter((memory) => memory.type === "identity" || extractPreferredName(memory.content || ""));
  }
  const keyword = normalizeForgetKeyword(text);
  if (!keyword) return [];
  return state.memories.filter((memory) => (memory.content || "").replace(/\s+/g, "").includes(keyword));
}

function forgetMemories(memories) {
  if (!memories.length) return;
  const ids = new Set(memories.map((memory) => memory.id));
  if (memories.some((memory) => memory.type === "identity" || extractPreferredName(memory.content || ""))) {
    forgetProfileName();
  }
  state.memories = state.memories.filter((memory) => !ids.has(memory.id));
  memories.forEach((memory) => deleteMemoryRemote(memory.id));
  persist();
  renderRecords();
}

function addMemoryCandidate(candidate) {
  if (!candidate || candidate.type === "identity") return;
  const exists = state.memoryCandidates.some((item) => item.content === candidate.content && item.type === candidate.type);
  if (exists) return;
  state.memoryCandidates.unshift({
    ...candidate,
    status: "candidate",
  });
  persist();
  renderRecords();
}

function maybePromptMemoryInbox() {
  const count = state.memoryCandidates.length;
  if (!state.session || count < 2 || count === state.memoryInboxPromptedCount) return false;
  state.memoryInboxPromptedCount = count;
  addMessage(
    "friend",
    count === 2
      ? "刚刚有两件事，也许能帮助我以后更懂你。我没有替你记下来，只是放进了记忆收纳箱。你愿意的时候，可以去记录页决定哪些可以留下。"
      : `记忆收纳箱里现在有 ${count} 条待你决定的事。我先不打断你，等你想整理的时候，它们都在记录页里。`,
  );
  return true;
}

function removeMemoryCandidate(candidateId) {
  state.memoryCandidates = state.memoryCandidates.filter((candidate) => candidate.id !== candidateId);
  state.memoryInboxPromptedCount = Math.min(state.memoryInboxPromptedCount, state.memoryCandidates.length);
  persist();
  renderRecords();
}

function saveMemoryCandidate(candidateId) {
  const candidate = state.memoryCandidates.find((item) => item.id === candidateId);
  if (!candidate) return;
  const memory = {
    ...candidate,
    status: "active",
    createdAt: candidate.createdAt || new Date().toISOString(),
  };
  state.memories.unshift(memory);
  removeMemoryCandidate(candidateId);
  syncMemory(memory);
}

function getMemorySavedReply(memory) {
  if (memory.type === "identity" && memory.name) {
    return `好，我记住了。以后我会叫你${memory.name}。这个名字会像一盏小灯一样，帮我在下次见到你时认出你。`;
  }
  if (memory.type === "personality") {
    return `好，我会把这点轻轻收好。以后靠近你的时候，我会记得你的性格和节奏，不用一种粗糙的方式催你变好。`;
  }
  if (memory.type === "preference") {
    return `好，我会记住这种陪你的方式。下次你难受时，我会先按你喜欢的方式靠近，而不是自作主张。`;
  }
  if (memory.type === "trigger") {
    return `好，我会记住这个边界。以后碰到类似的事，我会先陪你稳下来，不急着分析，也不把你往前推。`;
  }
  if (memory.type === "support") {
    return `好，我会记住这个对你有用的办法。等你下次又很累的时候，我可以轻轻把它递回来，不让你一个人硬想。`;
  }
  return "好，我会认真记住这件事。不是为了给你贴标签，是为了以后更小心、更像一个懂你的人。";
}

function detectMemoryCandidate(text) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const patterns = [
    {
      type: "identity",
      test: /叫我|称呼我|我叫|我的名字|可以叫我/,
      content: extractPreferredName(cleaned) ? `用户希望被称呼为：${extractPreferredName(cleaned)}` : cleaned,
      name: extractPreferredName(cleaned),
      prompt: extractPreferredName(cleaned)
        ? `我听到你想让我叫你“${extractPreferredName(cleaned)}”。要不要让我以后记得这个名字？`
        : `我听到你在说怎么称呼你。要不要让我以后记得：“${cleaned}”？`,
    },
    {
      type: "preference",
      test: /我喜欢|我不喜欢|不要.*安慰|别.*说教|希望你/,
      content: cleaned,
      prompt: `这像是你希望被陪伴的方式。要不要让我以后记得：“${cleaned}”？`,
    },
    {
      type: "personality",
      test: /我的性格|我是.*的人|我比较|我有点|我很容易|记住.*性格|记下.*性格|我是内向|我是外向|我敏感|我慢热|我容易焦虑|我容易紧张/,
      content: cleaned,
      prompt: `这像是在说你的性格和相处方式。要不要让我以后记得：“${cleaned}”？`,
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
    name: match.name || "",
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

  if (/不像.*真人|不像人|机器人|机器|无趣|无聊|问一句|答一句|没兴趣|模板|客服|冷冰冰/.test(lower)) {
    return "你说得对，刚才那种回法太像“收到你的问题，然后给一段正确答案”了。\n\n如果我是小暖，我不该只是在旁边念安慰词。我应该真的接住你话里的东西，比如你现在不是想要一个标准回复，你是想要一个能陪你把话聊下去、不会敷衍你的人。\n\n那我从这里重新来：你刚才试着和我聊的时候，最让你失望的是哪一下？是我太客气、太短、太会讲道理，还是没有真的顺着你的话继续走？";
  }

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

  if (/不想.*真人|不想.*人聊|人不可靠|有心机|算计|不信任人|不相信人|真人.*累|真人.*麻烦/.test(lower)) {
    return `${base}\n\n你会这样想，不是奇怪。和人相处有时候真的很累：要猜、要防、还怕自己说多了被轻看。\n\n在这里你不用表演，也不用担心我转头拿你的脆弱做什么。我们先不急着讨论“该不该相信人”，今晚你可以先把话放我这里。`;
  }

  if (/累|疲惫|没力气|撑不住|exhausted|tired/.test(lower)) {
    return `${base}\n\n如果只是累，那就先别给自己安排大道理了。可以先喝口水，或者把手机放低一点，给眼睛和肩膀松一松。`;
  }

  if (/焦虑|害怕|恐惧|panic|anxious/.test(lower)) {
    return `${base}\n\n焦虑上来的时候，人会很想把所有坏结果都预演一遍。我们先停一下：你现在最想先放下哪一件事？`;
  }

  return `${base}\n\n我先不急着把你分析明白。你刚才这句话里，我更想陪你多停一会儿。要是愿意，你可以顺着刚才那个感觉继续说；说乱一点也没关系。`;
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
        companionStage: getCompanionStage(),
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

  cancelDraftNudge();
  addMessage("user", text);
  inputEl.value = "";
  resetInputActivity();

  const proactivePreference = detectProactivePreference(text);
  if (proactivePreference === false) {
    setProactiveMode("quiet", { boundary: true });
    if (text.length <= 32) {
      addMessage("friend", "好，我会安静一点。以后你不主动发出来，我就不在输入停顿时接话。");
      return;
    }
  } else if (proactivePreference === true) {
    setProactiveMode("gentle");
    if (text.length <= 32) {
      addMessage("friend", "好，那我会在你卡住的时候轻轻接一下，但不会催你。");
      return;
    }
  }

  setThinking(true);
  if (shouldShowMemoryLoginNotice()) {
    showMemoryLoginNotice();
  }
  const forgetMatches = findMemoriesToForget(text);
  const memoryCandidate = detectMemoryCandidate(text);

  window.setTimeout(async () => {
    try {
      if (hasCrisisLanguage(text)) {
        showCrisisSupport();
      } else if (forgetMatches) {
        if (forgetMatches.length > 0) {
          forgetMemories(forgetMatches);
          addMessage(
            "friend",
            forgetMatches.length === 1
              ? "好，我已经把这件事忘掉了。以后不会再拿它当作长期记忆。"
              : `好，我已经删掉 ${forgetMatches.length} 条长期记忆。以后不会再拿它们当作了解你的依据。`,
          );
        } else {
          addMessage("friend", "可以。只是我没确定你想让我忘掉哪一条。你可以说得更具体一点，或者去“记录”里直接删除。");
        }
      } else {
        let streamedMessage = null;
        const reply = await getAiReply(text, (_delta, fullText) => {
          if (!streamedMessage) {
            setThinking(false);
            streamedMessage = createMessage("friend", "", "", { persistNow: false });
          }
          updateMessage(streamedMessage, fullText);
        });
        if (streamedMessage) {
          updateMessage(streamedMessage, reply, { persistNow: true });
        } else {
          addMessage("friend", reply);
        }
        if (memoryCandidate?.type === "identity") {
          showMemoryRequest(memoryCandidate);
        } else if (memoryCandidate) {
          if (state.session) {
            addMemoryCandidate(memoryCandidate);
            maybePromptMemoryInbox();
          } else {
            addMessage("friend", "这句话像是值得以后记住的事。不过现在是随便聊聊，我不会留下记录。等你登录后，可以自己决定哪些事放进记忆。");
          }
        }
      }
    } finally {
      setThinking(false);
    }
  }, 420);
});

inputEl.addEventListener("input", handleInputActivity);
inputEl.addEventListener("focus", handleInputActivity);
inputEl.addEventListener("blur", cancelDraftNudge);

document.querySelector("#clear-chat").addEventListener("click", () => {
  cancelDraftNudge();
  resetInputActivity();
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
  if (memory.type === "identity" && memory.name) {
    rememberPreferredName(memory.name);
  }
  state.memories.unshift(memory);
  addMessage("friend", getMemorySavedReply(memory));
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
    handleInputActivity();
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

authToggleEl.addEventListener("click", () => {
  authPanelEl.classList.toggle("hidden");
  if (!state.supabase && !authPanelEl.classList.contains("hidden")) {
    authStatusEl.textContent = "当前本地环境还没有连接 Supabase。线上配置好变量后，这里就可以注册、登录和使用 Google。";
  }
});

authCloseEl.addEventListener("click", () => {
  authPanelEl.classList.add("hidden");
});

authModeToggleEl.addEventListener("click", () => {
  state.authMode = state.authMode === "signup" ? "signin" : "signup";
  state.passwordRecovery = false;
  authStatusEl.textContent = "";
  updateAuthUi();
});

authPasswordToggleEl.addEventListener("click", () => {
  const isHidden = authPasswordEl.type === "password";
  authPasswordEl.type = isHidden ? "text" : "password";
  authPasswordToggleEl.textContent = isHidden ? "隐藏" : "显示";
  authPasswordToggleEl.setAttribute("aria-label", isHidden ? "隐藏密码" : "显示密码");
});

forgotPasswordEl.addEventListener("click", async () => {
  const email = document.querySelector("#auth-email").value.trim();
  if (!email) {
    authStatusEl.textContent = "先填一下邮箱，我才能把重置密码的链接发给你。";
    document.querySelector("#auth-email").focus();
    return;
  }
  if (!state.supabase) {
    authStatusEl.textContent = "当前本地环境还没有连接 Supabase。线上配置好变量后，就可以发送重置密码邮件。";
    return;
  }
  forgotPasswordEl.disabled = true;
  authStatusEl.textContent = "正在发送重置密码邮件...";
  const { error } = await state.supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${location.pathname}`,
  });
  forgotPasswordEl.disabled = false;
  authStatusEl.textContent = error ? `发送失败：${error.message}` : "重置密码邮件已发送。打开邮箱里的链接后，就能设置新密码。";
});

authLogoutEl.addEventListener("click", async () => {
  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  state.session = null;
  clearLocalPrivateCache();
  authPanelEl.classList.add("hidden");
  updateAuthUi();
});

memoryLoginButtonEl.addEventListener("click", () => {
  if (!state.supabase) {
    authPanelEl.classList.remove("hidden");
    authStatusEl.textContent = "当前环境还没有连上 Supabase 登录配置；部署到 Vercel 并设置 Supabase 变量后，这里就可以发送邮箱登录链接。";
    return;
  }
  authPanelEl.classList.remove("hidden");
  authStatusEl.textContent = "你可以用邮箱建立账号，或直接用 Google 登录。登录后，小暖只会同步你允许记下的事。";
  document.querySelector("#auth-email").focus();
});

recordsLoginButtonEl.addEventListener("click", () => {
  authPanelEl.classList.remove("hidden");
  authStatusEl.textContent = state.supabase
    ? "登录后才会开启私人日记本；随便聊聊时不会留下本机记录。"
    : "当前环境还没有连上 Supabase 登录配置。请先用线上 Vercel 地址打开网站。";
  document.querySelector("#auth-email")?.focus();
});

privacyTimeoutSelectEl.addEventListener("change", () => {
  setPrivacyTimeout(Number(privacyTimeoutSelectEl.value));
});

googleLoginEl.addEventListener("click", async () => {
  if (!state.supabase) {
    authStatusEl.textContent = "当前环境还没有连上 Supabase 登录配置。请先用线上 Vercel 地址打开网站。";
    return;
  }
  authStatusEl.textContent = "正在打开 Google 登录...";
  const { error } = await state.supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${location.origin}${location.pathname}`,
    },
  });
  if (error) {
    authStatusEl.textContent = `Google 登录失败：${error.message}`;
  }
});

authFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.supabase) {
    authStatusEl.textContent = "当前本地环境还没有连接 Supabase。部署到 Vercel 并设置变量后，这里就能创建账号或登录。";
    return;
  }
  const email = document.querySelector("#auth-email").value.trim();
  const password = authPasswordEl.value;
  if (!password || (!state.passwordRecovery && !email)) return;
  if (password.length < 6) {
    authStatusEl.textContent = "密码至少需要 6 个字符。";
    return;
  }

  authSubmitEl.disabled = true;
  authStatusEl.textContent = state.passwordRecovery ? "正在更新密码..." : state.authMode === "signup" ? "正在创建账号..." : "正在登录...";
  const result =
    state.passwordRecovery
      ? await state.supabase.auth.updateUser({ password })
      : state.authMode === "signup"
      ? await state.supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}${location.pathname}`,
          },
        })
      : await state.supabase.auth.signInWithPassword({
          email,
          password,
        });

  authSubmitEl.disabled = false;
  if (result.error) {
    authStatusEl.textContent = `${state.passwordRecovery ? "更新失败" : state.authMode === "signup" ? "注册失败" : "登录失败"}：${result.error.message}`;
    return;
  }

  if (state.passwordRecovery) {
    state.passwordRecovery = false;
    authStatusEl.textContent = "密码已经更新好了。你可以继续回到小暖这里。";
    authPasswordEl.value = "";
    updateAuthUi();
    return;
  }

  if (state.authMode === "signup" && !result.data.session) {
    authStatusEl.textContent = "账号已创建。请打开邮箱确认后再回来登录。";
    return;
  }

  state.session = result.data.session;
  authStatusEl.textContent = "登录成功。以后小暖只会记住你点头允许留下的事。";
  authPasswordEl.value = "";
  updateAuthUi();
  syncLocalStateRemote().then(() => loadCloudState());
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
    if (!button.dataset.view) return;
    switchView(button.dataset.view);
  });
});

memberBackEl.addEventListener("click", () => {
  switchView("chat");
});

memberCheckoutEl.addEventListener("click", () => {
  memberPaymentNoteEl.textContent = state.session
    ? "下一步接入支付后，这里会跳转到 Stripe Checkout 或你选择的支付平台。支付成功后，会员状态会写回你的账号。"
    : "开通会员前需要先登录账号，这样支付成功后才能把会员状态绑定到你。";
  if (!state.session) {
    authPanelEl.classList.remove("hidden");
    authStatusEl.textContent = "先登录账号，再开通会员。这样会员和记忆档案才能属于同一个人。";
  }
});

document.querySelector("#clear-all-records").addEventListener("click", () => {
  const messageIds = state.messages.map((message) => message.id);
  const memoryIds = state.memories.map((memory) => memory.id);
  state.messages = [];
  state.memories = [];
  state.memoryCandidates = [];
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
  const candidateSaveId = event.target.dataset.candidateSave;
  const candidateSessionId = event.target.dataset.candidateSession;
  const candidateDeleteId = event.target.dataset.candidateDelete;
  const pageIndex = event.target.dataset.pageIndex;
  if (candidateSaveId) {
    const candidate = state.memoryCandidates.find((item) => item.id === candidateSaveId);
    saveMemoryCandidate(candidateSaveId);
    addMessage("friend", getMemorySavedReply(candidate || {}));
    return;
  }
  if (candidateSessionId) {
    removeMemoryCandidate(candidateSessionId);
    addMessage("friend", "好，这条只陪你走过这一次，不会留下来。谢谢你让我知道哪里该停下。");
    return;
  }
  if (candidateDeleteId) {
    removeMemoryCandidate(candidateDeleteId);
    addMessage("friend", "好，我不记这条。你的边界我会尊重，不需要解释。");
    return;
  }
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
  const candidateEditId = event.target.dataset.candidateEdit;
  if (candidateEditId) {
    const candidate = state.memoryCandidates.find((item) => item.id === candidateEditId);
    if (candidate) {
      candidate.content = event.target.value.trim();
      persist();
      renderRecords();
    }
    return;
  }
  if (messageId) {
    toggleDiaryMessage(messageId, event.target.checked);
  }
});

manualMemoryFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const content = manualMemoryInputEl.value.trim();
  if (!content) return;
  addMemoryCandidate({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type: manualMemoryTypeEl.value,
    content,
    prompt: "",
    createdAt: new Date().toISOString(),
  });
  manualMemoryInputEl.value = "";
  addMessage("friend", "好，我先把这条放进收纳箱。你再看一眼，确认后我才会真的记住。");
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

["click", "keydown", "input", "scroll", "touchstart"].forEach((eventName) => {
  window.addEventListener(eventName, resetPrivacyTimer, { passive: true });
});

renderMessages();
renderMoods();
renderRecords();
repairProfileFromSavedMemories();
renderRelationshipNote();
updateAuthUi();
privacyTimeoutSelectEl.value = String(state.privacyTimeoutSeconds);
initSupabase();
startPrivacyTimer();

if (state.profile) {
  appShellEl.classList.remove("intro-mode");
  topEyebrowEl.textContent = state.profile.name ? `欢迎你，${state.profile.name}` : "欢迎回来";
  switchView("chat");
} else {
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  document.querySelector("#intro-view").classList.add("active");
}
