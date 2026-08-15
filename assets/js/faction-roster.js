const STATUS_CLASS_MAP = {
  green: "status-green",
  red: "status-red",
  blue: "status-blue",
  orange: "status-orange",
  yellow: "status-yellow"
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

  const multipliers = { minute: 1, minutes: 1, hour: 60, hours: 60, day: 1440, days: 1440, week: 10080, weeks: 10080, month: 43200, months: 43200, year: 525600, years: 525600 };
  return Number(match[1]) * (multipliers[match[2].toLowerCase()] || 1);
}

function createRoster(memberBody, sortButtons) {
  let members = [];
  let fairFightMap = {};
  let sortState = { key: null, direction: "asc" };

  function getSortValue(member, key) {
    switch (key) {
      case "name": return String(member?.name ?? "").toLowerCase();
      case "level": return Number(member?.level ?? 0);
      case "position": return String(member?.position ?? "").toLowerCase();
      case "status": return String(member?.status?.description ?? "").toLowerCase();
      case "revive": return member?.is_revivable ? 1 : 0;
      case "lastAction": {
        const relative = String(member?.last_action?.relative ?? "");
        const minutes = parseRelativeTimeToMinutes(relative);
        return Number.isNaN(minutes) ? relative.toLowerCase() : minutes;
      }
      case "fairFight": return typeof fairFightMap[member?.id]?.fairFight === "number" ? fairFightMap[member.id].fairFight : -1;
      default: return "";
    }
  }

  function getSortedMembers() {
    if (!sortState.key) {
      return [...members];
    }

    return [...members].sort((first, second) => {
      const firstValue = getSortValue(first, sortState.key);
      const secondValue = getSortValue(second, sortState.key);
      const comparison = typeof firstValue === "number" && typeof secondValue === "number"
        ? firstValue - secondValue
        : String(firstValue).localeCompare(String(secondValue));
      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }

  function formatFairFight(member) {
    const score = fairFightMap[member?.id];
    if (!score || (score.fairFight == null && !score.bsEstimateHuman)) {
      return "";
    }

    return `${typeof score.fairFight === "number" ? score.fairFight.toFixed(2) : "?"} (${score.bsEstimateHuman || "?"})`;
  }

  function render() {
    const sortedMembers = getSortedMembers();
    if (!sortedMembers.length) {
      memberBody.innerHTML = '<tr class="empty-row"><td colspan="8">No members found.</td></tr>';
      return;
    }

    memberBody.innerHTML = sortedMembers.map((member) => {
      const status = member.status || {};
      const memberId = member?.id ?? "";
      const memberName = escapeHtml(member.name ?? "");
      const profileUrl = `https://www.torn.com/profiles.php?XID=${encodeURIComponent(memberId)}`;
      const attackUrl = `https://www.torn.com/page.php?sid=attack&user2ID=${encodeURIComponent(memberId)}`;
      const name = memberId ? `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer" class="member-profile-link">${memberName}</a>` : memberName;
      const attack = memberId ? `<a href="${attackUrl}" target="_blank" rel="noopener noreferrer" class="attack-action">ATTACK</a>` : "";
      const revive = member.is_revivable ? '<span class="revive-badge revive-yes">Yes</span>' : "";

      return `<tr>
        <td>${name}</td>
        <td>${escapeHtml(member.level ?? "")}</td>
        <td>${escapeHtml(member.position ?? "")}</td>
        <td><span class="status-badge ${STATUS_CLASS_MAP[status.color] || "status-default"}">${escapeHtml(status.description ?? "")}</span></td>
        <td>${revive}</td>
        <td>${escapeHtml(member.last_action?.relative ?? "")}</td>
        <td><span class="fair-fight-score">${escapeHtml(formatFairFight(member))}</span></td>
        <td>${attack}</td>
      </tr>`;
    }).join("");
  }

  function updateSortIndicators() {
    sortButtons.forEach((button) => {
      const key = button.dataset.sortKey;
      const active = key === sortState.key;
      const direction = active ? sortState.direction : "none";
      button.dataset.direction = direction;
      button.setAttribute("aria-label", active ? `${SORT_LABELS[key] || key}, sorted ${direction}. Click to toggle order.` : `${SORT_LABELS[key] || key}, not sorted. Click to sort ascending.`);
      button.closest("th")?.setAttribute("aria-sort", active ? (direction === "asc" ? "ascending" : "descending") : "none");
    });
  }

  sortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sortKey;
      if (!key) {
        return;
      }

      sortState = sortState.key === key
        ? { key, direction: sortState.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" };
      updateSortIndicators();
      render();
    });
  });

  updateSortIndicators();

  return {
    getMembers: () => [...members],
    setMembers(nextMembers) {
      members = Array.isArray(nextMembers) ? [...nextMembers] : [];
      render();
    },
    clearFairFightScores() {
      fairFightMap = {};
    },
    setFairFightScores(scores) {
      fairFightMap = scores || {};
      render();
    }
  };
}

window.FactionRoster = { createRoster };
