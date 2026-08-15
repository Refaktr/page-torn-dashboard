(function () {
  const WEBHOOK_STORAGE_KEY = "discordWebhookUrl";
  const EMBED_COLOR = 0x46cc71;

  function getSavedWebhookUrl() {
    return sessionStorage.getItem(WEBHOOK_STORAGE_KEY) || localStorage.getItem(WEBHOOK_STORAGE_KEY) || "";
  }

  function getProfileUrl(member) {
    return member?.id != null
      ? `https://www.torn.com/profiles.php?XID=${encodeURIComponent(member.id)}`
      : "";
  }

  function formatMember(member) {
    const profileUrl = getProfileUrl(member);
    const name = String(member?.name ?? "Unknown member");
    const linkedName = profileUrl ? `[${name}](${profileUrl})` : name;
    const level = member?.level != null ? `Level ${member.level}` : "Level unknown";
    const status = String(member?.status?.description ?? "Unknown status");
    return `${linkedName}\n${level} | ${status}`;
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

  window.FactionDiscord = { sendRevivableMembers };
})();
