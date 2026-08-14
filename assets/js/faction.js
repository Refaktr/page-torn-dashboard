const STATUS_CLASS_MAP = {
  green: "status-green",
  red: "status-red",
  blue: "status-blue",
  orange: "status-orange",
  yellow: "status-yellow"
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
      is_revivable: false
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

function setLiveRequestContext(factionName, apiKey) {
  currentLiveRequest = {
    factionName,
    apiKey
  };
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

async function loadFactionFromApi(factionName, apiKey) {
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
  const factionId = searchData?.search?.[0]?.id;

  if (!factionId) {
    throw new Error("No faction match found.");
  }

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

  console.log("Loaded faction data", { factionName, factionId, membersData });

  return {
    factionName,
    members: Object.values(membersData?.members || {})
  };
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
    const data = await loadFactionFromApi(currentLiveRequest.factionName, currentLiveRequest.apiKey);
    setMembers(data.members);
    setSummary(data.factionName, data.members.length, "Live API");

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

  setLiveRequestContext(factionName, apiKey);
  setSummary(factionName, "...", "Live API");

  const loaded = await refreshLiveRoster(false, true);

  if (!loaded) {
    return;
  }

  if (ffscouterApiKey) {
    await loadFairFightForFaction(factionName, currentMembers, ffscouterApiKey);
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
