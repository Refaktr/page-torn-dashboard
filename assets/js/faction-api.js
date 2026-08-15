function getSavedKey(storageKey) {
  const sessionKey = sessionStorage.getItem(storageKey);
  if (sessionKey) {
    return sessionKey;
  }

  return localStorage.getItem(storageKey) || "";
}

async function resolveFaction(factionName, apiKey) {
  const response = await fetch(`https://api.torn.com/v2/faction/search?name=${encodeURIComponent(factionName)}`, {
    headers: {
      Accept: "application/json",
      Authorization: `ApiKey ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Faction search failed (${response.status})`);
  }

  const data = await response.json();
  const faction = data?.search?.[0];

  if (!faction?.id) {
    throw new Error("No faction match found.");
  }

  return {
    id: faction.id,
    name: faction.name || factionName
  };
}

async function fetchFactionMembers(factionId, apiKey) {
  const response = await fetch(`https://api.torn.com/v2/faction/${factionId}/members`, {
    headers: {
      Accept: "application/json",
      Authorization: `ApiKey ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Member lookup failed (${response.status})`);
  }

  const data = await response.json();
  return Object.values(data?.members || {});
}

async function fetchFairFightScores(memberIds, apiKey) {
  if (!Array.isArray(memberIds) || !memberIds.length) {
    return {};
  }

  const targets = memberIds.join(",");
  const response = await fetch(`https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(apiKey)}&targets=${encodeURIComponent(targets)}`);

  if (!response.ok) {
    throw new Error(`Fair fight lookup failed (${response.status})`);
  }

  const data = await response.json();

  return (Array.isArray(data) ? data : []).reduce((scores, entry) => {
    if (entry?.player_id != null) {
      scores[entry.player_id] = {
        fairFight: typeof entry.fair_fight === "number" ? entry.fair_fight : null,
        bsEstimateHuman: entry.bs_estimate_human ?? null
      };
    }

    return scores;
  }, {});
}

window.FactionApi = {
  fetchFairFightScores,
  fetchFactionMembers,
  getSavedKey,
  resolveFaction
};
