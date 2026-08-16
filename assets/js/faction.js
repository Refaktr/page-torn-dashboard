(function () {
const { fetchFairFightScores, fetchFactionMembers, getSavedKey, resolveFaction } = window.FactionApi;
const { createRoster } = window.FactionRoster;
const { formatTravelToastDetails } = window.FactionTravel;

const DEMO_DATA = {
  factionName: "Warband of the Fallen",
  members: [
    { name: "Astra Vale", level: 98, position: "Leader", status: { description: "Online", color: "green" }, last_action: { relative: "2 minutes ago" }, is_revivable: false },
    { name: "Kestrel Voss", level: 84, position: "Deputy", status: { description: "Idle", color: "yellow" }, last_action: { relative: "18 minutes ago" }, is_revivable: true },
    { name: "Morrow Dane", level: 76, position: "Recruiter", status: { description: "Traveling", color: "blue" }, last_action: { relative: "1 hour ago" }, is_revivable: false, travel: { destination: "Mexico", aircraft: "Standard" } },
    { name: "Iris Noct", level: 61, position: "Member", status: { description: "Hospital", color: "red" }, last_action: { relative: "3 hours ago" }, is_revivable: true }
  ]
};

const form = document.getElementById("faction-form");
const factionNameInput = document.getElementById("faction-name");
const demoButton = document.getElementById("demo-button");
const sendRevivableWebhookButton = document.getElementById("send-revivable-webhook-button");
const sendCountryEnemiesWebhookButton = document.getElementById("send-country-enemies-webhook-button");
const autoRefreshToggle = document.getElementById("auto-refresh-toggle");
const flightWebhookToggle = document.getElementById("flight-webhook-toggle");
const countryWebhookTimerToggle = document.getElementById("country-webhook-timer-toggle");
const factionTitle = document.getElementById("faction-title");
const memberCount = document.getElementById("member-count");
const dataSource = document.getElementById("data-source");
const message = document.getElementById("message");

const roster = createRoster(
  document.getElementById("member-body"),
  Array.from(document.querySelectorAll(".sort-button"))
);

let currentRequest = null;
let ownFactionRequest = null;
let ownFactionMembers = [];
let ownFairFightScores = {};
let targetFlightTimers = {};
let ownFlightTimers = {};
let targetLastKnownCountries = {};
let ownLastKnownCountries = {};
let refreshTimerId = null;
let isRefreshing = false;
let previousStatusByMemberKey = {};
let hasStatusBaseline = false;
let toastContainer = null;
let countryWebhookTimerId = null;
const FLIGHT_WEBHOOK_STORAGE_KEY = "factionFlightWebhookEnabled";
const COUNTRY_WEBHOOK_TIMER_STORAGE_KEY = "factionCountryWebhookTimerEnabled";

function setMessage(text) {
  message.textContent = text;
}

function setSummary(name, count, source) {
  factionTitle.textContent = name || "Unknown faction";
  memberCount.textContent = String(count);
  dataSource.textContent = source;
}

function stopAutoRefresh() {
  if (refreshTimerId !== null) {
    window.clearInterval(refreshTimerId);
    refreshTimerId = null;
  }
}

function syncAutoRefresh() {
  stopAutoRefresh();
  if (!autoRefreshToggle.checked || !currentRequest) {
    return;
  }

  refreshTimerId = window.setInterval(() => refreshLiveRoster(true), 10000);
}

function stopCountryWebhookTimer() {
  if (countryWebhookTimerId !== null) {
    window.clearInterval(countryWebhookTimerId);
    countryWebhookTimerId = null;
  }
}

function resetStatusTracking() {
  previousStatusByMemberKey = {};
  hasStatusBaseline = false;
}

function statusKey(member) {
  return member?.id != null ? `id:${member.id}` : `name:${String(member?.name ?? "").trim().toLowerCase()}`;
}

function statusSignal(member) {
  const state = String(member?.status?.state ?? "").trim().toLowerCase();
  if (state) {
    return state;
  }

  return String(member?.status?.description ?? "Unknown")
    .toLowerCase()
    .replace(/\b\d+\s*(second|seconds|minute|minutes|hour|hours|day|days)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStatusSnapshot(members) {
  return members.reduce((snapshot, member) => {
    snapshot[statusKey(member)] = {
      name: String(member?.name ?? "Unknown"),
      description: String(member?.status?.description ?? "Unknown"),
      signal: statusSignal(member)
    };
    return snapshot;
  }, {});
}

function getStatusChanges(members) {
  if (!hasStatusBaseline) {
    return [];
  }

  return members.flatMap((member) => {
    const previous = previousStatusByMemberKey[statusKey(member)];
    const nextSignal = statusSignal(member);
    if (!previous || !previous.signal || previous.signal === nextSignal) {
      return [];
    }

    return [{
      name: String(member?.name ?? previous.name),
      from: previous.description,
      to: String(member?.status?.description ?? "Unknown"),
      member
    }];
  });
}

function getToastContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.createElement("div");
    toastContainer.id = "faction-toast-container";
    toastContainer.className = "faction-toast-container";
    document.body.appendChild(toastContainer);
  }

  return toastContainer;
}

function showStatusToast(title, body) {
  const toast = document.createElement("button");
  toast.type = "button";
  toast.className = "faction-toast";
  toast.innerHTML = `<strong class="faction-toast-title"></strong><span class="faction-toast-body"></span>`;
  toast.querySelector("strong").textContent = title;
  toast.querySelector("span").textContent = body;
  toast.addEventListener("click", () => toast.remove());
  getToastContainer().appendChild(toast);
  window.setTimeout(() => toast.remove(), 30000);
}

function notifyStatusChanges(changes, factionName) {
  changes.slice(0, 6).forEach((change) => {
    const travel = formatTravelToastDetails(change.member);
    const body = `${change.from} -> ${change.to} (${factionName})${travel ? ` | ${travel}` : ""}`;
    showStatusToast(`${change.name} status changed`, body);
  });

  const flightChanges = changes.filter((change) => /travel/i.test(`${change.from} ${change.to}`));
  if (!flightWebhookToggle.checked || !flightChanges.length) {
    return;
  }

  window.FactionDiscord.sendFlightEvents(factionName, flightChanges, roster.getFairFightScores()).catch((error) => {
    console.error("Flight event webhook failed", error);
  });
}

async function refreshFairFightScores(targetMembers, friendlyMembers) {
  const apiKey = getSavedKey("ffscouterApiKey");
  if (!apiKey) {
    roster.clearFairFightScores();
    ownFairFightScores = {};
    return;
  }

  const targetIds = targetMembers.map((member) => member?.id).filter((id) => id != null);
  const friendlyIds = friendlyMembers.map((member) => member?.id).filter((id) => id != null);
  const [targetResult, friendlyResult] = await Promise.allSettled([
    fetchFairFightScores(targetIds, apiKey),
    fetchFairFightScores(friendlyIds, apiKey)
  ]);

  if (targetResult.status === "fulfilled") {
    roster.setFairFightScores(targetResult.value);
  } else {
    roster.clearFairFightScores();
    console.error("Opponent Fair Fight lookup failed", targetResult.reason);
  }

  if (friendlyResult.status === "fulfilled") {
    ownFairFightScores = friendlyResult.value;
  } else {
    ownFairFightScores = {};
    console.error("Friendly Fair Fight lookup failed", friendlyResult.reason);
  }
}

async function sendCountryEnemiesWebhook(silent = false) {
  const members = roster.getMembers();
  const factionName = currentRequest?.factionName || factionTitle.textContent;

  if (!members.length) {
    if (!silent) {
      setMessage("Load a faction before sending a country-enemy webhook.");
    }
    return false;
  }

  try {
    await window.FactionDiscord.sendCountryEnemies(factionName, members, ownFactionRequest?.factionName || "Allies", ownFactionMembers, roster.getFairFightScores(), ownFairFightScores, targetFlightTimers, ownFlightTimers, targetLastKnownCountries, ownLastKnownCountries);
    if (!silent) {
      setMessage("Country enemies sent to Discord.");
    }
    return true;
  } catch (error) {
    console.error("Country enemy webhook failed", error);
    if (!silent) {
      setMessage(error instanceof Error ? error.message : "Unable to send the country-enemy webhook.");
    }
    return false;
  }
}

function syncCountryWebhookTimer() {
  stopCountryWebhookTimer();
  if (!countryWebhookTimerToggle.checked || !currentRequest) {
    return;
  }

  countryWebhookTimerId = window.setInterval(() => {
    refreshLiveRoster(true).then((loaded) => {
      if (loaded) {
        sendCountryEnemiesWebhook(true);
      }
    });
  }, 300000);
}

async function refreshLiveRoster(silent = false, clearOnError = false) {
  if (!currentRequest || isRefreshing) {
    return false;
  }

  isRefreshing = true;
  if (!silent) {
    setMessage("Loading roster from Torn API...");
  }

  try {
    if (!currentRequest.factionId) {
      const faction = await resolveFaction(currentRequest.factionName, currentRequest.apiKey);
      currentRequest = { ...currentRequest, factionName: faction.name, factionId: faction.id };
    }

    const targetRosterRequest = fetchFactionMembers(currentRequest.factionId, currentRequest.apiKey);
    const ownRosterRequest = refreshOwnFactionRoster().catch((error) => {
      ownFactionRequest = null;
      ownFactionMembers = [];
      console.warn("Unable to load own faction roster", error);
    });
    const [members] = await Promise.all([targetRosterRequest, ownRosterRequest]);
    await refreshFairFightScores(members, ownFactionMembers);
    targetFlightTimers = window.FactionFlightTimers.reconcile(`faction:${currentRequest.factionId}`, members);
    targetLastKnownCountries = window.FactionFlightTimers.getLocations(`faction:${currentRequest.factionId}`);
    ownFlightTimers = ownFactionRequest
      ? window.FactionFlightTimers.reconcile(`faction:${ownFactionRequest.factionId}`, ownFactionMembers)
      : {};
    ownLastKnownCountries = ownFactionRequest
      ? window.FactionFlightTimers.getLocations(`faction:${ownFactionRequest.factionId}`)
      : {};
    const changes = getStatusChanges(members);
    previousStatusByMemberKey = buildStatusSnapshot(members);
    hasStatusBaseline = true;
    roster.setMembers(members);
    setSummary(currentRequest.factionName, members.length, "Live API");
    notifyStatusChanges(changes, currentRequest.factionName);

    if (!silent) {
      setMessage("Roster loaded successfully.");
    }
    return true;
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : "Unable to load faction data.");
    setSummary(currentRequest.factionName, 0, "Error");
    if (clearOnError) {
      roster.setMembers([]);
    }
    return false;
  } finally {
    isRefreshing = false;
  }
}

async function refreshOwnFactionRoster() {
  const ownFactionName = getSavedKey("ownFactionName").trim();
  if (!ownFactionName || !currentRequest || ownFactionName.toLowerCase() === currentRequest.factionName.toLowerCase()) {
    ownFactionRequest = null;
    ownFactionMembers = [];
    return;
  }

  if (!ownFactionRequest || ownFactionRequest.factionName.toLowerCase() !== ownFactionName.toLowerCase()) {
    const faction = await resolveFaction(ownFactionName, currentRequest.apiKey);
    ownFactionRequest = { factionName: faction.name, factionId: faction.id };
  }

  ownFactionMembers = await fetchFactionMembers(ownFactionRequest.factionId, currentRequest.apiKey);
}

function showDemoData() {
  stopAutoRefresh();
  stopCountryWebhookTimer();
  autoRefreshToggle.checked = false;
  currentRequest = null;
  ownFactionRequest = null;
  ownFactionMembers = [];
  ownFairFightScores = {};
  targetFlightTimers = {};
  ownFlightTimers = {};
  targetLastKnownCountries = {};
  ownLastKnownCountries = {};
  roster.clearFairFightScores();
  resetStatusTracking();
  roster.setMembers(DEMO_DATA.members);
  setSummary(DEMO_DATA.factionName, DEMO_DATA.members.length, "Demo data");
  setMessage("Demo roster loaded.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const factionName = factionNameInput.value.trim();
  const apiKey = getSavedKey("tornApiKey");

  if (!factionName) {
    setMessage("Enter a faction name first.");
    return;
  }
  if (!apiKey) {
    setMessage("No saved Torn API key found. Save one on the Settings page or use demo view.");
    return;
  }

  stopAutoRefresh();
  resetStatusTracking();
  ownFairFightScores = {};
  targetFlightTimers = {};
  ownFlightTimers = {};
  targetLastKnownCountries = {};
  ownLastKnownCountries = {};
  roster.clearFairFightScores();
  currentRequest = { factionName, apiKey, factionId: null };
  setSummary(factionName, "...", "Live API");

  if (await refreshLiveRoster(false, true)) {
    syncAutoRefresh();
    syncCountryWebhookTimer();
  }
});

demoButton.addEventListener("click", showDemoData);
sendRevivableWebhookButton.addEventListener("click", async () => {
  const members = roster.getMembers();
  const factionName = currentRequest?.factionName || factionTitle.textContent;

  if (!members.length) {
    setMessage("Load a faction before sending a revivable-member webhook.");
    return;
  }

  sendRevivableWebhookButton.disabled = true;
  setMessage("Sending revivable members to Discord...");

  try {
    await window.FactionDiscord.sendRevivableMembers(factionName, members);
    setMessage("Revivable members sent to Discord.");
  } catch (error) {
    console.error("Discord webhook send failed", error);
    setMessage(error instanceof Error ? error.message : "Unable to send the Discord webhook.");
  } finally {
    sendRevivableWebhookButton.disabled = false;
  }
});

sendCountryEnemiesWebhookButton.addEventListener("click", async () => {
  sendCountryEnemiesWebhookButton.disabled = true;
  setMessage("Sending country enemies to Discord...");

  try {
    await sendCountryEnemiesWebhook();
  } finally {
    sendCountryEnemiesWebhookButton.disabled = false;
  }
});

flightWebhookToggle.checked = localStorage.getItem(FLIGHT_WEBHOOK_STORAGE_KEY) === "true";
flightWebhookToggle.addEventListener("change", () => {
  localStorage.setItem(FLIGHT_WEBHOOK_STORAGE_KEY, String(flightWebhookToggle.checked));
  setMessage(flightWebhookToggle.checked ? "Flight event webhooks enabled." : "Flight event webhooks disabled.");
});

countryWebhookTimerToggle.checked = localStorage.getItem(COUNTRY_WEBHOOK_TIMER_STORAGE_KEY) === "true";
countryWebhookTimerToggle.addEventListener("change", () => {
  localStorage.setItem(COUNTRY_WEBHOOK_TIMER_STORAGE_KEY, String(countryWebhookTimerToggle.checked));
  syncCountryWebhookTimer();
  setMessage(countryWebhookTimerToggle.checked ? "Country enemy webhooks will send every 5 minutes." : "Country enemy webhooks disabled.");
});

autoRefreshToggle.addEventListener("change", () => {
  if (!autoRefreshToggle.checked) {
    stopAutoRefresh();
    setMessage("Auto-refresh disabled.");
    return;
  }
  if (!currentRequest) {
    autoRefreshToggle.checked = false;
    setMessage("Load a live faction first, then enable auto-refresh.");
    return;
  }

  syncAutoRefresh();
  setMessage("Auto-refresh enabled. Updating both factions every 10 seconds.");
  refreshLiveRoster(true);
});

showDemoData();
})();
