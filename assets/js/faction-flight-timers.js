(function () {
  const STORAGE_KEY = "factionFlightTimers";
  const LOCATION_STORAGE_KEY = "factionLastKnownCountries";
  const observedFlightsByFaction = {};

  function readTimers() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveTimers(timers) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
    } catch (error) {
      console.warn("Unable to save flight timers", error);
    }
  }

  function readLocations() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveLocations(locations) {
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(locations));
    } catch (error) {
      console.warn("Unable to save last known countries", error);
    }
  }

  function flightKey(member) {
    return member?.id != null ? String(member.id) : "";
  }

  function getCurrentFlights(members) {
    return (Array.isArray(members) ? members : []).reduce((flights, member) => {
      const travel = window.FactionTravel.getTravelInfo(member);
      const memberId = flightKey(member);
      if (memberId && travel?.isFlying && !travel.isReturning) {
        flights[memberId] = travel;
      }
      return flights;
    }, {});
  }

  function reconcile(factionKey, members) {
    if (!factionKey) {
      return {};
    }

    const currentFlights = getCurrentFlights(members);
    const previousFlights = observedFlightsByFaction[factionKey];
    const timers = readTimers();
    const factionTimers = timers[factionKey] || {};
    const locations = readLocations();
    const factionLocations = locations[factionKey] || {};

    (Array.isArray(members) ? members : []).forEach((member) => {
      const memberId = flightKey(member);
      const travel = window.FactionTravel.getTravelInfo(member);
      const isHospitalized = String(member?.status?.state ?? "").toLowerCase() === "hospital" || /\bhospital/i.test(String(member?.status?.description ?? ""));
      if (memberId && travel?.destination && !travel.isFlying) {
        factionLocations[memberId] = { destination: travel.destination, observedAt: Date.now() };
      } else if (memberId && !travel && !isHospitalized) {
        delete factionLocations[memberId];
      }
    });

    if (previousFlights) {
      Object.entries(currentFlights).forEach(([memberId, travel]) => {
        const previousFlight = previousFlights[memberId];
        const hasNewFlight = !previousFlight || previousFlight.destination !== travel.destination;
        const minimumMinutes = window.FactionTravel.getMinimumTravelMinutes(travel);

        if (hasNewFlight && Number.isFinite(minimumMinutes)) {
          factionTimers[memberId] = {
            destination: travel.destination,
            earliestArrivalAt: Date.now() + (minimumMinutes * 60000)
          };
        }
      });
    }

    Object.entries(factionTimers).forEach(([memberId, timer]) => {
      const flight = currentFlights[memberId];
      if (!flight || flight.destination !== timer.destination) {
        delete factionTimers[memberId];
      }
    });

    timers[factionKey] = factionTimers;
    saveTimers(timers);
    locations[factionKey] = factionLocations;
    saveLocations(locations);
    observedFlightsByFaction[factionKey] = currentFlights;
    return { ...factionTimers };
  }

  function getTimers(factionKey) {
    return { ...(readTimers()[factionKey] || {}) };
  }

  function getLocations(factionKey) {
    return { ...(readLocations()[factionKey] || {}) };
  }

  function clearFaction(factionKey) {
    const timers = readTimers();
    delete timers[factionKey];
    saveTimers(timers);
    const locations = readLocations();
    delete locations[factionKey];
    saveLocations(locations);
    delete observedFlightsByFaction[factionKey];
  }

  window.FactionFlightTimers = { clearFaction, getLocations, getTimers, reconcile };
})();
