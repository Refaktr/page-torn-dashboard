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

function normalizeTextKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDestination(rawDestination) {
  const value = String(rawDestination ?? "").trim();
  const country = value.includes(":") ? value.split(":")[0] : value;
  return normalizeTextKey(country);
}

function formatMinutesCompact(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "?";
  }

  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return hours ? (mins ? `${hours}h ${mins}m` : `${hours}h`) : `${mins}m`;
}

function parseDestinationFromStatusDescription(statusDescription) {
  const text = String(statusDescription ?? "").trim();
  const returnMatch = text.match(/\bfrom\s+(.+?)\s+to\s+torn\b/i);
  const outboundMatch = text.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/i);

  if (returnMatch?.[1]) {
    return returnMatch[1].trim();
  }

  if (outboundMatch?.[2]) {
    return normalizeTextKey(outboundMatch[2]) === "torn" ? outboundMatch[1].trim() : outboundMatch[2].trim();
  }

  return "";
}

function formatPlaneTypeLabel(rawPlaneType) {
  const value = String(rawPlaneType ?? "").trim();
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown plane";
}

function resolveTravelProfile(rawAircraft) {
  const text = normalizeTextKey(rawAircraft);

  if (text.includes("light_aircraft") || text.includes("light aircraft") || text.includes("airstrip") || text.includes("private")) {
    return "airstrip";
  }

  if (text.includes("private_jet") || text.includes("private jet") || text.includes("wlt") || text.includes("wright") || text.includes("learjet")) {
    return "wlt";
  }

  return text.includes("business") ? "business" : "standard";
}

function getTravelInfo(member) {
  const travel = member?.travel || member?.status?.travel || null;
  const statusDescription = String(member?.status?.description ?? "");

  if (!travel && !normalizeTextKey(statusDescription).includes("travel")) {
    return null;
  }

  const rawDelay = travel?.watchlist_delay_minutes ?? travel?.watchlist_delay ?? travel?.delay_minutes ?? travel?.delay ?? 0;
  const delay = Number(rawDelay);

  return {
    destination: travel?.destination || travel?.country || travel?.location || travel?.city || parseDestinationFromStatusDescription(statusDescription),
    aircraft: travel?.aircraft || travel?.flight_class || travel?.type || travel?.method || member?.status?.plane_image_type || "standard",
    profile: resolveTravelProfile(travel?.aircraft || travel?.flight_class || travel?.type || travel?.method || member?.status?.plane_image_type || "standard"),
    watchlistDelayMinutes: Number.isFinite(delay) && delay > 0 ? delay : 0
  };
}

function getTravelEtaRange(info) {
  const destination = normalizeDestination(info?.destination);
  const base = destination ? FLIGHT_TIMES_BY_DESTINATION[destination]?.[info.profile] || FLIGHT_TIMES_BY_DESTINATION[destination]?.standard : null;

  if (!base) {
    return null;
  }

  return {
    min: Math.max(1, base * (1 - FLIGHT_VARIANCE_PERCENT)) + info.watchlistDelayMinutes,
    max: base * (1 + FLIGHT_VARIANCE_PERCENT) + info.watchlistDelayMinutes
  };
}

function formatTravelToastDetails(member) {
  const info = getTravelInfo(member);
  if (!info) {
    return "";
  }

  const route = info.destination || "Unknown destination";
  const range = getTravelEtaRange(info);
  if (!range) {
    return `Plane: ${formatPlaneTypeLabel(info.aircraft)} | Route: ${route}`;
  }

  const watchlistSuffix = info.watchlistDelayMinutes ? ` (+watchlist ${info.watchlistDelayMinutes}m)` : "";
  return `Plane: ${formatPlaneTypeLabel(info.aircraft)} | Route: ${route} | Landing ETA: ${formatMinutesCompact(range.min)} - ${formatMinutesCompact(range.max)}${watchlistSuffix}`;
}

window.FactionTravel = { formatTravelToastDetails };
