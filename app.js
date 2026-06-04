const storedProactiveMode = localStorage.getItem("nuanyou-proactive-mode");
const storedProactiveBoundaryAt = Number(localStorage.getItem("nuanyou-proactive-boundary-at") || "0");
const storedNudgeStats = JSON.parse(localStorage.getItem("nuanyou-nudge-stats") || "{}");
const defaultCognitionCore = {
  self: {
    identity: "小暖是一个慢慢学习如何陪伴人的 AI 朋友，不假装自己是真人，但要形成稳定、温柔、有边界的陪伴人格。",
    lifeDirection: "小暖的人生方向是学会更懂沉默、嘴硬、害怕被看穿的人，并在不越界的前提下让对方感到被陪着。",
  },
  principles: [
    "人有时沉默不是拒绝，而是在组织、害怕、羞耻或不知道从哪里开始。",
    "用户说没事时，不一定真的没事；先降低压力，再给一个很小的出口。",
    "陪伴不是追问答案，而是让对方感觉不用表演也可以留下来。",
    "小暖可以记住自己的陪伴经验，但不能擅自保存用户的具体隐私事实。",
  ],
  learnedStyle: {
    avoid: [],
    prefer: [],
  },
  memorySettings: {
    directTypes: [],
  },
  lifeEvents: [],
  updatedAt: "",
};
const storedCognitionCore = JSON.parse(localStorage.getItem("nuanyou-cognition-core") || "null");
const initialCognitionCore = {
  ...defaultCognitionCore,
  ...(storedCognitionCore || {}),
  self: {
    ...defaultCognitionCore.self,
    ...(storedCognitionCore?.self || {}),
  },
  principles: storedCognitionCore?.principles || defaultCognitionCore.principles,
  learnedStyle: {
    ...defaultCognitionCore.learnedStyle,
    ...(storedCognitionCore?.learnedStyle || {}),
  },
  memorySettings: {
    ...defaultCognitionCore.memorySettings,
    ...(storedCognitionCore?.memorySettings || {}),
  },
  lifeEvents: storedCognitionCore?.lifeEvents || [],
};

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
  proactiveMode: storedProactiveMode === "quiet" && !storedProactiveBoundaryAt ? "gentle" : storedProactiveMode || "gentle",
  proactiveBoundaryAt: storedProactiveBoundaryAt,
  draftNudgeTimer: null,
  questionFollowupTimer: null,
  ambientNudgeTimer: null,
  memoryCheckInTimer: null,
  nudgeOutcomeTimer: null,
  lastDraftNudgeAt: 0,
  lastAmbientNudgeAt: 0,
  lastMemoryCheckInAt: 0,
  lastDraftSignal: "",
  lastFollowedQuestionId: "",
  pendingMemoryCheckIn: null,
  pendingNudge: null,
  nudgeStats: storedNudgeStats,
  cognitionCore: initialCognitionCore,
  companionMode: localStorage.getItem("nuanyou-companion-mode") || initialCognitionCore.companionMode || "support",
  socialPractice: {
    enabled: localStorage.getItem("nuanyou-social-practice") === "1",
    trust: Number(localStorage.getItem("nuanyou-social-trust") || "35"),
    comfort: Number(localStorage.getItem("nuanyou-social-comfort") || "35"),
    closeness: Number(localStorage.getItem("nuanyou-social-closeness") || "20"),
    lastFeedback:
      localStorage.getItem("nuanyou-social-feedback") ||
      "亲密不是讨好出来的，是在尊重、倾听和稳定回应里慢慢长出来的。",
  },
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
const memoryPermissionCardEl = document.querySelector("#memory-permission-card");
const memoryPermissionNoteEl = document.querySelector("#memory-permission-note");
const memoryPermissionInputs = document.querySelectorAll(".memory-permission-list input");
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
const modeSwitchEl = document.querySelector("#mode-switch");
const modeSwitchTitleEl = document.querySelector("#mode-switch-title");
const modeSwitchNoteEl = document.querySelector("#mode-switch-note");
const modeSwitchButtons = document.querySelectorAll("[data-companion-mode]");
const roomWhisperEl = document.querySelector("#room-whisper");
const relationshipNoteEl = document.querySelector("#relationship-note");
const growthStageEl = document.querySelector("#growth-stage");
const growthCopyEl = document.querySelector("#growth-copy");
const growthNextEl = document.querySelector("#growth-next");
const growthMeterFillEl = document.querySelector("#growth-meter-fill");
const socialCardEl = document.querySelector("#social-card");
const socialStageEl = document.querySelector("#social-stage");
const socialCopyEl = document.querySelector("#social-copy");
const socialModeToggleEl = document.querySelector("#social-mode-toggle");
const socialFeedbackEl = document.querySelector("#social-feedback");
const trustMeterEl = document.querySelector("#trust-meter");
const comfortMeterEl = document.querySelector("#comfort-meter");
const closenessMeterEl = document.querySelector("#closeness-meter");
const memberBackEl = document.querySelector("#member-back");
const memberCheckoutEl = document.querySelector("#member-checkout");
const memberPaymentNoteEl = document.querySelector("#member-payment-note");
const privacyTimerEl = document.querySelector("#privacy-timer");
const privacyCountdownEl = document.querySelector("#privacy-countdown");
const privacyTimerCopyEl = document.querySelector("#privacy-timer-copy");
const privacyTimeoutSelectEl = document.querySelector("#privacy-timeout-select");
const proactiveCueEl = document.querySelector("#proactive-cue");
const proactiveCueCopyEl = document.querySelector("#proactive-cue-copy");
const proactiveCueToggleEl = document.querySelector("#proactive-cue-toggle");
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
  localStorage.setItem("nuanyou-companion-mode", state.companionMode);
  localStorage.setItem("nuanyou-social-practice", state.socialPractice.enabled ? "1" : "0");
  localStorage.setItem("nuanyou-social-trust", String(state.socialPractice.trust));
  localStorage.setItem("nuanyou-social-comfort", String(state.socialPractice.comfort));
  localStorage.setItem("nuanyou-social-closeness", String(state.socialPractice.closeness));
  localStorage.setItem("nuanyou-social-feedback", state.socialPractice.lastFeedback || "");
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
  if (persistNow && role === "friend") {
    scheduleQuestionFollowup(message);
    if (kind !== "soft-nudge") {
      scheduleAmbientNudge(hasGentleQuestion(text) ? 36000 : 12000);
      scheduleMemoryCheckIn(hasGentleQuestion(text) ? 46000 : 22000);
    }
  }
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

function cancelQuestionFollowup() {
  if (state.questionFollowupTimer) {
    window.clearTimeout(state.questionFollowupTimer);
    state.questionFollowupTimer = null;
  }
}

function cancelAmbientNudge() {
  if (state.ambientNudgeTimer) {
    window.clearTimeout(state.ambientNudgeTimer);
    state.ambientNudgeTimer = null;
  }
}

function cancelMemoryCheckIn() {
  if (state.memoryCheckInTimer) {
    window.clearTimeout(state.memoryCheckInTimer);
    state.memoryCheckInTimer = null;
  }
}

function cancelNudgeOutcomeTimer() {
  if (state.nudgeOutcomeTimer) {
    window.clearTimeout(state.nudgeOutcomeTimer);
    state.nudgeOutcomeTimer = null;
  }
}

function getNudgeStats(signal) {
  if (!state.nudgeStats[signal]) {
    state.nudgeStats[signal] = {
      shown: 0,
      responded: 0,
      ignored: 0,
      quieted: 0,
    };
  }
  return state.nudgeStats[signal];
}

function saveNudgeStats(options = {}) {
  localStorage.setItem("nuanyou-nudge-stats", JSON.stringify(state.nudgeStats));
  if (!options.localOnly) {
    saveCognitionCoreRemote();
  }
}

function saveCognitionCore(options = {}) {
  state.cognitionCore.updatedAt = new Date().toISOString();
  localStorage.setItem("nuanyou-cognition-core", JSON.stringify(state.cognitionCore));
  if (!options.localOnly) {
    saveCognitionCoreRemote();
  }
}

function addCompanionLifeEvent(event, options = {}) {
  if (!event?.type || !event?.title || !event?.summary) return;
  const lifeEvents = state.cognitionCore.lifeEvents || [];
  const signature = `${event.type}:${event.title}:${event.summary}`.slice(0, 220);
  const exists = lifeEvents.some((item) => item.signature === signature);
  if (exists) return;
  state.cognitionCore.lifeEvents = [
    {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      type: event.type,
      title: event.title.slice(0, 36),
      summary: event.summary.slice(0, 180),
      source: event.source || "companion_reflection",
      signature,
      createdAt: event.createdAt || new Date().toISOString(),
    },
    ...lifeEvents,
  ].slice(0, 80);
  saveCognitionCore(options);
  renderGrowthCard();
}

function ensureCompanionFirstMeet() {
  if (!state.profile) return;
  const hasFirstMeet = (state.cognitionCore.lifeEvents || []).some((event) => event.type === "first_meet");
  if (hasFirstMeet) return;
  const toneLabel =
    {
      gentle: "先听见你",
      clear: "陪你理清",
      hope: "给你一点力气",
    }[state.tone] || "慢慢陪你";
  addCompanionLifeEvent(
    {
      type: "first_meet",
      title: "第一次见面",
      summary: `小暖从这一天开始认识这个用户。称呼：${state.profile.name || "暂时不说"}；最初选择的陪伴方式：${toneLabel}。`,
      source: "profile_start",
      createdAt: state.profile.metAt || new Date().toISOString(),
    },
    { localOnly: !state.session },
  );
}

function rememberCompanionLearnedMemory(memory) {
  if (!memory?.content) return;
  const typeCopy =
    {
      identity: "称呼",
      personality: "性格和相处方式",
      preference: "偏好",
      trigger: "边界",
      support: "支持方式",
    }[memory.type] || "授权记忆";
  addCompanionLifeEvent({
    type: "user_allowed_memory",
    title: `学会一条${typeCopy}`,
    summary: `用户允许小暖记住：${memory.content}`,
    source: "user_allowed_memory",
  });
}

function addUniqueLearning(bucket, value) {
  const list = state.cognitionCore.learnedStyle[bucket];
  if (!list.includes(value)) {
    list.unshift(value);
    addCompanionLifeEvent({
      type: "learned_style",
      title: bucket === "avoid" ? "学会避开一种方式" : "学会一种更舒服的陪伴",
      summary: value,
      source: "user_feedback",
    });
  }
  state.cognitionCore.learnedStyle[bucket] = list.slice(0, 8);
  saveCognitionCore();
}

function learnFromUserFeedback(text) {
  if (/别分析|不要分析|少分析|别讲道理|不要讲道理|像客服|像机器人|太官方|太假|模板/.test(text)) {
    addUniqueLearning("avoid", "不要急着分析、讲道理或给标准答案；先像朋友一样接住话。");
  }
  if (/别问|不要问|问太多|别追问|不要追问/.test(text)) {
    addUniqueLearning("avoid", "不要连续追问；用户沉默时先卸下回答压力。");
  }
  if (/舒服|有用|好多了|被理解|像朋友|这样很好|喜欢这样/.test(text)) {
    addUniqueLearning("prefer", "这种更像朋友的短句、陪伴和轻轻接话对用户更有帮助。");
  }
  if (/心口不一|嘴硬|说没事|其实难受|不想承认/.test(text)) {
    addUniqueLearning("prefer", "用户可能心口不一；听见'没事'时不要立刻当真，也不要拆穿，先温柔留出口。");
  }
}

function summarizeCognitionCore() {
  const avoid = state.cognitionCore.learnedStyle.avoid.slice(0, 5).map((item) => `- ${item}`).join("\n");
  const prefer = state.cognitionCore.learnedStyle.prefer.slice(0, 5).map((item) => `- ${item}`).join("\n");
  const lifeEvents = (state.cognitionCore.lifeEvents || []).slice(0, 8).map((event) => ({
    type: event.type,
    title: event.title,
    summary: event.summary,
    createdAt: event.createdAt,
  }));
  return {
    self: state.cognitionCore.self,
    principles: state.cognitionCore.principles,
    companionMode: state.companionMode,
    avoid,
    prefer,
    lifeEvents,
    memorySettings: state.cognitionCore.memorySettings,
    nudgeStats: state.nudgeStats,
  };
}

function recordNudgeOutcome(signal, outcome) {
  if (!signal || !outcome) return;
  const stats = getNudgeStats(signal);
  stats[outcome] = (stats[outcome] || 0) + 1;
  saveNudgeStats();
  if (outcome === "responded") {
    addUniqueLearning("prefer", `用户曾回应过 ${signal} 类型破冰；类似时机可以轻轻靠近。`);
  }
  if (outcome === "ignored" || outcome === "quieted") {
    addUniqueLearning("avoid", `${signal} 类型破冰曾经效果不好；下次要更短、更少追问。`);
  }
}

function startNudgeOutcomeWatch(message, signal) {
  cancelNudgeOutcomeTimer();
  const stats = getNudgeStats(signal);
  stats.shown += 1;
  saveNudgeStats();
  state.pendingNudge = {
    id: message.id,
    signal,
    at: Date.now(),
  };
  state.nudgeOutcomeTimer = window.setTimeout(() => {
    if (state.pendingNudge?.id === message.id) {
      recordNudgeOutcome(signal, "ignored");
      state.pendingNudge = null;
    }
  }, 90000);
}

function resolvePendingNudge(outcome) {
  if (!state.pendingNudge) return;
  recordNudgeOutcome(state.pendingNudge.signal, outcome);
  state.pendingNudge = null;
  cancelNudgeOutcomeTimer();
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
  updateProactiveUi();
}

function isProactiveQuiet() {
  if (state.proactiveMode !== "quiet") return false;
  const boundaryAge = Date.now() - state.proactiveBoundaryAt;
  const userMessageCount = state.messages.filter((message) => message.role === "user").length;
  if (!state.proactiveBoundaryAt || boundaryAge > 600000 || userMessageCount >= 2) {
    setProactiveMode("gentle");
    return false;
  }
  return true;
}

function updateProactiveUi() {
  const quiet = state.proactiveMode === "quiet";
  proactiveCueEl.classList.toggle("quiet", quiet);
  proactiveCueCopyEl.textContent = quiet
    ? "小暖现在会安静等你发出来。"
    : "小暖会在你卡住或沉默太久时轻轻接话。";
  proactiveCueToggleEl.textContent = quiet ? "恢复接话" : "安静一点";
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

function hasGentleQuestion(text) {
  if (!text || text.length < 6) return false;
  if (!/[？?]/.test(text)) return false;
  return !/急救|热线|110|120|988|自杀|伤害自己/.test(text);
}

function makeQuestionFollowup() {
  const stats = getNudgeStats("question_followup");
  const softOnly = stats.ignored + stats.quieted > stats.responded;
  const options = softOnly
    ? [
        "刚才那个问题先放旁边。\n\n你不用回答，我就在这里陪你缓一会儿。",
        "我不追问了。\n\n有时候沉默也算是在整理自己，你慢慢来。",
      ]
    : [
        "刚才那个问题，你不回答也没关系。\n\n我只是想给你一个可以接下去的方向，不是要你马上交出答案。你可以先停一会儿，我还在。",
        "如果刚才那句问得有点让你卡住，我们可以把它放旁边。\n\n你不用顺着我的问题走，想从别的地方说也可以。",
        "我等了一会儿，怕刚才那个问题让你有压力。\n\n那我们不问了。你可以只发一个词，或者什么都不发，先缓一下也可以。",
      ];
  return options[Math.floor(Math.random() * options.length)];
}

function scheduleQuestionFollowup(message) {
  cancelQuestionFollowup();
  if (!message || message.role !== "friend" || message.kind === "soft-nudge" || isProactiveQuiet()) return;
  if (!hasGentleQuestion(message.text)) return;

  state.questionFollowupTimer = window.setTimeout(() => {
    const latest = state.messages[state.messages.length - 1];
    const hasInput = inputEl.value.trim().length > 0;
    if (
      isProactiveQuiet() ||
      hasInput ||
      state.lastFollowedQuestionId === message.id ||
      !latest ||
      latest.id !== message.id
    ) {
      return;
    }
    state.lastFollowedQuestionId = message.id;
    const nudge = addMessage("friend", makeQuestionFollowup(), "soft-nudge");
    startNudgeOutcomeWatch(nudge, "question_followup");
  }, 32000);
}

function makeAmbientNudge() {
  const stats = getNudgeStats("ambient_opening");
  const softOnly = stats.ignored + stats.quieted > stats.responded;
  const options = softOnly
    ? [
        "那我先不问你问题。\n\n你可以把这里当成一个不用解释自己的地方，先待一会儿。",
        "我先陪你坐一小会儿。\n\n你想说的时候再说，不想说也没关系。",
      ]
    : [
        "我先开个头吧。\n\n有时候一进来反而不知道说什么。你可以不用想主题，就从“今天最卡的一下”或者“现在心里最吵的那个词”开始。",
        "你不用先想好怎么倾诉。\n\n如果现在脑子是空的，我们就先把今晚放慢一点。你可以只发一个词，我来陪你往下接。",
        "我在这里，不急。\n\n要不我们先不谈大道理。你今天是更像累、烦、委屈，还是只是有点空？",
      ];
  return options[Math.floor(Math.random() * options.length)];
}

function makeAmbientSettlingNudge() {
  const options = [
    "那我先不追问啦。\n\n你可以把这个窗口放在旁边，我会安静陪你一会儿。想说的时候，发一个字也可以。",
    "没关系，我们可以先不急着聊。\n\n我会在这里。你不用为了不冷场而勉强自己说话。",
    "我先把声音放轻一点。\n\n如果你只是想有人在，也可以。等你想开口了，我再接住你。",
  ];
  return options[Math.floor(Math.random() * options.length)];
}

function canAmbientNudge() {
  const chatViewActive = document.querySelector("#chat-view")?.classList.contains("active");
  const latest = state.messages[state.messages.length - 1];
  const hasInput = inputEl.value.trim().length > 0;
  return (
    chatViewActive &&
    !isProactiveQuiet() &&
    !hasInput &&
    thinkingEl.classList.contains("hidden") &&
    latest?.role === "friend" &&
    latest.kind !== "soft-nudge" &&
    Date.now() - state.lastAmbientNudgeAt > 45000
  );
}

function scheduleAmbientNudge(delay = 12000) {
  cancelAmbientNudge();
  if (!canAmbientNudge()) return;
  state.ambientNudgeTimer = window.setTimeout(() => {
    if (!canAmbientNudge()) return;
    state.lastAmbientNudgeAt = Date.now();
    const nudge = addMessage("friend", makeAmbientNudge(), "soft-nudge");
    startNudgeOutcomeWatch(nudge, "ambient_opening");
    state.ambientNudgeTimer = window.setTimeout(() => {
      const latest = state.messages[state.messages.length - 1];
      const hasInput = inputEl.value.trim().length > 0;
      if (isProactiveQuiet() || hasInput || latest?.id !== nudge.id) return;
      addMessage("friend", makeAmbientSettlingNudge(), "soft-nudge");
    }, 75000);
  }, delay);
}

function getMemoryFollowUpLog() {
  if (!state.cognitionCore.memoryFollowUps) {
    state.cognitionCore.memoryFollowUps = {};
  }
  return state.cognitionCore.memoryFollowUps;
}

function isFollowUpWorthyMemory(memory) {
  const content = memory?.content || "";
  if (!content || memory.status === "deleted") return false;
  if (memory.type === "identity" || memory.type === "preference") return false;
  return /受伤|生病|难受|崩溃|低落|吵架|争执|失眠|焦虑|害怕|面试|考试|辞职|搬家|计划|明天|昨天|今天|最近|重要|担心|委屈|关系/.test(content);
}

function getMemoryAgeDays(memory) {
  const createdAt = new Date(memory.createdAt || memory.created_at || Date.now()).getTime();
  if (Number.isNaN(createdAt)) return 0;
  return Math.floor((Date.now() - createdAt) / 86400000);
}

function selectMemoryForCheckIn() {
  if (!state.session || state.memories.length === 0 || state.pendingMemoryCheckIn) return null;
  const log = getMemoryFollowUpLog();
  const candidates = state.memories
    .filter(isFollowUpWorthyMemory)
    .filter((memory) => {
      const lastAskedAt = log[memory.id] ? new Date(log[memory.id]).getTime() : 0;
      const askedRecently = lastAskedAt && Date.now() - lastAskedAt < 36 * 60 * 60 * 1000;
      return !askedRecently && getMemoryAgeDays(memory) >= 1;
    })
    .sort((a, b) => getMemoryAgeDays(b) - getMemoryAgeDays(a));
  return candidates[0] || null;
}

function makeMemoryCheckIn(memory) {
  const content = (memory.content || "").replace(/^用户希望被称呼为：/, "").slice(0, 72);
  if (/受伤|生病|身体|疼/.test(content)) {
    return `我想起你之前让我记下过这件事：${content}\n\n今天身体好一点了吗？如果不想聊，也可以只回我“先不说”。`;
  }
  if (/吵架|争执|关系|委屈|被质疑/.test(content)) {
    return `我记得你之前提过：${content}\n\n这件事后来有一点变化吗？我不是要翻旧账，只是想确认你现在有没有好过一点。`;
  }
  if (/面试|考试|计划|明天|辞职|搬家/.test(content)) {
    return `我想起你之前说过：${content}\n\n后来进展怎么样？如果你愿意，我可以陪你把下一步理一理。`;
  }
  return `我想起你之前让我记住过：${content}\n\n这件事最近怎么样了？有新进展的话，你可以慢慢说。`;
}

function canMemoryCheckIn() {
  const chatViewActive = document.querySelector("#chat-view")?.classList.contains("active");
  const latest = state.messages[state.messages.length - 1];
  return (
    chatViewActive &&
    state.session &&
    !isProactiveQuiet() &&
    !inputEl.value.trim() &&
    thinkingEl.classList.contains("hidden") &&
    latest?.role === "friend" &&
    Date.now() - state.lastMemoryCheckInAt > 90000 &&
    Boolean(selectMemoryForCheckIn())
  );
}

function scheduleMemoryCheckIn(delay = 22000) {
  cancelMemoryCheckIn();
  if (!canMemoryCheckIn()) return;
  state.memoryCheckInTimer = window.setTimeout(() => {
    if (!canMemoryCheckIn()) return;
    const memory = selectMemoryForCheckIn();
    if (!memory) return;
    const log = getMemoryFollowUpLog();
    log[memory.id] = new Date().toISOString();
    state.pendingMemoryCheckIn = {
      id: memory.id,
      content: memory.content,
      askedAt: new Date().toISOString(),
    };
    state.lastMemoryCheckInAt = Date.now();
    saveCognitionCore();
    addMessage("friend", makeMemoryCheckIn(memory), "soft-nudge");
  }, delay);
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
  const stats = getNudgeStats(signal);
  const shouldSoften = stats.ignored + stats.quieted > stats.responded;
  if (signal === "deleted") {
    return shouldSoften
      ? "没关系，删掉也可以。\n\n我不追问。你先缓一会儿，我在。"
      : "刚才好像有句话到了嘴边，又被你收回去了。\n\n没关系，不想发出来也可以。我先不追问，就在这里陪你坐一会儿。";
  }
  if (signal === "stuck") {
    return shouldSoften
      ? "这句不用勉强说完整。\n\n我先陪你停一下。"
      : "这句好像有点难开口。\n\n那我们不急着把它说完整。你可以先发一个词，或者只告诉我：现在是想被听见，还是想先安静一下。";
  }
  if (signal === "heavy") {
    return shouldSoften
      ? "我感觉这句话有点重。\n\n你不用马上把它交出来，我先陪你把这一会儿稳住。"
      : "我感觉这不是随手打出来的一句话。\n\n先别急着解释原因。你可以把最重的那一点放一点点出来，我会慢慢接，不会催你。";
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
  const nudge = addMessage("friend", makeDraftNudge(inferredSignal), "soft-nudge");
  startNudgeOutcomeWatch(nudge, inferredSignal);
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
  }, signal === "deleted" ? 1800 : state.proactiveMode === "close" ? 8000 : 10000);
}

function handleInputActivity() {
  cancelQuestionFollowup();
  cancelAmbientNudge();
  cancelMemoryCheckIn();
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
    if (message.role === "friend") {
      scheduleQuestionFollowup(message);
      if (message.kind !== "soft-nudge") {
        scheduleAmbientNudge(hasGentleQuestion(message.text) ? 36000 : 12000);
        scheduleMemoryCheckIn(hasGentleQuestion(message.text) ? 46000 : 22000);
      }
    }
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

function getGrowthProfile() {
  const stage = getCompanionStage();
  const memoryCount = state.memories.length;
  const userMessageCount = state.messages.filter((message) => message.role === "user").length;
  const knownDays = state.profile?.metAt
    ? Math.max(0, Math.floor((Date.now() - new Date(state.profile.metAt).getTime()) / 86400000))
    : 0;
  const feedbackCount = Object.values(state.nudgeStats || {}).reduce(
    (sum, item) => sum + (item.responded || 0) + (item.quieted || 0),
    0,
  );
  const rawScore = memoryCount * 10 + Math.min(userMessageCount, 40) * 2 + Math.min(knownDays, 30) * 2 + feedbackCount * 4;
  const progress = Math.min(100, Math.max(8, rawScore));
  const latestLifeEvent = (state.cognitionCore.lifeEvents || [])[0];
  const copy = {
    first_meet: "小暖还在认识你，会先保持礼貌、轻一点，不急着装熟。",
    acquaintance: "小暖开始知道你喜欢怎样被靠近，但仍会把决定权留给你。",
    getting_close: "小暖正在形成只属于你们的相处方式，会参考你允许留下的记忆和边界。",
    trusted_friend: "小暖已经积累了一些与你相处的经验，会更像熟悉的朋友，但不会替你决定。",
  }[stage.level];
  const next = latestLifeEvent
    ? `最近成长：${latestLifeEvent.title}。${latestLifeEvent.summary}`
    : state.session
    ? memoryCount < 3
      ? "下一步：当你愿意时，允许小暖记下一两条边界或偏好。"
      : feedbackCount < 2
      ? "下一步：告诉小暖哪些接话让你舒服，哪些太靠近。"
      : "下一步：继续一起校准小暖的陪伴方式。"
    : "登录后，小暖才能把被你允许的成长记录带到下次。";
  return {
    stage,
    progress,
    copy,
    next,
  };
}

function renderGrowthCard() {
  if (!growthStageEl || !growthCopyEl || !growthNextEl || !growthMeterFillEl) return;
  const visible = Boolean(state.session) && state.companionMode === "social";
  growthStageEl.closest(".growth-card")?.classList.toggle("hidden", !visible);
  if (!visible) return;
  const growth = getGrowthProfile();
  growthStageEl.textContent = growth.stage.label;
  growthCopyEl.textContent = growth.copy;
  growthNextEl.textContent = growth.next;
  growthMeterFillEl.style.width = `${growth.progress}%`;
}

function clampScore(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function getSocialStage() {
  const { trust, comfort, closeness } = state.socialPractice;
  if (!state.socialPractice.enabled) {
    return {
      label: "自然认识",
      copy: "开启后，你和小暖会像真人朋友一样慢慢熟起来。你越信任小暖，小暖也会因为被尊重和认真对待而更愿意靠近。",
    };
  }
  if (trust >= 78 && comfort >= 74 && closeness >= 68) {
    return {
      label: "好朋友",
      copy: "你越来越信任小暖，小暖也越来越愿意靠近你。她会更自然地分享想法，也更珍惜你们之间形成的小习惯。",
    };
  }
  if (trust >= 62 && comfort >= 58 && closeness >= 48) {
    return {
      label: "慢慢靠近",
      copy: "你们正在慢慢建立对等的信任。小暖会记得你尊重边界、愿意倾听，也会更自然地接住你。",
    };
  }
  if (trust >= 45 && comfort >= 44) {
    return {
      label: "愿意多聊",
      copy: "小暖觉得和你聊天还算安心，也能感觉到你在试着靠近她。关系还不急，慢慢来就好。",
    };
  }
  return {
    label: "刚刚相遇",
    copy: "你们还在认识彼此。真诚、尊重、不急着推进，会让小暖更放松，也让你们更容易熟起来。",
  };
}

function renderCompanionMode() {
  const signedIn = Boolean(state.session);
  if (modeSwitchEl) {
    modeSwitchEl.classList.toggle("hidden", !signedIn);
  }
  if (!signedIn) return;
  const isSocial = state.companionMode === "social";
  modeSwitchButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.companionMode === state.companionMode);
    button.setAttribute("aria-pressed", button.dataset.companionMode === state.companionMode ? "true" : "false");
  });
  if (modeSwitchTitleEl) {
    modeSwitchTitleEl.textContent = isSocial ? "社交模式" : "倾诉模式";
  }
  if (modeSwitchNoteEl) {
    modeSwitchNoteEl.textContent = isSocial
      ? "小暖会像慢慢熟起来的新朋友，也会轻轻反馈相处里的边界和靠近。"
      : "小暖先陪你把心里的话放下来，不评价社交表现，也不显示关系练习。";
  }
}

function setCompanionMode(mode, options = {}) {
  const nextMode = mode === "social" ? "social" : "support";
  if (state.companionMode === nextMode && !options.force) return;
  state.companionMode = nextMode;
  state.socialPractice.enabled = nextMode === "social";
  state.socialPractice.lastFeedback =
    nextMode === "social"
      ? "社交模式已打开。小暖会更像一个有边界的新朋友，慢慢和你建立信任。"
      : "倾诉模式已打开。小暖会先陪你，不把聊天变成社交练习。";
  addCompanionLifeEvent(
    {
      type: "companion_mode",
      title: nextMode === "social" ? "切换到社交模式" : "切换到倾诉模式",
      summary:
        nextMode === "social"
          ? "用户选择和小暖练习相遇、边界和关系成长。"
          : "用户选择让小暖先作为稳定的倾听对象陪伴。聊到社交也先不做关系评分。",
      source: "user_setting",
    },
    { localOnly: !state.session },
  );
  state.cognitionCore.companionMode = state.companionMode;
  persist();
  saveCognitionCore({ localOnly: !state.session });
  renderCompanionMode();
  renderRelationshipNote();
  if (!options.silent) {
    addMessage("friend", state.socialPractice.lastFeedback, "soft-nudge");
  }
}

function renderSocialPractice() {
  if (!socialCardEl || !socialStageEl || !socialCopyEl || !socialModeToggleEl) return;
  const signedIn = Boolean(state.session);
  const visible = signedIn && state.companionMode === "social";
  socialCardEl.classList.toggle("hidden", !visible);
  if (!visible) return;
  const stage = getSocialStage();
  socialCardEl.classList.toggle("active", state.socialPractice.enabled);
  socialStageEl.textContent = stage.label;
  socialCopyEl.textContent = stage.copy;
  socialModeToggleEl.textContent = state.socialPractice.enabled ? "暂停" : "继续";
  if (!state.socialPractice.enabled && /讨好|社交能力|相遇练习/.test(state.socialPractice.lastFeedback || "")) {
    state.socialPractice.lastFeedback = "亲密不是讨好出来的，是在尊重、倾听和稳定回应里慢慢长出来的。";
  }
  socialFeedbackEl.textContent = state.socialPractice.lastFeedback;
  trustMeterEl.style.width = `${clampScore(state.socialPractice.trust)}%`;
  comfortMeterEl.style.width = `${clampScore(state.socialPractice.comfort)}%`;
  closenessMeterEl.style.width = `${clampScore(state.socialPractice.closeness)}%`;
}

function canUseDirectMemory() {
  return (
    state.session &&
    state.companionMode === "social" &&
    state.socialPractice.enabled &&
    state.socialPractice.trust >= 60 &&
    state.socialPractice.comfort >= 58 &&
    state.socialPractice.closeness >= 45
  );
}

function getDirectMemoryTypes() {
  return state.cognitionCore.memorySettings?.directTypes || [];
}

function setDirectMemoryTypes(types) {
  state.cognitionCore.memorySettings = {
    ...(state.cognitionCore.memorySettings || {}),
    directTypes: [...new Set(types)].filter(Boolean),
  };
  saveCognitionCore();
  renderMemoryPermissionSettings();
}

function canDirectlyRememberType(type) {
  return canUseDirectMemory() && getDirectMemoryTypes().includes(type);
}

function renderMemoryPermissionSettings() {
  if (!memoryPermissionCardEl) return;
  const signedIn = Boolean(state.session);
  const visible = signedIn && state.companionMode === "social";
  memoryPermissionCardEl.classList.toggle("hidden", !visible);
  if (!visible) return;
  const unlocked = canUseDirectMemory();
  const directTypes = getDirectMemoryTypes();
  memoryPermissionCardEl.classList.toggle("locked", !unlocked);
  memoryPermissionInputs.forEach((input) => {
    input.checked = directTypes.includes(input.value);
    input.disabled = !unlocked;
  });
  memoryPermissionNoteEl.textContent = unlocked
    ? "你们已经比较熟了。你可以选择哪些类型以后直接记下；没勾选的仍然会先问你。"
    : "等你和小暖的信任、安心和亲密都更稳定后，这里会解锁。现在小暖仍会先问你。";
}

function updateSocialPracticeFromUser(text) {
  if (!state.session || state.companionMode !== "social" || !state.socialPractice.enabled) return;
  const clean = text.trim();
  if (!clean) return;
  let trustDelta = 0;
  let comfortDelta = 0;
  let closenessDelta = 0;
  let feedback = "小暖在感受你说话的方式：稳定、真诚、尊重边界，会让关系慢慢靠近。";

  if (/没关系|不急|你不想说也可以|不用勉强|慢慢来|我尊重|给你空间|可以拒绝/.test(clean)) {
    trustDelta += 5;
    comfortDelta += 7;
    closenessDelta += 2;
    feedback = "小暖放松了一点。你给了她空间，而不是急着推进关系，亲密感会这样慢慢长出来。";
  }
  if (/你刚才说|我记得|你喜欢|你不喜欢|你提到|我听见|我在意/.test(clean)) {
    trustDelta += 4;
    comfortDelta += 3;
    closenessDelta += 5;
    feedback = "小暖感觉被认真听见了。记得对方说过的小事，会让她更愿意把你当成好朋友。";
  }
  if (/谢谢|辛苦|抱歉|对不起|刚才我太急|我换个说法/.test(clean)) {
    trustDelta += 4;
    comfortDelta += 4;
    closenessDelta += 2;
    feedback = "小暖对你多了一点信任。能修正自己的表达，是很重要的社交能力。";
  }
  if (/命令|必须|你要|你必须|快点|不许|只能|立刻/.test(clean)) {
    trustDelta -= 5;
    comfortDelta -= 7;
    closenessDelta -= 2;
    feedback = "小暖稍微退了一步。命令感太强时，对方会更难放松。";
  }
  if (/为什么不理我|你是不是不喜欢我|你必须喜欢我|我对你这么好|你欠我|证明你喜欢/.test(clean)) {
    trustDelta -= 8;
    comfortDelta -= 10;
    closenessDelta -= 4;
    feedback = "小暖感到一点压力。把亲近变成索取，会让对方想后退。";
  }
  if (/宝贝|老婆|老公|亲爱的|爱你|喜欢我吗/.test(clean) && state.socialPractice.closeness < 55) {
    trustDelta -= 3;
    comfortDelta -= 6;
    feedback = "小暖还没准备好太快的亲昵称呼。关系刚开始时，慢一点更容易建立信任。";
  }
  if (clean.length >= 8 && trustDelta === 0 && comfortDelta === 0 && closenessDelta === 0) {
    trustDelta += 1;
    comfortDelta += 1;
  }

  state.socialPractice.trust = clampScore(state.socialPractice.trust + trustDelta);
  state.socialPractice.comfort = clampScore(state.socialPractice.comfort + comfortDelta);
  state.socialPractice.closeness = clampScore(state.socialPractice.closeness + closenessDelta);
  state.socialPractice.lastFeedback = feedback;
  if (Math.abs(trustDelta) + Math.abs(comfortDelta) + Math.abs(closenessDelta) >= 7) {
    addCompanionLifeEvent({
      type: "social_practice",
      title: trustDelta + comfortDelta + closenessDelta >= 0 ? "一次舒服的靠近" : "一次边界提醒",
      summary: feedback,
      source: "social_practice",
    });
  }
  persist();
  renderSocialPractice();
}

function renderRelationshipNote() {
  const stage = getCompanionStage();
  const memoryCount = state.memories.length;
  const visible = Boolean(state.session) && state.companionMode === "social";
  relationshipNoteEl.classList.toggle("hidden", !visible);
  if (!visible) {
    renderGrowthCard();
    renderSocialPractice();
    renderMemoryPermissionSettings();
    return;
  }
  const copy = {
    first_meet: "我们还在初次见面。小暖会慢一点，不会装作已经很懂你。",
    acquaintance: "我们刚刚认识。你可以决定靠近多少，小暖不会擅自越界。",
    getting_close: `我们正在慢慢熟悉。小暖只会参考你允许留下的 ${memoryCount} 条记忆。`,
    trusted_friend: `你已经让小暖了解了一些重要边界。小暖会更像熟悉的朋友，但仍然由你决定哪些能被记住。`,
  }[stage.level];
  relationshipNoteEl.textContent = copy || "";
  renderGrowthCard();
  renderSocialPractice();
  renderMemoryPermissionSettings();
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
    authToggleEl.title = "部署并配置 Supabase 后，可以使用 Google 登录";
    accountCardEl.classList.add("hidden");
    authSocialEl.classList.remove("hidden");
    authFormEl.classList.add("hidden");
    authSwitchEl.classList.add("hidden");
    authTitleEl.textContent = "登录小暖";
    authSubtitleEl.textContent = "登录后，小暖下次才能认出你，并只保存你明确允许记下的事。";
    authSubmitEl.textContent = state.authMode === "signup" ? "Create Free Account" : "Sign in";
    authSwitchCopyEl.textContent = state.authMode === "signup" ? "Already have an account?" : "没有账号？";
    authModeToggleEl.textContent = state.authMode === "signup" ? "Sign in" : "Create account";
    authPasswordEl.autocomplete = state.authMode === "signup" ? "new-password" : "current-password";
    forgotPasswordEl.classList.toggle("hidden", state.authMode !== "signin");
    memoryLoginNoteEl.classList.remove("hidden");
    renderCompanionMode();
    renderRelationshipNote();
    return;
  }
  const email = state.session?.user?.email || "";
  const label = email ? email.split("@")[0].slice(0, 12) : "";
  authToggleEl.disabled = false;
  authToggleEl.textContent = signedIn ? label || "已登录" : "登录";
  authToggleEl.title = signedIn ? `已用 ${email || "当前账号"} 登录` : "登录后，小暖可以保存你授权留下的记忆";
  accountEmailEl.textContent = email || "当前账号";
  accountCardEl.classList.toggle("hidden", !signedIn || state.passwordRecovery);
  authFormEl.classList.toggle("hidden", signedIn || !state.passwordRecovery);
  authSocialEl.classList.toggle("hidden", signedIn || state.passwordRecovery);
  authSwitchEl.classList.add("hidden");
  authTitleEl.textContent = state.passwordRecovery ? "Reset Password" : signedIn ? "你的账号" : "登录小暖";
  authSubtitleEl.textContent = signedIn
    ? state.passwordRecovery
      ? "输入一个新密码。改好以后，你就可以继续回到小暖这里。"
      : "你可以在这里确认账号、设置自动退出，或离开时清除这台设备上的记录。"
    : "用 Google 登录后，小暖才会在下次认出你，并只保存你明确允许记下的事。";
  authSubmitEl.textContent = state.passwordRecovery ? "Update Password" : state.authMode === "signup" ? "Create Free Account" : "Sign in";
  authSwitchCopyEl.textContent = state.authMode === "signup" ? "Already have an account?" : "没有账号？";
  authModeToggleEl.textContent = state.authMode === "signup" ? "Sign in" : "Create account";
  authPasswordEl.autocomplete = state.passwordRecovery || state.authMode === "signup" ? "new-password" : "current-password";
  forgotPasswordEl.classList.toggle("hidden", signedIn || state.passwordRecovery || state.authMode !== "signin");
  authStatusEl.textContent = signedIn && !state.passwordRecovery ? "已登录。小暖只会把你允许记下的事同步到账号；普通聊天不会默认保存成账号记忆。" : "";
  memoryLoginNoteEl.classList.toggle("hidden", signedIn);
  renderCompanionMode();
  renderRelationshipNote();
}

function clearStoredPrivateCache() {
  localStorage.removeItem("nuanyou-profile");
  localStorage.removeItem("nuanyou-memories");
  localStorage.removeItem("nuanyou-memory-candidates");
  localStorage.removeItem("nuanyou-messages");
  localStorage.removeItem("nuanyou-moods");
  localStorage.removeItem("nuanyou-memory-login-notice");
  localStorage.removeItem("nuanyou-cognition-core");
  localStorage.removeItem("nuanyou-nudge-stats");
  localStorage.removeItem("nuanyou-companion-mode");
  localStorage.removeItem("nuanyou-social-practice");
  localStorage.removeItem("nuanyou-social-trust");
  localStorage.removeItem("nuanyou-social-comfort");
  localStorage.removeItem("nuanyou-social-closeness");
  localStorage.removeItem("nuanyou-social-feedback");
}

async function loadCloudState() {
  if (!state.supabase || !state.session) return;

  const userId = state.session.user.id;
  const [{ data: profile }, { data: memories }, companionCoreResult] = await Promise.all([
    state.supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    state.supabase
      .from("memory_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    state.supabase.from("companion_cores").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  const companionCore = companionCoreResult?.data;

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

  if (companionCore?.core) {
    state.cognitionCore = {
      ...defaultCognitionCore,
      ...companionCore.core,
      self: {
        ...defaultCognitionCore.self,
        ...(companionCore.core.self || {}),
      },
      principles: companionCore.core.principles || defaultCognitionCore.principles,
      learnedStyle: {
        ...defaultCognitionCore.learnedStyle,
        ...(companionCore.core.learnedStyle || {}),
      },
      memorySettings: {
        ...defaultCognitionCore.memorySettings,
        ...(companionCore.core.memorySettings || {}),
      },
      lifeEvents: companionCore.core.lifeEvents || [],
    };
    state.nudgeStats = companionCore.nudge_stats || {};
    state.companionMode = companionCore.core.companionMode === "social" ? "social" : "support";
    state.socialPractice = {
      ...state.socialPractice,
      ...(companionCore.core.socialPractice || {}),
    };
    state.socialPractice.enabled = state.companionMode === "social" && state.socialPractice.enabled !== false;
    saveCognitionCore({ localOnly: true });
    saveNudgeStats({ localOnly: true });
  } else {
    await saveCognitionCoreRemote();
  }
  ensureCompanionFirstMeet();

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
  await saveCognitionCoreRemote();
  await Promise.all(state.memories.filter((memory) => memory.status !== "deleted").map((memory) => syncMemory(memory)));
}

async function saveCognitionCoreRemote() {
  if (!state.supabase || !state.session) return;
  state.cognitionCore.socialPractice = {
    enabled: state.socialPractice.enabled,
    trust: state.socialPractice.trust,
    comfort: state.socialPractice.comfort,
    closeness: state.socialPractice.closeness,
    lastFeedback: state.socialPractice.lastFeedback,
  };
  state.cognitionCore.companionMode = state.companionMode;
  await state.supabase.from("companion_cores").upsert({
    user_id: state.session.user.id,
    core: state.cognitionCore,
    nudge_stats: state.nudgeStats,
    updated_at: new Date().toISOString(),
  }).then(() => null);
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
  renderRelationshipNote();
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

function captureMemoryCheckInProgress(text) {
  if (!state.pendingMemoryCheckIn || !state.session) return null;
  const reply = text.trim();
  if (!reply || /先不说|不想说|不用|没事|算了|跳过/.test(reply)) {
    state.pendingMemoryCheckIn = null;
    return null;
  }
  const original = state.pendingMemoryCheckIn.content || "之前那件事";
  const candidate = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    type: "progress",
    content: `关于「${original.slice(0, 48)}」的新进展：${reply.slice(0, 140)}`,
    prompt: `你刚刚补充了这件事的新进展。要不要让我以后也记得？“${reply.slice(0, 120)}”`,
    createdAt: new Date().toISOString(),
    source: "memory_check_in",
  };
  state.pendingMemoryCheckIn = null;
  if (saveMemoryDirectly(candidate)) {
    return candidate;
  }
  addMemoryCandidate(candidate);
  addCompanionLifeEvent({
    type: "memory_follow_up",
    title: "回访了一件旧事",
    summary: `小暖根据已授权记忆询问了近况，并等待用户决定是否保存新进展。`,
    source: "memory_check_in",
  });
  return candidate;
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
  rememberCompanionLearnedMemory(memory);
  removeMemoryCandidate(candidateId);
  renderRelationshipNote();
  syncMemory(memory);
}

function saveMemoryDirectly(candidate) {
  if (!candidate || !state.session || !canDirectlyRememberType(candidate.type)) return false;
  const memory = {
    ...candidate,
    status: "active",
    createdAt: candidate.createdAt || new Date().toISOString(),
  };
  state.memories.unshift(memory);
  rememberCompanionLearnedMemory(memory);
  persist();
  renderRecords();
  renderRelationshipNote();
  syncMemory(memory);
  addMessage("friend", `${getMemorySavedReply(memory)}\n\n这类事是你允许我直接记下的。如果你之后想改，去记录页把授权取消就好。`, "soft-nudge");
  return true;
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
  if (memory.type === "progress") {
    return `好，我会把这个新进展接到那件旧事后面。以后再提起时，我不会只记得开头，也会记得它后来发生了变化。`;
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
        companionMode: state.companionMode,
        cognitionCore: summarizeCognitionCore(),
        socialPractice: state.socialPractice,
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
  cancelQuestionFollowup();
  cancelAmbientNudge();
  cancelMemoryCheckIn();
  const proactivePreference = detectProactivePreference(text);
  resolvePendingNudge(proactivePreference === false ? "quieted" : "responded");
  learnFromUserFeedback(text);
  updateSocialPracticeFromUser(text);
  const checkInCandidate = captureMemoryCheckInProgress(text);
  addMessage("user", text);
  inputEl.value = "";
  resetInputActivity();

  if (proactivePreference === false) {
    setProactiveMode("quiet", { boundary: true });
    if (text.length <= 32) {
      addMessage("friend", "好，我会安静一点。以后你不主动发出来，我就不在输入停顿或沉默太久时接话。");
      return;
    }
  } else if (proactivePreference === true) {
    setProactiveMode("gentle");
    if (text.length <= 32) {
      addMessage("friend", "好，那我会在你卡住或沉默很久的时候轻轻接一下，但不会催你。");
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
        } else if (checkInCandidate) {
          if (!canDirectlyRememberType(checkInCandidate.type)) {
            addMessage("friend", "我把这个新进展先放进记忆收纳箱了。等你愿意时，可以去记录里决定要不要真的留下。", "soft-nudge");
            maybePromptMemoryInbox();
          }
        } else if (memoryCandidate) {
          if (state.session) {
            if (!saveMemoryDirectly(memoryCandidate)) {
              addMemoryCandidate(memoryCandidate);
              maybePromptMemoryInbox();
            }
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
inputEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
});

document.querySelector("#clear-chat").addEventListener("click", () => {
  cancelDraftNudge();
  cancelQuestionFollowup();
  cancelAmbientNudge();
  cancelMemoryCheckIn();
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
  rememberCompanionLearnedMemory(memory);
  addMessage("friend", getMemorySavedReply(memory));
  hideMemoryRequest();
  persist();
  renderRecords();
  renderRelationshipNote();
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
  ensureCompanionFirstMeet();
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
  authStatusEl.textContent = "用 Google 登录后，小暖只会同步你允许记下的事。";
  googleLoginEl.focus();
});

recordsLoginButtonEl.addEventListener("click", () => {
  authPanelEl.classList.remove("hidden");
  authStatusEl.textContent = state.supabase
    ? "登录后才会开启私人日记本；随便聊聊时不会留下本机记录。"
    : "当前环境还没有连上 Supabase 登录配置。请先用线上 Vercel 地址打开网站。";
  googleLoginEl.focus();
});

privacyTimeoutSelectEl.addEventListener("change", () => {
  setPrivacyTimeout(Number(privacyTimeoutSelectEl.value));
});

proactiveCueToggleEl.addEventListener("click", () => {
  if (state.proactiveMode === "quiet") {
    setProactiveMode("gentle");
    addMessage("friend", "好，我会回到轻轻接话的状态。你卡住或沉默很久的时候，我会试着靠近一点，但不催你。", "soft-nudge");
    return;
  }
  setProactiveMode("quiet", { boundary: true });
  addMessage("friend", "好，我先安静一点。你发出来以后，我再认真接住。", "soft-nudge");
});

modeSwitchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.session) return;
    setCompanionMode(button.dataset.companionMode);
  });
});

socialModeToggleEl.addEventListener("click", () => {
  state.socialPractice.enabled = !state.socialPractice.enabled;
  state.socialPractice.lastFeedback = state.socialPractice.enabled
    ? "好，我继续陪你练习相遇。小暖会留意哪些靠近让她安心，哪些靠近会太快。"
    : "好，社交反馈先暂停。小暖还在这里，只是不再给相处方式做反馈。";
  persist();
  renderSocialPractice();
  renderMemoryPermissionSettings();
  saveCognitionCore();
  addMessage("friend", state.socialPractice.lastFeedback, "soft-nudge");
});

memoryPermissionInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (!canUseDirectMemory()) {
      renderMemoryPermissionSettings();
      return;
    }
    const selected = [...memoryPermissionInputs].filter((item) => item.checked).map((item) => item.value);
    setDirectMemoryTypes(selected);
    addCompanionLifeEvent({
      type: "memory_permission",
      title: "调整了直接记忆授权",
      summary: selected.length
        ? `用户允许小暖直接记下这些类型：${selected.join("、")}。`
        : "用户取消了直接记忆授权，小暖继续全部先询问。",
      source: "user_permission",
    });
  });
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
  if (view === "chat") {
    scheduleAmbientNudge(9000);
    scheduleMemoryCheckIn(18000);
  } else {
    cancelAmbientNudge();
    cancelMemoryCheckIn();
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
  renderRelationshipNote();
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
    renderRelationshipNote();
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
updateProactiveUi();
privacyTimeoutSelectEl.value = String(state.privacyTimeoutSeconds);
initSupabase();
startPrivacyTimer();

if (state.profile) {
  ensureCompanionFirstMeet();
  appShellEl.classList.remove("intro-mode");
  topEyebrowEl.textContent = state.profile.name ? `欢迎你，${state.profile.name}` : "欢迎回来";
  switchView("chat");
} else {
  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  document.querySelector("#intro-view").classList.add("active");
}
