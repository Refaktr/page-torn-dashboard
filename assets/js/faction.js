const STATUS_CLASS_MAP = {
  green: "status-green",
  red: "status-red",
  blue: "status-blue",
  orange: "status-orange",
  yellow: "status-yellow"
};

const FLIGHT_VARIANCE_PERCENT = 0.03;
const FLIGHT_TIMES_BY_DESTINATION = {
  mexico: { standard: 24, airstrip: 17, wlt: 12, business: 7 },
  "cayman islands": { standard: 33, airstrip: 23, wlt: 17, business: 10 },
  canada: { standard: 39, airstrip: 27, wlt: 19, business: 12 },
  hawaii: { standard: 127, airstrip: 89, wlt: 63, business: 38 },
  "united kingdom": { standard: 151, airstrip: 106, wlt: 75, business: 45 },
  argentina: { standard: 158, airstrip: 111, wlt: 79, business: 47 },
  switzerland: { standard: 166, airstrip: 116, wlt: 83, business: 50 },
  japan: { standard: 213, airstrip: 149, wlt: 107, business: 64 },
  china: { standard: 229, airstrip: 160, wlt: 114, business: 69 },
  "united arab emirates": { standard: 257, airstrip: 180, wlt: 128, business: 77 },
  "south africa": { standard: 282, airstrip: 197, wlt: 141, business: 85 }
};

const DEMO_DATA = {
  factionName: "Warband of the Fallen",
  members: [
    {
      name: "Astra Vale",
      level: 98,
      position: "Leader",
      status: { description: "Online", color: "green" },
      last_action: { relative: "2 minutes ago" },
      is_revivable: false
    },
    {
      name: "Kestrel Voss",
      level: 84,
      position: "Deputy",
      status: { description: "Idle", color: "yellow" },
      last_action: { relative: "18 minutes ago" },
      is_revivable: true
    },
    {
      name: "Morrow Dane",
      level: 76,
      position: "Recruiter",
      status: { description: "Traveling", color: "blue" },
      last_action: { relative: "1 hour ago" },
      is_revivable: false,
      travel: {
        destination: "Mexico",
        aircraft: "Standard"
      }
    },
    {
      name: "Iris Noct",
      level: 61,
      position: "Member",
      status: { description: "Hospital", color: "red" },
      last_action: { relative: "3 hours ago" },
      is_revivable: true
    }
  ]
};

const form = document.getElementById("faction-form");
const factionNameInput = document.getElementById("faction-name");
const demoButton = document.getElementById("demo-button");
const autoRefreshToggle = document.getElementById("auto-refresh-toggle");
const memberBody = document.getElementById("member-body");
const factionTitle = document.getElementById("faction-title");
const memberCount = document.getElementById("member-count");
const dataSource = document.getElementById("data-source");
const message = document.getElementById("message");
const sortButtons = Array.from(document.querySelectorAll(".sort-button"));

let currentMembers = [];
let currentLiveRequest = null;
let autoRefreshTimerId = null;
let isRefreshing = false;
let fairFightMap = {};
let fairFightLoadedForFaction = null;
let flightTimesByDestination = { ...FLIGHT_TIMES_BY_DESTINATION };
let previousStatusByMemberKey = {};
let hasStatusBaseline = false;
let toastContainer = null;
let sortState = {
  key: null,
  direction: "asc"
};

const SORT_LABELS = {
  name: "Name",
  level: "Lvl",
  position: "Position",
  status: "Status",
  revive: "Revive",
  lastAction: "Last Action",
  fairFight: "Fair Fight"
};

function getSavedApiKey() {
  const sessionApiKey = sessionStorage.getItem("tornApiKey");
  if (sessionApiKey) {
    return sessionApiKey;
  }

  const storedApiKey = localStorage.getItem("tornApiKey");
  return storedApiKey || "";
}

function getSavedFFScouterApiKey() {
  const sessionApiKey = sessionStorage.getItem("ffscouterApiKey");
  if (sessionApiKey) {
    return sessionApiKey;
  }

  const storedApiKey = localStorage.getItem("ffscouterApiKey");
  return storedApiKey || "";
}

function setMessage(text) {
  message.textContent = text;
}

function setSummary(name, count, source) {
  factionTitle.textContent = name || "Unknown faction";
  memberCount.textContent = String(count);
  dataSource.textContent = source;
}

function stopAutoRefresh() {
  if (autoRefreshTimerId !== null) {
    window.clearInterval(autoRefreshTimerId);
    autoRefreshTimerId = null;
  }
}

function syncAutoRefreshState() {
  if (!autoRefreshToggle.checked || !currentLiveRequest) {
    stopAutoRefresh();
    return;
  }

  stopAutoRefresh();
  autoRefreshTimerId = window.setInterval(() => {
    refreshLiveRoster(true);
  }, 5000);
}

function setLiveRequestContext(factionName, apiKey, factionId = null) {
  currentLiveRequest = {
    factionName,
    apiKey,
    factionId
  };
}

function resetStatusTracking() {
  previousStatusByMemberKey = {};
  hasStatusBaseline = false;
}

function statusClass(color) {
  return STATUS_CLASS_MAP[color] || "status-default";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseRelativeTimeToMinutes(value) {
  const match = String(value ?? "").trim().match(/^(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago$/i);
  if (!match) {
    return Number.NaN;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    minute: 1,
    minutes: 1,
    hour: 60,
    hours: 60,
    day: 1440,
    days: 1440,
    week: 10080,
    weeks: 10080,
    month: 43200,
    months: 43200,
    year: 525600,
    years: 525600
  };

  return amount * (multipliers[unit] || 1);
}

function getSortValue(member, key) {
  switch (key) {
    case "name":
      return String(member?.name ?? "").toLowerCase();
    case "level":
      return Number(member?.level ?? 0);
    case "position":
      return String(member?.position ?? "").toLowerCase();
    case "status":
      return String(member?.status?.description ?? "").toLowerCase();
    case "revive":
      return member?.is_revivable ? 1 : 0;
    case "lastAction": {
      const relative = String(member?.last_action?.relative ?? "");
      const minutes = parseRelativeTimeToMinutes(relative);
      return Number.isNaN(minutes) ? relative.toLowerCase() : minutes;
    }
    case "fairFight": {
      const entry = fairFightMap[member?.id];
      return typeof entry?.fairFight === "number" ? entry.fairFight : -1;
    }
    default:
      return "";
  }
}

function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  return String(a).localeCompare(String(b));
}

function getSortedMembers() {
  const members = [...currentMembers];

  if (!sortState.key) {
    return members;
  }

  return members.sort((first, second) => {
    const firstValue = getSortValue(first, sortState.key);
    const secondValue = getSortValue(second, sortState.key);
    const base = compareValues(firstValue, secondValue);
    return sortState.direction === "asc" ? base : -base;
  });
}

function updateSortIndicators() {
  sortButtons.forEach((button) => {
    const th = button.closest("th");
    const key = button.dataset.sortKey;
    const isActive = key === sortState.key;
    const direction = isActive ? sortState.direction : "none";

    button.dataset.direction = direction;
    button.setAttribute("aria-label", isActive
      ? `${SORT_LABELS[key] || key}, sorted ${direction}. Click to toggle order.`
      : `${SORT_LABELS[key] || key}, not sorted. Click to sort ascending.`);

    if (th) {
      th.setAttribute("aria-sort", isActive ? (direction === "asc" ? "ascending" : "descending") : "none");
    }
  });
}

function formatFairFight(member) {
  const entry = fairFightMap[member?.id];

  if (!entry || (entry.fairFight == null && !entry.bsEstimateHuman)) {
    return "";
  }

  const fairFightText = typeof entry.fairFight === "number" ? entry.fairFight.toFixed(2) : "?";
  const bsText = entry.bsEstimateHuman || "?";
  return `${fairFightText} (${bsText})`;
}

function getMemberIdentityKey(member) {
  if (member?.id !== undefined && member?.id !== null && member?.id !== "") {
    return `id:${member.id}`;
  }

  const fallbackName = normalizeTextKey(member?.name);
  return fallbackName ? `name:${fallbackName}` : "";
}

function getMemberStatusDescription(member) {
  return String(member?.status?.description ?? "Unknown").trim();
}

function getMemberStatusSignal(member) {
  const state = normalizeTextKey(member?.status?.state);
  if (state) {
    return state;
  }

  // Fallback if state is unavailable: strip variable countdown-style fragments.
  const description = normalizeTextKey(member?.status?.description)
    .replace(/\b\d+\s*(second|seconds|minute|minutes|hour|hours|day|days)\b/g, "")
    .replace(/\bfor\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return description || "unknown";
}

function buildStatusSnapshot(members) {
  return (Array.isArray(members) ? members : []).reduce((snapshot, member) => {
    const key = getMemberIdentityKey(member);
    if (!key) {
      return snapshot;
    }

    snapshot[key] = {
      name: String(member?.name ?? "Unknown"),
      status: getMemberStatusDescription(member),
      signal: getMemberStatusSignal(member)
    };
    return snapshot;
  }, {});
}

function collectStatusChanges(previousSnapshot, members) {
  const changes = [];

  (Array.isArray(members) ? members : []).forEach((member) => {
    const key = getMemberIdentityKey(member);
    if (!key || !previousSnapshot[key]) {
      return;
    }

    const oldStatus = String(previousSnapshot[key].status ?? "").trim();
    const oldSignal = String(previousSnapshot[key].signal ?? "").trim();
    const newStatus = getMemberStatusDescription(member);
    const newSignal = getMemberStatusSignal(member);

    if (!oldSignal || !newSignal || oldSignal === newSignal) {
      return;
    }

    changes.push({
      name: String(member?.name ?? previousSnapshot[key].name ?? "Unknown"),
      from: oldStatus,
      to: newStatus,
      member
    });
  });

  return changes;
}

function notifyStatusChanges(changes, factionName) {
  if (!Array.isArray(changes) || !changes.length) {
    return;
  }

  changes.slice(0, 6).forEach((change) => {
    const title = `${change.name} status changed`;
    const travelLine = formatTravelToastDetails(change.member);
    const body = travelLine
      ? `${change.from} -> ${change.to} (${factionName}) | ${travelLine}`
      : `${change.from} -> ${change.to} (${factionName})`;
    showStatusToast(title, body);
  });
}

function getToastContainer() {
  if (toastContainer && document.body.contains(toastContainer)) {
    return toastContainer;
  }

  toastContainer = document.createElement("div");
  toastContainer.id = "faction-toast-container";
  toastContainer.className = "faction-toast-container";
  document.body.appendChild(toastContainer);
  return toastContainer;
}

function removeToast(toastNode) {
  if (!toastNode) {
    return;
  }

  toastNode.classList.add("is-closing");
  window.setTimeout(() => {
    if (toastNode.parentNode) {
      toastNode.parentNode.removeChild(toastNode);
    }
  }, 180);
}

function showStatusToast(title, description) {
  const container = getToastContainer();
  const toast = document.createElement("button");
  toast.type = "button";
  toast.className = "faction-toast";

  const titleNode = document.createElement("strong");
  titleNode.className = "faction-toast-title";
  titleNode.textContent = title;

  const descNode = document.createElement("span");
  descNode.className = "faction-toast-body";
  descNode.textContent = description;

  toast.appendChild(titleNode);
  toast.appendChild(descNode);
  toast.title = "Click to dismiss";
  toast.addEventListener("click", () => {
    removeToast(toast);
  });

  container.appendChild(toast);

  window.setTimeout(() => {
    removeToast(toast);
  }, 30000);

  while (container.childElementCount > 8) {
    removeToast(container.firstElementChild);
  }
}

function normalizeTextKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function formatMinutesCompact(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "?";
  }

  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (!hours) {
    return `${mins}m`;
  }

  if (!mins) {
    return `${hours}h`;
  }

  return `${hours}h ${mins}m`;
}

function normalizeDestination(rawDestination) {
  const value = String(rawDestination ?? "").trim();
  if (!value) {
    return "";
  }

  const country = value.includes(":") ? value.split(":")[0] : value;
  return normalizeTextKey(country);
}

function parseDestinationFromStatusDescription(statusDescription) {
  const text = String(statusDescription ?? "").trim();
  if (!text) {
    return "";
  }

  const returnToTornMatch = text.match(/\bfrom\s+(.+?)\s+to\s+torn\b/i);
  if (returnToTornMatch && returnToTornMatch[1]) {
    return returnToTornMatch[1].trim();
  }

  const returnFromMatch = text.match(/\bto\s+torn\b.*\bfrom\s+(.+)$/i);
  if (returnFromMatch && returnFromMatch[1]) {
    return returnFromMatch[1].trim();
  }

  const outboundFromMatch = text.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/i);
  if (outboundFromMatch && outboundFromMatch[2]) {
    const destination = outboundFromMatch[2].trim();
    if (normalizeTextKey(destination) !== "torn") {
      return destination;
    }

    if (outboundFromMatch[1]) {
      return outboundFromMatch[1].trim();
    }
  }

  const toMatch = text.match(/\bto\s+(.+?)(?:\s+from\s+.+)?$/i);
  if (toMatch && toMatch[1]) {
    const destination = toMatch[1].trim();
    if (normalizeTextKey(destination) !== "torn") {
      return destination;
    }
  }

  const fromMatch = text.match(/\bfrom\s+(.+)$/i);
  if (fromMatch && fromMatch[1]) {
    return fromMatch[1].trim();
  }

  return "";
}

function formatPlaneTypeLabel(rawPlaneType) {
  const value = String(rawPlaneType ?? "").trim();
  if (!value) {
    return "Unknown plane";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveTravelProfile(rawAircraft) {
  const text = normalizeTextKey(rawAircraft);
  if (!text) {
    return "standard";
  }

  if (text.includes("light_aircraft") || text.includes("light aircraft")) {
    return "airstrip";
  }

  if (text.includes("private_jet") || text.includes("private jet")) {
    return "wlt";
  }

  if (text.includes("business_jet") || text.includes("business jet")) {
    return "business";
  }

  if (text.includes("business")) {
    return "business";
  }

  if (text.includes("wlt") || text.includes("wright") || text.includes("learjet")) {
    return "wlt";
  }

  if (text.includes("airstrip") || text.includes("private")) {
    return "airstrip";
  }

  return "standard";
}

function getTravelInfo(member) {
  const travel = member?.travel || member?.status?.travel || null;
  const statusDescription = String(member?.status?.description ?? "");
  const statusText = normalizeTextKey(statusDescription);
  const isTraveling = !!travel || statusText.includes("travel");

  if (!isTraveling) {
    return null;
  }

  const destination =
    travel?.destination ||
    travel?.country ||
    travel?.location ||
    travel?.city ||
    travel?.area ||
    parseDestinationFromStatusDescription(statusDescription) ||
    "";

  const aircraft =
    travel?.aircraft ||
    travel?.flight_class ||
    travel?.type ||
    travel?.method ||
    member?.status?.plane_image_type ||
    "standard";

  const watchlistDelayRaw =
    travel?.watchlist_delay_minutes ??
    travel?.watchlist_delay ??
    travel?.delay_minutes ??
    travel?.delay ??
    0;

  const watchlistDelayMinutes = Number(watchlistDelayRaw);

  return {
    destination,
    aircraft,
    profile: resolveTravelProfile(aircraft),
    watchlistDelayMinutes: Number.isFinite(watchlistDelayMinutes) && watchlistDelayMinutes > 0
      ? watchlistDelayMinutes
      : 0
  };
}

function getTravelEtaRange(info) {
  if (!info) {
    return null;
  }

  const destinationKey = normalizeDestination(info.destination);
  const base = destinationKey && flightTimesByDestination[destinationKey]
    ? flightTimesByDestination[destinationKey][info.profile] || flightTimesByDestination[destinationKey].standard
    : null;

  if (!base) {
    return null;
  }

  const min = Math.max(1, base * (1 - FLIGHT_VARIANCE_PERCENT)) + info.watchlistDelayMinutes;
  const max = base * (1 + FLIGHT_VARIANCE_PERCENT) + info.watchlistDelayMinutes;

  return {
    min,
    max
  };
}

function formatTravelToastDetails(member) {
  const info = getTravelInfo(member);
  if (!info) {
    return "";
  }

  const planeLabel = formatPlaneTypeLabel(info.aircraft);
  const destinationText = info.destination ? info.destination : "Unknown destination";
  const range = getTravelEtaRange(info);

  if (!range) {
    return `Plane: ${planeLabel} | Route: ${destinationText}`;
  }

  const etaText = `${formatMinutesCompact(range.min)} - ${formatMinutesCompact(range.max)}`;
  const watchlistSuffix = info.watchlistDelayMinutes > 0 ? ` (+watchlist ${info.watchlistDelayMinutes}m)` : "";
  return `Plane: ${planeLabel} | Route: ${destinationText} | Landing ETA: ${etaText}${watchlistSuffix}`;
}

function formatTravelEta(member) {
  const info = getTravelInfo(member);
  if (!info) {
    return "-";
  }

  const range = getTravelEtaRange(info);
  if (!range) {
    return "Traveling";
  }

  const etaText = `${formatMinutesCompact(range.min)} - ${formatMinutesCompact(range.max)}`;

  if (info.watchlistDelayMinutes > 0) {
    return `${etaText} (+watchlist)`;
  }

  return etaText;
}

function renderMembers() {
  const members = getSortedMembers();

  if (!members.length) {
    memberBody.innerHTML = '<tr class="empty-row"><td colspan="8">No members found.</td></tr>';
    return;
  }

  memberBody.innerHTML = members
    .map((member) => {
      const status = member.status || {};
      const revive = member.is_revivable ? '<span class="revive-badge revive-yes">Yes</span>' : "";
      const memberId = member?.id ?? "";
      const memberName = escapeHtml(member.name ?? "");
      const profileLink = memberId ? `https://www.torn.com/profiles.php?XID=${encodeURIComponent(memberId)}` : "#";
      const attackLink = memberId ? `https://www.torn.com/page.php?sid=attack&user2ID=${encodeURIComponent(memberId)}` : "#";
      const nameCell = memberId
        ? `<a href="${profileLink}" target="_blank" rel="noopener noreferrer" class="member-profile-link">${memberName}</a>`
        : memberName;
      const attackCell = memberId
        ? `<a href="${attackLink}" target="_blank" rel="noopener noreferrer" class="attack-action">ATTACK</a>`
        : "";

      return `
        <tr>
          <td>${nameCell}</td>
          <td>${escapeHtml(member.level ?? "")}</td>
          <td>${escapeHtml(member.position ?? "")}</td>
          <td><span class="status-badge ${statusClass(status.color)}">${escapeHtml(status.description ?? "")}</span></td>
          <td>${revive}</td>
          <td>${escapeHtml(member.last_action?.relative ?? "")}</td>
          <td><span class="fair-fight-score">${escapeHtml(formatFairFight(member))}</span></td>
          <td>${attackCell}</td>
        </tr>
      `;
    })
    .join("");
}

function setMembers(members) {
  currentMembers = Array.isArray(members) ? [...members] : [];
  renderMembers();
}

async function resolveFactionFromApi(factionName, apiKey) {
  const searchUrl = `https://api.torn.com/v2/faction/search?name=${encodeURIComponent(factionName)}`;
  console.log("API endpoint:", searchUrl);
  const searchResponse = await fetch(searchUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `ApiKey ${apiKey}`
    }
  });

  if (!searchResponse.ok) {
    throw new Error(`Faction search failed (${searchResponse.status})`);
  }

  const searchData = await searchResponse.json();
  const faction = searchData?.search?.[0];
  const factionId = faction?.id;

  if (!factionId) {
    throw new Error("No faction match found.");
  }

  return {
    factionId,
    factionName: faction?.name || factionName
  };
}

async function loadFactionMembersFromApi(factionId, apiKey) {
  const membersUrl = `https://api.torn.com/v2/faction/${factionId}/members`;
  console.log("API endpoint:", membersUrl);
  const membersResponse = await fetch(membersUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `ApiKey ${apiKey}`
    }
  });

  if (!membersResponse.ok) {
    throw new Error(`Member lookup failed (${membersResponse.status})`);
  }

  const membersData = await membersResponse.json();

  return Object.values(membersData?.members || {});
}

async function getFairFightData(userIdArray, apiKey) {
  if (!Array.isArray(userIdArray) || !userIdArray.length) {
    return {};
  }

  const targets = userIdArray.join(",");
  const ffScouterUrl = `https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(apiKey)}&targets=${encodeURIComponent(targets)}`;
  console.log("API endpoint:", ffScouterUrl);
  const response = await fetch(ffScouterUrl);

  if (!response.ok) {
    throw new Error(`Fair fight lookup failed (${response.status})`);
  }

  const data = await response.json();
  const fairFightById = {};

  (Array.isArray(data) ? data : []).forEach((entry) => {
    if (entry?.player_id == null) {
      return;
    }

    fairFightById[entry.player_id] = {
      fairFight: typeof entry.fair_fight === "number" ? entry.fair_fight : null,
      bsEstimateHuman: entry.bs_estimate_human ?? null
    };
  });

  return fairFightById;
}

async function loadFairFightForFaction(factionName, members, apiKey) {
  if (fairFightLoadedForFaction === factionName) {
    return;
  }

  const ids = members.map((member) => member?.id).filter((id) => id !== undefined && id !== null);

  if (!ids.length) {
    return;
  }

  fairFightLoadedForFaction = factionName;

  try {
    fairFightMap = await getFairFightData(ids, apiKey);
    renderMembers();
  } catch (error) {
    console.error("Fair fight lookup failed", error);
    fairFightLoadedForFaction = null;
    setMessage(error instanceof Error ? error.message : "Fair Fight data unavailable.");
  }
}

async function refreshLiveRoster(silent = false, clearOnError = false) {
  if (!currentLiveRequest || isRefreshing) {
    return false;
  }

  isRefreshing = true;

  if (!silent) {
    setMessage("Loading roster from Torn API...");
  }

  try {
    let factionName = currentLiveRequest.factionName;
    let factionId = currentLiveRequest.factionId;

    if (!factionId) {
      const resolved = await resolveFactionFromApi(factionName, currentLiveRequest.apiKey);
      factionId = resolved.factionId;
      factionName = resolved.factionName;
      setLiveRequestContext(factionName, currentLiveRequest.apiKey, factionId);
    }

    const members = await loadFactionMembersFromApi(factionId, currentLiveRequest.apiKey);
    const statusChanges = hasStatusBaseline
      ? collectStatusChanges(previousStatusByMemberKey, members)
      : [];

    previousStatusByMemberKey = buildStatusSnapshot(members);
    hasStatusBaseline = true;

    setMembers(members);
    setSummary(factionName, members.length, "Live API");
    notifyStatusChanges(statusChanges, factionName);

    console.log("Loaded faction data", { factionName, factionId, memberCount: members.length });

    if (!silent) {
      setMessage("Roster loaded successfully.");
    }
    return true;
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : "Unable to load faction data.");
    setSummary(currentLiveRequest.factionName, 0, "Error");
    if (clearOnError) {
      setMembers([]);
    }
    return false;
  } finally {
    isRefreshing = false;
  }
}

async function showDemoData() {
  stopAutoRefresh();
  autoRefreshToggle.checked = false;
  currentLiveRequest = null;
  resetStatusTracking();
  setMessage("Rendering demo roster.");
  setMembers(DEMO_DATA.members);
  setSummary(DEMO_DATA.factionName, DEMO_DATA.members.length, "Demo data");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const factionName = factionNameInput.value.trim();
  const apiKey = getSavedApiKey();
  const ffscouterApiKey = getSavedFFScouterApiKey();

  if (!factionName) {
    setMessage("Enter a faction name first.");
    return;
  }

  if (!apiKey) {
    setMessage("No saved Torn API key found. Save one on the Settings page or use demo view.");
    return;
  }

  resetStatusTracking();
  setLiveRequestContext(factionName, apiKey);
  setSummary(factionName, "...", "Live API");

  const loaded = await refreshLiveRoster(false, true);

  if (!loaded) {
    return;
  }

  if (ffscouterApiKey) {
    await loadFairFightForFaction(currentLiveRequest.factionName, currentMembers, ffscouterApiKey);
  }

  syncAutoRefreshState();
  if (autoRefreshToggle.checked) {
    setMessage("Auto-refresh enabled. Updating every 5 seconds.");
  }
});

demoButton.addEventListener("click", showDemoData);

autoRefreshToggle.addEventListener("change", () => {
  if (!autoRefreshToggle.checked) {
    stopAutoRefresh();
    setMessage("Auto-refresh disabled.");
    return;
  }

  if (!currentLiveRequest) {
    autoRefreshToggle.checked = false;
    setMessage("Load a live faction first, then enable auto-refresh.");
    return;
  }

  syncAutoRefreshState();
  setMessage("Auto-refresh enabled. Updating every 5 seconds.");
  refreshLiveRoster(true);
});

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sortKey;
    if (!key) {
      return;
    }

    if (sortState.key === key) {
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    } else {
      sortState = {
        key,
        direction: "asc"
      };
    }

    updateSortIndicators();
    renderMembers();
  });
});

updateSortIndicators();
syncAutoRefreshState();
showDemoData();
