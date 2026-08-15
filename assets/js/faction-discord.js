(function () {
  const WEBHOOK_STORAGE_KEY = "discordWebhookUrl";
  const COUNTRY_SCOUT_WEBHOOK_STORAGE_KEY = "countryScoutWebhookUrl";
  const EMBED_COLOR = 0x46cc71;
  const TRAVEL_COUNTRIES = [
    "Mexico",
    "Cayman Islands",
    "Canada",
    "Hawaii",
    "United Kingdom",
    "Argentina",
    "Switzerland",
    "Japan",
    "China",
    "United Arab Emirates",
    "South Africa"
  ];

  function getSavedWebhookUrl(storageKey = WEBHOOK_STORAGE_KEY) {
    return sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey) || "";
  }

  function getProfileUrl(member) {
    return member?.id != null
      ? `https://www.torn.com/profiles.php?XID=${encodeURIComponent(member.id)}`
      : "";
  }

  function formatMember(member) {
    const profileUrl = getProfileUrl(member);
    const name = String(member?.name ?? "Unknown member");
    const level = member?.level != null ? `Level ${member.level}` : "Level unknown";
    const status = String(member?.status?.description ?? "Unknown status");
    return `${profileUrl ? `${profileUrl}\n` : ""}${level} | ${status}`;
  }

  function buildRevivablePayload(factionName, members) {
    const revivableMembers = (Array.isArray(members) ? members : []).filter((member) => member?.is_revivable);
    const fields = revivableMembers.length
      ? revivableMembers.slice(0, 25).map((member) => ({
          name: String(member?.name ?? "Unknown member"),
          value: formatMember(member),
          inline: true
        }))
      : [{
          name: "No revivable members",
          value: "No faction members are currently eligible for revival.",
          inline: false
        }];

    return {
      username: "Torn Dashboard",
      embeds: [{
        title: `${factionName || "Faction"} revivable members`,
        description: `${revivableMembers.length} member${revivableMembers.length === 1 ? "" : "s"} currently revivable.`,
        color: EMBED_COLOR,
        fields,
        footer: { text: "Torn Dashboard Faction Scout" },
        timestamp: new Date().toISOString()
      }],
      allowed_mentions: { parse: [] }
    };
  }

  function sendPayload(webhookUrl, payload) {
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(webhookUrl, blob)) {
        return Promise.resolve();
      }
    }

    return fetch(webhookUrl, {
      method: "POST",
      mode: "no-cors",
      body,
      keepalive: true
    });
  }

  async function sendRevivableMembers(factionName, members) {
    const webhookUrl = getSavedWebhookUrl();
    if (!webhookUrl) {
      throw new Error("No Discord webhook URL is saved. Add one in Settings first.");
    }

    await sendPayload(webhookUrl, buildRevivablePayload(factionName, members));
  }

  function buildFlightEventPayload(factionName, changes, fairFightScores) {
    const fields = changes.slice(0, 25).map((change) => {
      const member = change.member || {};
      const profileUrl = getProfileUrl(member);
      const name = String(change.name ?? member.name ?? "Unknown member");
      const travelDetails = window.FactionTravel.formatTravelToastDetails(member);
      const battleStats = fairFightScores?.[member?.id]?.bsEstimateHuman || "Unavailable";
      const details = `${profileUrl ? `${profileUrl}\n` : ""}${travelDetails || `Status: ${change.from} -> ${change.to}`}\nBattle stats: ${battleStats}`;

      return {
        name,
        value: details,
        inline: false
      };
    });

    return {
      username: "Torn Dashboard",
      embeds: [{
        title: `${factionName || "Faction"} flight events`,
        description: `${changes.length} travel status event${changes.length === 1 ? "" : "s"} detected.`,
        color: 0x4ea3ff,
        fields,
        footer: { text: "Torn Dashboard Faction Scout" },
        timestamp: new Date().toISOString()
      }],
      allowed_mentions: { parse: [] }
    };
  }

  async function sendFlightEvents(factionName, changes, fairFightScores) {
    const webhookUrl = getSavedWebhookUrl();
    if (!webhookUrl) {
      throw new Error("No Discord webhook URL is saved. Add one in Settings first.");
    }

    await sendPayload(webhookUrl, buildFlightEventPayload(factionName, changes, fairFightScores));
  }

  function parseBattleStatEstimate(value) {
    const normalized = String(value ?? "").toLowerCase().replaceAll(",", "").trim();
    const match = normalized.match(/(\d+(?:\.\d+)?)\s*([kmbt])?/);
    if (!match) {
      return null;
    }

    const multipliers = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
    const amount = Number(match[1]) * (multipliers[match[2]] || 1);
    return Number.isFinite(amount) ? amount : null;
  }

  function formatBattleStatTotal(value) {
    if (!Number.isFinite(value) || value <= 0) {
      return "Unavailable";
    }

    const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
    const unit = units.find(([threshold]) => value >= threshold);
    return unit ? `${(value / unit[0]).toFixed(value / unit[0] >= 100 ? 0 : 1)}${unit[1]}` : Math.round(value).toLocaleString();
  }

  function getCountryBattleStatTotal(countryMembers, fairFightScores) {
    const estimates = countryMembers
      .map(({ member }) => parseBattleStatEstimate(fairFightScores?.[member?.id]?.bsEstimateHuman))
      .filter((estimate) => estimate !== null);

    return estimates.length ? formatBattleStatTotal(estimates.reduce((total, estimate) => total + estimate, 0)) : "Unavailable";
  }

  function normalizeCountry(country) {
    return String(country ?? "").trim().toLowerCase();
  }

  function buildCountryEnemiesPayload(factionName, members, fairFightScores) {
    const byCountry = (Array.isArray(members) ? members : []).reduce((countries, member) => {
      const travel = window.FactionTravel.getTravelInfo(member);
      if (!travel?.destination) {
        return countries;
      }

      const country = String(travel.destination);
      countries[country] = countries[country] || [];
      countries[country].push({ member, travel });
      return countries;
    }, {});

    const knownCountries = new Map(TRAVEL_COUNTRIES.map((country) => [normalizeCountry(country), country]));
    const occupiedCountries = new Map(Object.entries(byCountry).map(([country, countryMembers]) => [normalizeCountry(country), { country, countryMembers }]));
    const countries = [
      ...TRAVEL_COUNTRIES.map((country) => ({ country, countryMembers: occupiedCountries.get(normalizeCountry(country))?.countryMembers || [] })),
      ...Array.from(occupiedCountries.entries())
        .filter(([country]) => !knownCountries.has(country))
        .map(([, entry]) => entry)
    ];

    const embeds = countries.map(({ country, countryMembers }) => {
      const occupied = countryMembers.length > 0;
      const battleStatTotal = occupied ? getCountryBattleStatTotal(countryMembers, fairFightScores) : null;
      return {
        title: occupied
          ? `${country} | ${countryMembers.length} enemy${countryMembers.length === 1 ? "" : " enemies"}`
          : `${country} | Clear`,
        description: occupied
          ? `Estimated total battle stats: **${battleStatTotal}**`
          : "No faction members detected in this country.",
        color: occupied ? 0xe74c3c : 0x46cc71,
        fields: occupied ? countryMembers.slice(0, 25).map(({ member, travel }) => ({
          name: String(member?.name ?? "Unknown member"),
          value: `${getProfileUrl(member) ? `${getProfileUrl(member)}\n` : ""}${travel.isFlying ? `Flying to ${country}` : `In ${country}`}\nLevel ${member?.level ?? "?"}\nBattle stats: ${fairFightScores?.[member?.id]?.bsEstimateHuman || "Unavailable"}`,
          inline: true
        })) : undefined,
        footer: { text: "Torn Dashboard Faction Scout" },
        timestamp: new Date().toISOString()
      };
    });

    return Array.from({ length: Math.ceil(embeds.length / 10) }, (_, index) => ({
      username: "Torn Dashboard",
      embeds: embeds.slice(index * 10, (index + 1) * 10),
      allowed_mentions: { parse: [] }
    }));
  }

  async function sendCountryEnemies(factionName, members, fairFightScores) {
    const webhookUrl = getSavedWebhookUrl(COUNTRY_SCOUT_WEBHOOK_STORAGE_KEY);
    if (!webhookUrl) {
      throw new Error("No Country Scout webhook URL is saved. Add one in Settings first.");
    }

    const payloads = buildCountryEnemiesPayload(factionName, members, fairFightScores);
    await Promise.all(payloads.map((payload) => sendPayload(webhookUrl, payload)));
  }

  window.FactionDiscord = { sendCountryEnemies, sendFlightEvents, sendRevivableMembers };
})();
