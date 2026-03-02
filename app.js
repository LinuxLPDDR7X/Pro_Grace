const STORAGE_KEY = "pro-grace-v1";
const API_DATA_ENDPOINT = "/api/data";
const REMOTE_LOAD_TIMEOUT_MS = 2000;
const REMOTE_SAVE_TIMEOUT_MS = 2500;
const MIN_IGNITE_ADD = 15;
const ALLOWED_TARGETS = [100, 250, 400, 500];
const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  supabaseUrl: "",
  supabaseAnonKey: "",
  supabaseTable: "prograce_state",
  supabaseRowId: "primary",
});
const runtimeConfig = {
  ...DEFAULT_RUNTIME_CONFIG,
  ...(typeof window.PRO_GRACE_CONFIG === "object" && window.PRO_GRACE_CONFIG ? window.PRO_GRACE_CONFIG : {}),
};
const SUPABASE_URL = typeof runtimeConfig.supabaseUrl === "string" ? runtimeConfig.supabaseUrl.trim() : "";
const SUPABASE_ANON_KEY = typeof runtimeConfig.supabaseAnonKey === "string" ? runtimeConfig.supabaseAnonKey.trim() : "";
const SUPABASE_TABLE = typeof runtimeConfig.supabaseTable === "string" ? runtimeConfig.supabaseTable.trim() || "prograce_state" : "prograce_state";
const SUPABASE_ROW_ID = typeof runtimeConfig.supabaseRowId === "string" ? runtimeConfig.supabaseRowId.trim() || "primary" : "primary";
const PERSISTENCE_TARGET = {
  none: "none",
  server: "server",
  supabase: "supabase",
};
const SUBJECTS = {
  mathematics: "Mathematics",
  physics: "Physics",
  chemistry: "Chemistry",
};
const MILESTONES = [
  { pct: 10, icon: "🔥", label: "Ignition" },
  { pct: 25, icon: "💪", label: "Momentum" },
  { pct: 50, icon: "⚡", label: "Halfway" },
  { pct: 75, icon: "🚩", label: "JEE Advanced" },
  { pct: 90, icon: "👑", label: "Royal Push" },
  { pct: 100, icon: "🏆", label: "Mastered" },
];

function createDefaultData() {
  return {
    chaptersBySubject: {
      mathematics: [
        { id: "m1", name: "Quadratic Equations", target: 100 },
        { id: "m2", name: "Definite Integration", target: 250 },
        { id: "m3", name: "Vectors and 3D", target: 100 },
      ],
      physics: [
        { id: "p1", name: "Current Electricity", target: 100 },
        { id: "p2", name: "Ray Optics", target: 250 },
        { id: "p3", name: "Modern Physics", target: 100 },
      ],
      chemistry: [
        { id: "c1", name: "Chemical Kinetics", target: 100 },
        { id: "c2", name: "Coordination Compounds", target: 250 },
        { id: "c3", name: "Aldehydes and Ketones", target: 100 },
      ],
    },
    users: {
      himanshu: {
        name: "Himanshu",
        lastOpened: {
          mathematics: "m2",
          physics: "p1",
          chemistry: "c2",
        },
        solvedBySubject: {
          mathematics: { m1: 55, m2: 108, m3: 49 },
          physics: { p1: 41, p2: 83, p3: 52 },
          chemistry: { c1: 62, c2: 122, c3: 44 },
        },
      },
      priyanshu: {
        name: "Priyanshu",
        lastOpened: {
          mathematics: "m1",
          physics: "p2",
          chemistry: "c1",
        },
        solvedBySubject: {
          mathematics: { m1: 59, m2: 74, m3: 47 },
          physics: { p1: 48, p2: 101, p3: 39 },
          chemistry: { c1: 66, c2: 95, c3: 41 },
        },
      },
    },
  };
}

function normalizeData(rawData) {
  const defaults = createDefaultData();
  if (!rawData || typeof rawData !== "object") return defaults;

  const normalized = {
    chaptersBySubject: {},
    users: {
      himanshu: {
        name: "Himanshu",
        lastOpened: {},
        solvedBySubject: {},
      },
      priyanshu: {
        name: "Priyanshu",
        lastOpened: {},
        solvedBySubject: {},
      },
    },
  };

  Object.keys(SUBJECTS).forEach((subjectKey) => {
    const fallbackChapters = defaults.chaptersBySubject[subjectKey];
    const sourceChapters = Array.isArray(rawData.chaptersBySubject?.[subjectKey])
      ? rawData.chaptersBySubject[subjectKey]
      : fallbackChapters;

    normalized.chaptersBySubject[subjectKey] = sourceChapters
      .map((chapter, index) => {
        const safeName =
          typeof chapter?.name === "string" && chapter.name.trim()
            ? chapter.name.trim().slice(0, 120)
            : `Chapter ${index + 1}`;
        const rawTarget = Number.parseInt(chapter?.target, 10);
        const safeTarget = ALLOWED_TARGETS.includes(rawTarget) ? rawTarget : 100;
        const safeId =
          typeof chapter?.id === "string" && chapter.id.trim()
            ? chapter.id.trim()
            : `${subjectKey[0]}auto${index + 1}`;

        return {
          id: safeId,
          name: safeName,
          target: safeTarget,
        };
      })
      .filter((chapter, index, list) => {
        return list.findIndex((item) => item.id === chapter.id) === index;
      });
  });

  Object.keys(normalized.users).forEach((userKey) => {
    const sourceUser = rawData.users?.[userKey];
    if (typeof sourceUser?.name === "string" && sourceUser.name.trim()) {
      normalized.users[userKey].name = sourceUser.name.trim();
    }

    Object.keys(SUBJECTS).forEach((subjectKey) => {
      normalized.users[userKey].solvedBySubject[subjectKey] = {};
      const chapters = normalized.chaptersBySubject[subjectKey];

      chapters.forEach((chapter) => {
        const rawSolved = Number.parseInt(sourceUser?.solvedBySubject?.[subjectKey]?.[chapter.id], 10);
        const safeSolved = Number.isNaN(rawSolved) ? 0 : Math.max(0, Math.min(rawSolved, chapter.target));
        normalized.users[userKey].solvedBySubject[subjectKey][chapter.id] = safeSolved;
      });

      const rawLastOpened = sourceUser?.lastOpened?.[subjectKey];
      const isValidLastOpened = chapters.some((chapter) => chapter.id === rawLastOpened);
      normalized.users[userKey].lastOpened[subjectKey] = isValidLastOpened ? rawLastOpened : chapters[0]?.id || null;
    });
  });

  return normalized;
}

function isSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (SUPABASE_URL.includes("YOUR-PROJECT") || SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")) return false;
  return true;
}

function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (!window.supabase || typeof window.supabase.createClient !== "function") return null;

  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return supabaseClient;
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function shouldTryServerFallback() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

async function loadDataFromServer() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_LOAD_TIMEOUT_MS);

  try {
    const response = await fetch(API_DATA_ENDPOINT, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to load data file: ${response.status}`);
    }

    const parsed = await response.json();
    return normalizeData(parsed);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Server load timed out after ${REMOTE_LOAD_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadDataFromSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const queryPromise = client
    .from(SUPABASE_TABLE)
    .select("payload")
    .eq("id", SUPABASE_ROW_ID)
    .maybeSingle();
  const { data, error } = await withTimeout(queryPromise, REMOTE_LOAD_TIMEOUT_MS, "Supabase load");

  if (error) {
    throw new Error(`Failed to load Supabase data: ${error.message}`);
  }

  if (data && typeof data.payload === "object" && data.payload) {
    return normalizeData(data.payload);
  }

  const seeded = loadDataFromLocalBackup();
  try {
    await persistToSupabase(seeded);
  } catch (persistError) {
    // Keep local seeded state if first upsert fails.
  }
  return normalizeData(seeded);
}

function loadDataFromLocalBackup() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    if (!rawData) return createDefaultData();
    const parsed = JSON.parse(rawData);
    return normalizeData(parsed);
  } catch (error) {
    return createDefaultData();
  }
}

let appData = createDefaultData();

const state = {
  activeUser: "himanshu",
  currentView: "dashboard",
  currentSubject: "mathematics",
  openChapterId: null,
  chapterSearchTerm: "",
  chapterSortBy: "least-progress",
};

const elements = {
  dashboardView: document.getElementById("dashboard-view"),
  subjectView: document.getElementById("subject-view"),
  chaptersGrid: document.getElementById("chapters-grid"),
  chapterSearchInput: document.getElementById("chapter-search-input"),
  chapterSortSelect: document.getElementById("chapter-sort-select"),
  addChapterModal: document.getElementById("add-chapter-modal"),
  addChapterForm: document.getElementById("add-chapter-form"),
  chapterNameInput: document.getElementById("chapter-name-input"),
  chapterTargetInput: document.getElementById("chapter-target-input"),
  subjectPageTitle: document.getElementById("subject-page-title"),
  subjectPageMeta: document.getElementById("subject-page-meta"),
  subjectChapterCount: document.getElementById("subject-chapter-count"),
  subjectTargetTotal: document.getElementById("subject-target-total"),
  subjectSolvedTotal: document.getElementById("subject-solved-total"),
  subjectRemainingTotal: document.getElementById("subject-remaining-total"),
  chapterDrawer: document.getElementById("chapter-drawer"),
  drawerSubjectLabel: document.getElementById("drawer-subject-label"),
  drawerTitle: document.getElementById("drawer-title"),
  drawerTarget: document.getElementById("drawer-target"),
  drawerSolved: document.getElementById("drawer-solved"),
  drawerRemaining: document.getElementById("drawer-remaining"),
  drawerNote: document.getElementById("drawer-note"),
  chapterSolvedInput: document.getElementById("chapter-solved-input"),
  chapterProgressForm: document.getElementById("chapter-progress-form"),
  chapterProgressSubmit: document.getElementById("chapter-progress-submit"),
  chapterProgressUndo: document.getElementById("chapter-progress-undo"),
  quickAddRow: document.getElementById("quick-add-row"),
  addToBothCheckbox: document.getElementById("add-to-both-checkbox"),
  questionGrid: document.getElementById("question-grid"),
  gridDimensions: document.getElementById("grid-dimensions"),
  gridCompletedLabel: document.getElementById("grid-completed-label"),
  undoToast: document.getElementById("undo-toast"),
  undoMessage: document.getElementById("undo-message"),
  undoAction: document.getElementById("undo-action"),
  undoDismiss: document.getElementById("undo-dismiss"),
};

const undoState = {
  snapshot: null,
  timeoutId: null,
  countdownId: null,
  expiresAt: 0,
};

let persistenceTarget = PERSISTENCE_TARGET.none;
let saveRequestInFlight = null;
let saveQueuedData = null;
let supabaseClient = null;
let hasLocalMutationsSinceBoot = false;

function saveLocalBackup(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Ignore backup failures to keep app functional.
  }
}

async function persistToSupabase(data) {
  const client = getSupabaseClient();
  if (!client) return false;

  const upsertPromise = client.from(SUPABASE_TABLE).upsert(
    {
      id: SUPABASE_ROW_ID,
      payload: normalizeData(data),
    },
    { onConflict: "id" },
  );
  const { error } = await withTimeout(upsertPromise, REMOTE_SAVE_TIMEOUT_MS, "Supabase save");

  if (error) {
    throw new Error(`Failed to save Supabase data: ${error.message}`);
  }

  return true;
}

async function persistToServer(data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_SAVE_TIMEOUT_MS);

  try {
    const response = await fetch(API_DATA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to save data file: ${response.status}`);
    }

    return true;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Server save timed out after ${REMOTE_SAVE_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function persistToRemote(data) {
  if (persistenceTarget === PERSISTENCE_TARGET.supabase) {
    return persistToSupabase(data);
  }

  if (persistenceTarget === PERSISTENCE_TARGET.server) {
    return persistToServer(data);
  }

  return false;
}

function queueRemoteSave() {
  if (persistenceTarget === PERSISTENCE_TARGET.none) return;
  saveQueuedData = normalizeData(appData);
  if (saveRequestInFlight) return;

  saveRequestInFlight = (async () => {
    while (saveQueuedData) {
      const payload = saveQueuedData;
      saveQueuedData = null;
      try {
        await persistToRemote(payload);
      } catch (error) {
        persistenceTarget = PERSISTENCE_TARGET.none;
        console.warn("[Pro Grace] Remote save failed. Falling back to local backup only.", error);
        break;
      }
    }
  })().finally(() => {
    saveRequestInFlight = null;
  });
}

function saveData() {
  hasLocalMutationsSinceBoot = true;
  appData = normalizeData(appData);
  saveLocalBackup(appData);
  queueRemoteSave();
}

function clampPercentage(value) {
  return Math.max(0, Math.min(100, value));
}

function getMilestoneProgressDetails(progress) {
  const safeProgress = clampPercentage(progress);
  const unlocked = MILESTONES.filter((milestone) => safeProgress >= milestone.pct);
  const latest = unlocked.length ? unlocked[unlocked.length - 1] : null;
  const next = MILESTONES.find((milestone) => safeProgress < milestone.pct) || null;
  return { latest, next, safeProgress };
}

function formatMilestoneStatus(progress) {
  const details = getMilestoneProgressDetails(progress);
  if (details.safeProgress >= 100) {
    return "🏆 Mastered. Full target achieved.";
  }

  if (!details.latest && details.next) {
    return `Next: ${details.next.icon} ${details.next.label} at ${details.next.pct}%`;
  }

  if (details.latest && details.next) {
    return `Unlocked ${details.latest.icon} ${details.latest.label}. Next: ${details.next.icon} ${details.next.label} at ${details.next.pct}%`;
  }

  if (details.latest) {
    return `Unlocked ${details.latest.icon} ${details.latest.label}.`;
  }

  return "Milestone path active.";
}

function formatChapterMilestoneStatus(progress) {
  const details = getMilestoneProgressDetails(progress);
  if (details.safeProgress >= 100) {
    return "🏆 Chapter mastered.";
  }

  if (!details.latest && details.next) {
    return `Next ${details.next.icon} ${details.next.label} at ${details.next.pct}%`;
  }

  if (details.latest && details.next) {
    return `${details.latest.icon} ${details.latest.label} unlocked | Next ${details.next.icon} ${details.next.pct}%`;
  }

  if (details.latest) {
    return `${details.latest.icon} ${details.latest.label} unlocked`;
  }

  return "Milestone path active.";
}

function renderChapterMilestones(progress) {
  return MILESTONES.map((milestone) => {
    const isUnlocked = progress >= milestone.pct;
    const classes = isUnlocked
      ? "chapter-milestone-chip is-unlocked"
      : "chapter-milestone-chip";
    return `<span class="${classes}" title="${milestone.label} ${milestone.pct}%">${milestone.icon} ${milestone.pct}%</span>`;
  }).join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (match) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[match];
  });
}

function toTitleCase(subjectKey) {
  return SUBJECTS[subjectKey];
}

function getChapterProgressPercent(userKey, subjectKey, chapter) {
  if (!chapter?.target) return 0;
  const solved = Math.min(getSolvedCount(userKey, subjectKey, chapter.id), chapter.target);
  return Math.round((solved / chapter.target) * 100);
}

function renderMilestoneMarkers() {
  const stripHtml = MILESTONES.map((milestone) => {
    return `<span class="overall-milestone-pin" title="${milestone.label} ${milestone.pct}%">${milestone.icon} ${milestone.pct}%</span>`;
  }).join("");
  const overallStrip = document.getElementById("overall-milestone-strip");
  if (overallStrip) {
    overallStrip.innerHTML = stripHtml;
  }

  Object.keys(SUBJECTS).forEach((subjectKey) => {
    const rail = document.getElementById(`${subjectKey}-milestones`);
    if (!rail) return;
    rail.innerHTML = MILESTONES.map((milestone) => {
      return `<span class="vertical-milestone-pin" style="bottom:${milestone.pct}%;" title="${milestone.label} ${milestone.pct}%">${milestone.icon}</span>`;
    }).join("");
  });
}

function getChapters(subjectKey) {
  return appData.chaptersBySubject[subjectKey] || [];
}

function getSolvedCount(userKey, subjectKey, chapterId) {
  return appData.users[userKey].solvedBySubject[subjectKey]?.[chapterId] || 0;
}

function setSolvedCount(userKey, subjectKey, chapterId, solved) {
  if (!appData.users[userKey].solvedBySubject[subjectKey]) {
    appData.users[userKey].solvedBySubject[subjectKey] = {};
  }

  appData.users[userKey].solvedBySubject[subjectKey][chapterId] = solved;
}

function getProgressTargetUsers() {
  if (elements.addToBothCheckbox?.checked) {
    return Object.keys(appData.users);
  }

  return [state.activeUser];
}

function updateDrawerActionState(chapter, activeRemaining) {
  const progressUsers = getProgressTargetUsers();
  const canAdd = progressUsers.some((userKey) => {
    const solved = getSolvedCount(userKey, state.currentSubject, chapter.id);
    return Math.max(chapter.target - solved, 0) > 0;
  });
  const canUndo = progressUsers.some((userKey) => {
    return getSolvedCount(userKey, state.currentSubject, chapter.id) > 0;
  });

  elements.chapterProgressSubmit.disabled = !canAdd;
  elements.chapterProgressUndo.disabled = !canUndo;
  elements.quickAddRow.querySelectorAll(".quick-add-btn").forEach((button) => {
    button.disabled = !canAdd;
  });

  if (!canAdd) {
    const scopeLabel = progressUsers.length > 1 ? "both users" : appData.users[state.activeUser].name;
    elements.drawerNote.textContent = `Chapter complete for ${scopeLabel}. Use Undo Fire if you want to correct an extra add.`;
    return;
  }

  if (progressUsers.length === 1 && activeRemaining < MIN_IGNITE_ADD) {
    elements.drawerNote.textContent = `Only final top-up of ${activeRemaining} is allowed to finish this chapter.`;
    return;
  }

  if (progressUsers.length > 1) {
    elements.drawerNote.textContent = `Enter solved count for this session. Minimum ${MIN_IGNITE_ADD} to Add Progress. Add mode: both users.`;
  }
}

function computeSubjectTotals(userKey, subjectKey) {
  const chapters = getChapters(subjectKey);

  return chapters.reduce(
    (acc, chapter) => {
      const solved = Math.min(getSolvedCount(userKey, subjectKey, chapter.id), chapter.target);
      acc.target += chapter.target;
      acc.solved += solved;
      return acc;
    },
    { target: 0, solved: 0 }
  );
}

function computeOverallProgress(userKey) {
  const totals = Object.keys(SUBJECTS).reduce(
    (acc, subjectKey) => {
      const subjectTotals = computeSubjectTotals(userKey, subjectKey);
      acc.target += subjectTotals.target;
      acc.solved += subjectTotals.solved;
      return acc;
    },
    { target: 0, solved: 0 }
  );

  if (!totals.target) return 0;
  return clampPercentage((totals.solved / totals.target) * 100);
}

function getLastOpenedChapter(userKey, subjectKey) {
  const chapterId = appData.users[userKey].lastOpened[subjectKey];
  if (!chapterId) return null;
  const chapter = getChapters(subjectKey).find((item) => item.id === chapterId);
  return chapter || null;
}

function syncUserSwitchUI() {
  const tabs = document.querySelectorAll(".user-chip");
  tabs.forEach((tab) => {
    const isActive = tab.dataset.user === state.activeUser;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}

function renderOverallComparison() {
  const himanshuProgress = computeOverallProgress("himanshu");
  const priyanshuProgress = computeOverallProgress("priyanshu");
  const himanshuMarker = Math.max(2, Math.min(98, himanshuProgress));
  const priyanshuMarker = Math.max(2, Math.min(98, priyanshuProgress));
  const himanshuRunner = document.getElementById("runner-himanshu");
  const priyanshuRunner = document.getElementById("runner-priyanshu");

  himanshuRunner.style.left = `${himanshuMarker}%`;
  priyanshuRunner.style.left = `${priyanshuMarker}%`;
  document.getElementById("score-himanshu").textContent = `Himanshu ${Math.round(himanshuProgress)}%`;
  document.getElementById("score-priyanshu").textContent = `Priyanshu ${Math.round(priyanshuProgress)}%`;

  const leadLabel = document.getElementById("overall-active");
  if (himanshuProgress > priyanshuProgress) {
    leadLabel.textContent = "Himanshu Leading";
    himanshuRunner.classList.add("is-leading");
    priyanshuRunner.classList.remove("is-leading");
  } else if (priyanshuProgress > himanshuProgress) {
    leadLabel.textContent = "Priyanshu Leading";
    priyanshuRunner.classList.add("is-leading");
    himanshuRunner.classList.remove("is-leading");
  } else {
    leadLabel.textContent = "Neck to Neck";
    himanshuRunner.classList.remove("is-leading");
    priyanshuRunner.classList.remove("is-leading");
  }

  const himanshuMilestone = getMilestoneProgressDetails(himanshuProgress).latest;
  const priyanshuMilestone = getMilestoneProgressDetails(priyanshuProgress).latest;
  const himanshuMilestoneText = himanshuMilestone
    ? `${himanshuMilestone.icon} ${himanshuMilestone.label}`
    : "No milestone yet";
  const priyanshuMilestoneText = priyanshuMilestone
    ? `${priyanshuMilestone.icon} ${priyanshuMilestone.label}`
    : "No milestone yet";

  const overallMilestoneStatus = document.getElementById("overall-milestone-status");
  overallMilestoneStatus.textContent = `Himanshu: ${himanshuMilestoneText} | Priyanshu: ${priyanshuMilestoneText}`;
}

function renderDashboard() {
  Object.keys(SUBJECTS).forEach((subjectKey) => {
    const subjectTotals = computeSubjectTotals(state.activeUser, subjectKey);
    const target = subjectTotals.target;
    const solved = subjectTotals.solved;
    const remaining = Math.max(target - solved, 0);
    const progress = target ? clampPercentage((solved / target) * 100) : 0;
    const lastOpened = getLastOpenedChapter(state.activeUser, subjectKey);
    const suggestionButton = document.getElementById(`${subjectKey}-last`);

    document.getElementById(`${subjectKey}-fill`).style.height = `${progress}%`;
    document.getElementById(`${subjectKey}-value`).textContent = `${Math.round(progress)}%`;
    document.getElementById(`${subjectKey}-hero-value`).textContent = `${Math.round(progress)}%`;
    document.getElementById(`${subjectKey}-target`).textContent = target.toLocaleString();
    document.getElementById(`${subjectKey}-solved`).textContent = solved.toLocaleString();
    document.getElementById(`${subjectKey}-remaining`).textContent = remaining.toLocaleString();
    document.getElementById(`${subjectKey}-milestone`).textContent = formatMilestoneStatus(progress);

    if (lastOpened) {
      suggestionButton.textContent = `Last Opened: ${lastOpened.name}`;
      suggestionButton.dataset.chapterId = lastOpened.id;
      suggestionButton.disabled = false;
    } else {
      suggestionButton.textContent = "Last Opened: --";
      delete suggestionButton.dataset.chapterId;
      suggestionButton.disabled = true;
    }
  });
}

function renderSubjectPage() {
  if (state.currentView !== "subject") return;

  const userLabel = appData.users[state.activeUser].name;
  const subjectLabel = toTitleCase(state.currentSubject);
  const chapters = getChapters(state.currentSubject);
  const totals = computeSubjectTotals(state.activeUser, state.currentSubject);
  const progress = totals.target ? Math.round((totals.solved / totals.target) * 100) : 0;

  elements.subjectPageTitle.textContent = subjectLabel;
  elements.subjectPageMeta.textContent = `${userLabel} | ${progress}% completed`;
  elements.subjectChapterCount.textContent = chapters.length.toLocaleString();
  elements.subjectTargetTotal.textContent = totals.target.toLocaleString();
  elements.subjectSolvedTotal.textContent = totals.solved.toLocaleString();
  elements.subjectRemainingTotal.textContent = Math.max(totals.target - totals.solved, 0).toLocaleString();

  let visibleChapters = [...chapters];
  const searchTerm = state.chapterSearchTerm.trim().toLowerCase();
  if (searchTerm) {
    visibleChapters = visibleChapters.filter((chapter) => chapter.name.toLowerCase().includes(searchTerm));
  }

  visibleChapters.sort((a, b) => {
    if (state.chapterSortBy === "alphabetical") {
      return a.name.localeCompare(b.name);
    }

    if (state.chapterSortBy === "target-high") {
      return b.target - a.target;
    }

    const progressA = getChapterProgressPercent(state.activeUser, state.currentSubject, a);
    const progressB = getChapterProgressPercent(state.activeUser, state.currentSubject, b);
    if (state.chapterSortBy === "most-progress") {
      return progressB - progressA;
    }

    return progressA - progressB;
  });

  if (!chapters.length) {
    elements.chaptersGrid.innerHTML = `
      <div class="empty-state">
        No chapters yet in ${subjectLabel}. Use "Add Chapter" to create one for both users.
      </div>
    `;
    return;
  }

  if (!visibleChapters.length) {
    elements.chaptersGrid.innerHTML = `
      <div class="empty-state">
        No chapter matched "${escapeHtml(state.chapterSearchTerm)}".
      </div>
    `;
    return;
  }

  const html = visibleChapters
    .map((chapter) => {
      const solved = Math.min(getSolvedCount(state.activeUser, state.currentSubject, chapter.id), chapter.target);
      const chapterProgress = getChapterProgressPercent(state.activeUser, state.currentSubject, chapter);
      const safeName = escapeHtml(chapter.name);
      const chapterMilestoneStatus = escapeHtml(formatChapterMilestoneStatus(chapterProgress));
      const chapterMilestones = renderChapterMilestones(chapterProgress);
      return `
        <article class="chapter-card" data-chapter-id="${chapter.id}" role="button" tabindex="0" aria-label="Open ${safeName}">
          <div class="chapter-card-head">
            <h3>${safeName}</h3>
            <button class="chapter-remove-btn" type="button" data-chapter-id="${chapter.id}" aria-label="Remove ${safeName}">
              Remove
            </button>
          </div>
          <p class="chapter-meta">Target: ${chapter.target.toLocaleString()} Questions</p>
          <div class="chapter-progress-track">
            <div class="chapter-progress-fill" style="width: ${chapterProgress}%;"></div>
          </div>
          <div class="chapter-milestones">
            ${chapterMilestones}
          </div>
          <p class="chapter-milestone-status">${chapterMilestoneStatus}</p>
          <div class="chapter-stats">
            <span>${solved.toLocaleString()} solved</span>
            <span>${chapterProgress}%</span>
          </div>
        </article>
      `;
    })
    .join("");

  elements.chaptersGrid.innerHTML = html;
}

function generateChapterId(subjectKey) {
  const prefix = subjectKey[0];
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function openSubjectPage(subjectKey) {
  state.currentSubject = subjectKey;
  state.currentView = "subject";
  elements.dashboardView.classList.remove("is-active");
  elements.subjectView.classList.add("is-active");
  elements.chapterSearchInput.value = state.chapterSearchTerm;
  elements.chapterSortSelect.value = state.chapterSortBy;
  closeChapterDrawer();
  renderSubjectPage();
}

function openDashboard() {
  state.currentView = "dashboard";
  elements.subjectView.classList.remove("is-active");
  elements.dashboardView.classList.add("is-active");
  closeChapterDrawer();
}

function openAddChapterModal() {
  elements.addChapterModal.hidden = false;
  elements.chapterNameInput.value = "";
  elements.chapterTargetInput.value = String(ALLOWED_TARGETS[0]);
  elements.chapterNameInput.focus();
}

function closeAddChapterModal() {
  elements.addChapterModal.hidden = true;
}

function renderChapterDrawer() {
  const chapterId = state.openChapterId;
  if (!chapterId) return;

  const chapter = getChapters(state.currentSubject).find((item) => item.id === chapterId);
  if (!chapter) return;

  const subjectLabel = toTitleCase(state.currentSubject);
  const userLabel = appData.users[state.activeUser].name;
  const solved = Math.min(getSolvedCount(state.activeUser, state.currentSubject, chapter.id), chapter.target);
  const remaining = Math.max(chapter.target - solved, 0);

  elements.drawerSubjectLabel.textContent = `${subjectLabel} | ${userLabel}`;
  elements.drawerTitle.textContent = chapter.name;
  elements.drawerTarget.textContent = chapter.target.toLocaleString();
  elements.drawerSolved.textContent = solved.toLocaleString();
  elements.drawerRemaining.textContent = remaining.toLocaleString();
  elements.drawerNote.textContent = `Enter solved count for this session. Minimum ${MIN_IGNITE_ADD} to Add Progress.`;
  elements.chapterSolvedInput.value = "";
  elements.chapterSolvedInput.max = String(chapter.target);
  elements.chapterSolvedInput.min = "1";
  elements.chapterSolvedInput.disabled = chapter.target === 0;
  updateDrawerActionState(chapter, remaining);

  const cols = Math.ceil(Math.sqrt(chapter.target));
  const rows = Math.ceil(chapter.target / cols);
  elements.gridDimensions.textContent = `Grid: ${cols} x ${rows}`;
  elements.gridCompletedLabel.textContent = `${solved.toLocaleString()} / ${chapter.target.toLocaleString()} ignited`;
  elements.questionGrid.style.setProperty("--question-cols", String(cols));

  const cells = [];
  for (let index = 0; index < chapter.target; index += 1) {
    const className = index < solved ? "question-cell is-lit" : "question-cell";
    cells.push(`<div class="${className}"></div>`);
  }
  elements.questionGrid.innerHTML = cells.join("");
}

function showUndoToast(snapshot) {
  if (undoState.timeoutId) {
    clearTimeout(undoState.timeoutId);
  }
  if (undoState.countdownId) {
    clearInterval(undoState.countdownId);
  }

  undoState.snapshot = snapshot;
  undoState.expiresAt = Date.now() + 5000;

  const updateUndoLabel = () => {
    const remainingSeconds = Math.max(0, Math.ceil((undoState.expiresAt - Date.now()) / 1000));
    elements.undoAction.textContent = `Undo (${remainingSeconds}s)`;
  };

  updateUndoLabel();
  undoState.countdownId = setInterval(updateUndoLabel, 250);
  undoState.timeoutId = setTimeout(() => {
    hideUndoToast();
  }, 5000);

  elements.undoMessage.textContent = `Removed "${snapshot.chapter.name}".`;
  elements.undoToast.hidden = false;
}

function hideUndoToast() {
  if (undoState.timeoutId) {
    clearTimeout(undoState.timeoutId);
  }
  if (undoState.countdownId) {
    clearInterval(undoState.countdownId);
  }

  undoState.snapshot = null;
  undoState.timeoutId = null;
  undoState.countdownId = null;
  undoState.expiresAt = 0;
  elements.undoToast.hidden = true;
}

function undoRemoveChapter() {
  const snapshot = undoState.snapshot;
  if (!snapshot) return;

  const chapters = getChapters(snapshot.subjectKey);
  const restoreIndex = Math.max(0, Math.min(snapshot.index, chapters.length));
  chapters.splice(restoreIndex, 0, snapshot.chapter);

  Object.keys(appData.users).forEach((userKey) => {
    const details = snapshot.perUser[userKey];
    setSolvedCount(userKey, snapshot.subjectKey, snapshot.chapter.id, details.solved);
    appData.users[userKey].lastOpened[snapshot.subjectKey] = details.lastOpened;
  });

  hideUndoToast();
  saveData();
  renderOverallComparison();
  renderDashboard();
  renderSubjectPage();
  if (state.openChapterId === snapshot.chapter.id) {
    renderChapterDrawer();
  }
}

function openChapterDrawer(chapterId) {
  state.openChapterId = chapterId;
  if (elements.addToBothCheckbox) {
    elements.addToBothCheckbox.checked = false;
  }
  appData.users[state.activeUser].lastOpened[state.currentSubject] = chapterId;
  saveData();
  renderDashboard();
  renderSubjectPage();
  renderChapterDrawer();
  elements.chapterDrawer.classList.add("is-open");
  elements.chapterDrawer.setAttribute("aria-hidden", "false");
}

function closeChapterDrawer() {
  state.openChapterId = null;
  elements.chapterDrawer.classList.remove("is-open");
  elements.chapterDrawer.setAttribute("aria-hidden", "true");
}

function adjustChapterProgress(value, direction) {
  if (!state.openChapterId) return;

  const chapter = getChapters(state.currentSubject).find((item) => item.id === state.openChapterId);
  if (!chapter) return;

  const parsed = Number.parseInt(value, 10);
  const amount = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
  if (amount <= 0) return;

  const isAddAction = direction !== "subtract";
  const targetUsers = getProgressTargetUsers();

  const perUser = targetUsers.map((userKey) => {
    const currentSolved = getSolvedCount(userKey, state.currentSubject, chapter.id);
    const remaining = Math.max(chapter.target - currentSolved, 0);
    return {
      userKey,
      name: appData.users[userKey].name,
      currentSolved,
      remaining,
    };
  });

  if (isAddAction) {
    if (amount < MIN_IGNITE_ADD) {
      const hasInvalidUser = perUser.some((item) => {
        const isFinalTopUp = item.remaining < MIN_IGNITE_ADD && amount === item.remaining;
        return !isFinalTopUp;
      });

      if (hasInvalidUser) {
        if (perUser.length > 1) {
          elements.drawerNote.textContent = `Minimum add is ${MIN_IGNITE_ADD} for both users. Smaller values are allowed only as exact final top-up for each user.`;
        } else {
          elements.drawerNote.textContent = `Minimum add is ${MIN_IGNITE_ADD}. Only final top-up can be smaller.`;
        }

        return;
      }
    }
  }

  const updates = perUser.map((item) => {
    const delta = direction === "subtract" ? -amount : amount;
    const safeSolved = Math.max(0, Math.min(item.currentSolved + delta, chapter.target));
    const change = safeSolved - item.currentSolved;
    return {
      ...item,
      safeSolved,
      change,
      cappedAtTarget: direction !== "subtract" && safeSolved < item.currentSolved + amount,
      hitZero: direction === "subtract" && safeSolved === 0 && item.currentSolved > 0,
    };
  });

  const hasAnyChange = updates.some((item) => item.change !== 0);
  if (!hasAnyChange) {
    if (isAddAction) {
      elements.drawerNote.textContent = "No change applied. Selected users are already at target.";
    } else {
      elements.drawerNote.textContent = "No change applied. Nothing left to undo.";
    }
    return;
  }

  updates.forEach((item) => {
    if (item.change === 0) return;
    setSolvedCount(item.userKey, state.currentSubject, chapter.id, item.safeSolved);
  });
  saveData();

  renderOverallComparison();
  renderDashboard();
  renderSubjectPage();
  renderChapterDrawer();

  if (direction === "subtract") {
    if (updates.length === 1) {
      const actualRemoved = Math.abs(updates[0].change);
      const cappedMessage = actualRemoved < amount ? " (hit 0)." : ".";
      elements.drawerNote.textContent = `Undid ${actualRemoved} fires${cappedMessage}`;
      return;
    }

    const summary = updates
      .map((item) => {
        const removed = Math.max(0, Math.abs(item.change));
        const suffix = item.hitZero ? " (hit 0)" : "";
        return `${item.name}: -${removed}${suffix}`;
      })
      .join(" | ");
    elements.drawerNote.textContent = `Undo applied to both users. ${summary}`;
    return;
  }

  if (updates.length === 1) {
    const actualAdded = Math.max(0, updates[0].change);
    const cappedMessage = actualAdded < amount ? " (capped at target)." : ".";
    elements.drawerNote.textContent = `Added +${actualAdded} questions${cappedMessage}`;
    return;
  }

  const summary = updates
    .map((item) => {
      const added = Math.max(0, item.change);
      const suffix = item.cappedAtTarget ? " (capped)" : "";
      return `${item.name}: +${added}${suffix}`;
    })
    .join(" | ");
  elements.drawerNote.textContent = `Added progress to both users. ${summary}`;
}

function removeChapterForBothUsers(chapterId) {
  const chapters = getChapters(state.currentSubject);
  const chapterIndex = chapters.findIndex((item) => item.id === chapterId);
  const chapter = chapterIndex >= 0 ? chapters[chapterIndex] : null;
  if (!chapter) return;

  const shouldDelete = window.confirm(`Remove "${chapter.name}" for both users?`);
  if (!shouldDelete) return;

  const snapshot = {
    subjectKey: state.currentSubject,
    chapter: { ...chapter },
    index: chapterIndex,
    perUser: {},
  };

  Object.keys(appData.users).forEach((userKey) => {
    snapshot.perUser[userKey] = {
      solved: getSolvedCount(userKey, state.currentSubject, chapterId),
      lastOpened: appData.users[userKey].lastOpened[state.currentSubject],
    };
  });

  appData.chaptersBySubject[state.currentSubject] = chapters.filter((item) => item.id !== chapterId);
  const fallbackChapterId = appData.chaptersBySubject[state.currentSubject][0]?.id || null;

  Object.keys(appData.users).forEach((userKey) => {
    if (appData.users[userKey].solvedBySubject[state.currentSubject]) {
      delete appData.users[userKey].solvedBySubject[state.currentSubject][chapterId];
    }

    if (appData.users[userKey].lastOpened[state.currentSubject] === chapterId) {
      appData.users[userKey].lastOpened[state.currentSubject] = fallbackChapterId;
    }
  });

  if (state.openChapterId === chapterId) {
    closeChapterDrawer();
  }

  saveData();
  renderOverallComparison();
  renderDashboard();
  renderSubjectPage();
  showUndoToast(snapshot);
}

function addChapterForBothUsers(chapterName, target) {
  const chapterId = generateChapterId(state.currentSubject);
  const newChapter = { id: chapterId, name: chapterName, target };
  appData.chaptersBySubject[state.currentSubject].push(newChapter);

  Object.keys(appData.users).forEach((userKey) => {
    setSolvedCount(userKey, state.currentSubject, chapterId, 0);
  });

  saveData();
  renderOverallComparison();
  renderDashboard();
  renderSubjectPage();
}

function handleChapterGridSelection(event) {
  const removeButton = event.target.closest(".chapter-remove-btn");
  if (removeButton) {
    removeChapterForBothUsers(removeButton.dataset.chapterId);
    return;
  }

  const card = event.target.closest(".chapter-card");
  if (!card) return;
  openChapterDrawer(card.dataset.chapterId);
}

function attachEvents() {
  document.querySelectorAll(".user-chip").forEach((tab) => {
    tab.addEventListener("click", () => {
      const selectedUser = tab.dataset.user;
      if (!selectedUser || selectedUser === state.activeUser) return;

      state.activeUser = selectedUser;
      syncUserSwitchUI();
      renderOverallComparison();
      renderDashboard();
      renderSubjectPage();
      if (elements.chapterDrawer.classList.contains("is-open")) {
        renderChapterDrawer();
      }
    });
  });

  document.querySelectorAll(".subject-open-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const subjectKey = button.dataset.subject;
      if (!subjectKey) return;
      openSubjectPage(subjectKey);
    });
  });

  document.querySelectorAll(".suggestion-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const subjectKey = button.dataset.subject;
      const chapterId = button.dataset.chapterId;
      if (!subjectKey) return;
      openSubjectPage(subjectKey);
      if (chapterId) {
        openChapterDrawer(chapterId);
      }
    });
  });

  elements.chapterSearchInput.addEventListener("input", () => {
    state.chapterSearchTerm = elements.chapterSearchInput.value;
    renderSubjectPage();
  });

  elements.chapterSortSelect.addEventListener("change", () => {
    state.chapterSortBy = elements.chapterSortSelect.value;
    renderSubjectPage();
  });

  document.getElementById("back-to-dashboard").addEventListener("click", openDashboard);
  document.getElementById("open-add-chapter").addEventListener("click", openAddChapterModal);
  document.getElementById("close-add-modal").addEventListener("click", closeAddChapterModal);
  document.getElementById("cancel-add-chapter").addEventListener("click", closeAddChapterModal);

  elements.addChapterForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const chapterName = elements.chapterNameInput.value.trim();
    const target = Number.parseInt(elements.chapterTargetInput.value, 10);
    if (!chapterName || !ALLOWED_TARGETS.includes(target)) return;

    addChapterForBothUsers(chapterName, target);
    closeAddChapterModal();
  });

  elements.addChapterModal.addEventListener("click", (event) => {
    if (event.target === elements.addChapterModal) {
      closeAddChapterModal();
    }
  });

  elements.chaptersGrid.addEventListener("click", handleChapterGridSelection);
  elements.chaptersGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest(".chapter-remove-btn")) return;
    const card = event.target.closest(".chapter-card");
    if (!card) return;
    event.preventDefault();
    openChapterDrawer(card.dataset.chapterId);
  });

  document.getElementById("close-drawer").addEventListener("click", closeChapterDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", closeChapterDrawer);

  elements.chapterProgressForm.addEventListener("submit", (event) => {
    event.preventDefault();
    adjustChapterProgress(elements.chapterSolvedInput.value, "add");
  });

  elements.quickAddRow.addEventListener("click", (event) => {
    const button = event.target.closest(".quick-add-btn");
    if (!button) return;
    adjustChapterProgress(button.dataset.add, "add");
  });

  elements.chapterProgressUndo.addEventListener("click", () => {
    adjustChapterProgress(elements.chapterSolvedInput.value, "subtract");
  });

  elements.addToBothCheckbox?.addEventListener("change", () => {
    if (!state.openChapterId) return;
    renderChapterDrawer();
  });

  elements.undoAction.addEventListener("click", undoRemoveChapter);
  elements.undoDismiss.addEventListener("click", hideUndoToast);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!elements.addChapterModal.hidden) {
        closeAddChapterModal();
        return;
      }
      if (elements.chapterDrawer.classList.contains("is-open")) {
        closeChapterDrawer();
        return;
      }
    }

    if (event.key === "/" && state.currentView === "subject") {
      const tag = event.target?.tagName || "";
      const isTypingField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable;
      if (!isTypingField) {
        event.preventDefault();
        elements.chapterSearchInput.focus();
      }
    }
  });
}

async function init() {
  const renderAll = () => {
    syncUserSwitchUI();
    renderOverallComparison();
    renderDashboard();
    renderSubjectPage();
    if (elements.chapterDrawer.classList.contains("is-open")) {
      renderChapterDrawer();
    }
  };

  appData = normalizeData(loadDataFromLocalBackup());
  persistenceTarget = PERSISTENCE_TARGET.none;

  renderMilestoneMarkers();
  renderAll();
  attachEvents();

  const hydrateRemoteData = async () => {
    let remoteData = null;
    let remoteMode = PERSISTENCE_TARGET.none;

    try {
      remoteData = await loadDataFromSupabase();
      remoteMode = PERSISTENCE_TARGET.supabase;
    } catch (supabaseError) {
      if (shouldTryServerFallback()) {
        try {
          remoteData = await loadDataFromServer();
          remoteMode = PERSISTENCE_TARGET.server;
        } catch (serverError) {
          remoteMode = PERSISTENCE_TARGET.none;
        }
      }
    }

    persistenceTarget = remoteMode;

    if (remoteData && !hasLocalMutationsSinceBoot) {
      appData = normalizeData(remoteData);
      saveLocalBackup(appData);
      renderAll();
    }

    if (remoteMode !== PERSISTENCE_TARGET.none && hasLocalMutationsSinceBoot) {
      queueRemoteSave();
    }

    console.info(`[Pro Grace] Persistence mode: ${persistenceTarget}`);
    if (persistenceTarget === PERSISTENCE_TARGET.none) {
      console.warn("[Pro Grace] Remote persistence is not active. Data is saved in this browser only.");
    }
  };

  void hydrateRemoteData();
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("[Pro Grace] Service worker registration failed.", error);
    });
  });
}

void init();
