(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const svgNS = "http://www.w3.org/2000/svg";

  const menuButton = $(".menu-toggle");
  const navigation = $(".site-nav");
  const header = $("[data-header]");
  let previousScroll = window.scrollY;

  if (menuButton && navigation) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      navigation.classList.toggle("is-open", !open);
      document.body.style.overflow = open ? "" : "hidden";
    });

    $$("a", navigation).forEach((link) => {
      link.addEventListener("click", () => {
        menuButton.setAttribute("aria-expanded", "false");
        navigation.classList.remove("is-open");
        document.body.style.overflow = "";
      });
    });
  }

  window.addEventListener(
    "scroll",
    () => {
      const current = window.scrollY;
      const movingDown = current > previousScroll && current > 180;
      header?.classList.toggle("is-hidden", movingDown && !navigation?.classList.contains("is-open"));
      previousScroll = current;
    },
    { passive: true }
  );

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px" }
  );
  $$(".reveal").forEach((item) => revealObserver.observe(item));

  const video = $(".video-shell video");
  const videoShell = $(".video-shell");
  const videoDuration = $("[data-video-duration]");
  if (video) {
    video.addEventListener("loadedmetadata", () => {
      videoShell?.classList.add("has-video");
      if (videoDuration) {
        const seconds = Math.round(video.duration);
        const minutes = Math.floor(seconds / 60);
        videoDuration.textContent = `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
      }
    });
    video.addEventListener("error", () => videoShell?.classList.remove("has-video"));
  }

  const trackImage = $("[data-track-image]");
  if (trackImage) {
    trackImage.addEventListener("error", () => {
      trackImage.style.display = "none";
    });
  }

  const simulator = $("[data-simulator]");
  if (!simulator) return;

  const sensorLayer = $("[data-sensor-layer]", simulator);
  const destinationLayer = $("[data-destination-layer]", simulator);
  const destinationKey = $("[data-destination-key]", simulator);
  const clockElement = $("[data-clock]", simulator);
  const systemStateElement = $("[data-system-state]", simulator);
  const latestEventElement = $("[data-latest-event]", simulator);
  const terminalLog = $("[data-terminal-log]", simulator);
  const terminalForm = $("[data-terminal-form]", simulator);
  const terminalInput = $("[data-terminal-input]", simulator);
  const runButton = $('[data-action="run"]', simulator);
  const pauseButton = $('[data-action="pause"]', simulator);
  const commandEcho = $("[data-command-echo]", simulator);
  let commandEchoTimer;

  const fallbackRoutes = [
    { id: "left-inner", pathId: "route-left-inner", label: "LEFT INNER", totalMm: 1, sensors: [] },
    { id: "right-inner", pathId: "route-right-inner", label: "RIGHT INNER", totalMm: 1, sensors: [] },
    { id: "outer", pathId: "route-outer", label: "MAIN CIRCUIT", totalMm: 1, sensors: [] },
  ];
  const routeDefinitions = window.CS452_TRACK_MODEL?.routes || fallbackRoutes;
  const routes = Object.fromEntries(
    routeDefinitions.map((definition) => {
      const element = $(`#${definition.pathId}`, simulator);
      return [
        definition.id,
        {
          ...definition,
          element,
          length: element.getTotalLength(),
          sensors: definition.sensors.map((sensor) => ({
            ...sensor,
            at: sensor.mm / definition.totalMm,
            pair: `${sensor.forward}/${sensor.reverse}`,
          })),
        },
      ];
    })
  );
  const destinationDefinitions = window.CS452_TRACK_MODEL?.destinations || [];
  const destinations = Object.fromEntries(
    destinationDefinitions.map((definition) => {
      const route = routes[definition.routeId];
      return [
        definition.id,
        {
          ...definition,
          progress: definition.mm / route.totalMm,
        },
      ];
    })
  );
  const validSegments = new Map([
    ["LEFT-INNER", "left inner route"],
    ["RIGHT-INNER", "right inner route"],
    ["MAIN-CIRCUIT", "main circuit"],
    ["INTERLOCK", "central interlock"],
  ]);

  const routeSegments = Object.freeze({
    outer: ["MAIN-CIRCUIT"],
    "left-inner": ["LEFT-INNER", "INTERLOCK"],
    "right-inner": ["RIGHT-INNER", "INTERLOCK"],
  });

  const trains = {
    14: {
      id: 14,
      routeId: "left-inner",
      progress: 0.12,
      speed: 80,
      direction: 1,
      status: "READY",
      sensor: "—",
      route: "LEFT INNER",
      destinationId: null,
      targetProgress: null,
      visible: true,
      lastSensorIndex: 1,
      element: $('[data-train="14"]', simulator),
      card: $('[data-train-card="14"]', simulator),
    },
    15: {
      id: 15,
      routeId: "right-inner",
      progress: 0.56,
      speed: 60,
      direction: 1,
      status: "READY",
      sensor: "—",
      route: "RIGHT INNER",
      destinationId: null,
      targetProgress: null,
      visible: true,
      lastSensorIndex: 7,
      element: $('[data-train="15"]', simulator),
      card: $('[data-train-card="15"]', simulator),
    },
  };

  const state = {
    running: false,
    elapsed: 0,
    lastFrame: performance.now(),
    scenario: "free",
    switches: { 153: "S", 154: "C", 155: "S", 156: "C" },
    nextSwitchAt: 3.4,
    conflictLatched: false,
    trafficHoldTrainId: null,
    holdAcknowledged: false,
    blockedSegments: new Set(),
  };

  function drawSensors() {
    Object.values(routes).forEach((route) => {
      route.sensors.forEach((sensor, index) => {
        const point = route.element.getPointAtLength(sensor.at * route.length);
        const group = document.createElementNS(svgNS, "g");
        group.dataset.sensorIndex = String(index);
        group.dataset.routeId = route.id;

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", point.x);
        circle.setAttribute("cy", point.y);
        circle.setAttribute("r", "4.5");

        const label = document.createElementNS(svgNS, "text");
        const fromCenterX = point.x - 600;
        const fromCenterY = point.y - 350;
        const magnitude = Math.hypot(fromCenterX, fromCenterY) || 1;
        const offsetX = (fromCenterX / magnitude) * 14;
        const offsetY = (fromCenterY / magnitude) * 14;
        label.setAttribute("x", point.x + offsetX);
        label.setAttribute("y", point.y + offsetY + 3);
        label.setAttribute("text-anchor", offsetX > 4 ? "start" : offsetX < -4 ? "end" : "middle");
        label.textContent = sensor.pair;

        group.append(circle, label);
        sensorLayer.append(group);
      });
    });
  }

  function drawDestinations() {
    if (!destinationLayer || !destinationKey) return;
    destinationLayer.replaceChildren();
    destinationKey.replaceChildren();

    Object.values(destinations).forEach((destination) => {
      const route = routes[destination.routeId];
      const point = route.element.getPointAtLength(destination.progress * route.length);
      const fromCenterX = point.x - 600;
      const fromCenterY = point.y - 350;
      const magnitude = Math.hypot(fromCenterX, fromCenterY) || 1;
      const offsetX = (fromCenterX / magnitude) * 22;
      const offsetY = (fromCenterY / magnitude) * 22;

      const group = document.createElementNS(svgNS, "g");
      group.classList.add("destination-marker");
      group.dataset.destinationId = destination.id;

      const title = document.createElementNS(svgNS, "title");
      title.textContent = `${destination.id} — ${destination.label}`;

      const marker = document.createElementNS(svgNS, "path");
      marker.setAttribute(
        "d",
        `M${point.x} ${point.y - 9}L${point.x + 8} ${point.y}L${point.x} ${point.y + 9}L${point.x - 8} ${point.y}Z`
      );

      const label = document.createElementNS(svgNS, "text");
      label.setAttribute("x", point.x + offsetX);
      label.setAttribute("y", point.y + offsetY + 3);
      label.setAttribute("text-anchor", offsetX > 4 ? "start" : offsetX < -4 ? "end" : "middle");
      label.textContent = `DEST ${destination.id}`;

      group.append(title, marker, label);
      destinationLayer.append(group);

      const button = document.createElement("button");
      button.type = "button";
      button.title = `Fill a Train 14 command for ${destination.id}`;
      button.innerHTML = `<b>${destination.id}</b><span>${destination.label}</span>`;
      button.addEventListener("click", () => {
        terminalInput.value = `dispatch 14 CURRENT 80 ${destination.id.toLowerCase()}`;
        terminalInput.focus();
      });
      destinationKey.append(button);
    });
  }

  function syncDestinationHighlights() {
    $$(".destination-marker", destinationLayer).forEach((marker) => {
      marker.classList.remove("is-target-14", "is-target-15");
    });
    Object.values(trains).forEach((train) => {
      if (!train.visible || !train.destinationId) return;
      const marker = $(`[data-destination-id="${train.destinationId}"]`, destinationLayer);
      marker?.classList.add(`is-target-${train.id}`);
    });
  }

  function routeFor(train) {
    return routes[train.routeId];
  }

  function syncNearestSensor(train) {
    const route = routeFor(train);
    if (!route?.sensors.length) {
      train.sensor = "—";
      train.lastSensorIndex = -1;
      return;
    }
    let closestIndex = 0;
    let closestDistance = Infinity;
    route.sensors.forEach((sensor, index) => {
      const raw = Math.abs(sensor.at - train.progress);
      const distance = Math.min(raw, 1 - raw);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    train.lastSensorIndex = closestIndex;
    const sensor = route.sensors[closestIndex];
    train.sensor = train.direction === 1 ? sensor.forward : sensor.reverse;
  }

  function assignRoute(train, routeId, progress) {
    train.routeId = routeId;
    train.route = routes[routeId].label;
    train.progress = ((progress % 1) + 1) % 1;
    syncNearestSensor(train);
  }

  function timeString() {
    const minutes = Math.floor(state.elapsed / 60);
    const seconds = state.elapsed % 60;
    return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
  }

  function appendLogRow(row, latestText) {
    terminalLog.append(row);
    terminalLog.scrollTop = terminalLog.scrollHeight;
    latestEventElement.textContent = latestText;

    while (terminalLog.children.length > 40) {
      terminalLog.firstElementChild.remove();
    }

    return row;
  }

  function log(message, type = "system", label) {
    const row = document.createElement("p");
    const time = document.createElement("time");
    const tag = document.createElement("span");
    const text = document.createElement("span");
    const labels = {
      system: "SYS",
      note: "NOTE",
      alert: "HOLD",
      command: "CMD",
    };

    time.textContent = timeString();
    tag.className = `log-${type}`;
    tag.textContent = label || labels[type] || "SYS";
    text.textContent = message;
    row.append(time, tag, text);
    return appendLogRow(row, message);
  }

  function logHelp(syntax, meaning, example, label = "HELP") {
    const row = document.createElement("p");
    const time = document.createElement("time");
    const tag = document.createElement("span");
    const body = document.createElement("span");
    const command = document.createElement("strong");
    const description = document.createElement("span");
    const exampleLine = document.createElement("span");
    const exampleLabel = document.createElement("b");

    row.className = "terminal-help-row";
    time.textContent = timeString();
    tag.className = "log-note";
    tag.textContent = label;
    body.className = "terminal-help-body";
    command.className = "terminal-help-command";
    command.textContent = syntax;
    description.className = "terminal-help-meaning";
    description.textContent = meaning;
    exampleLine.className = "terminal-help-example";
    exampleLabel.textContent = "EXAMPLE";
    exampleLine.append(exampleLabel, document.createTextNode(`  ${example}`));
    body.append(command, description, exampleLine);
    row.append(time, tag, body);

    return appendLogRow(row, `${syntax} — ${meaning}`);
  }

  function setSystemState(label, alert = false) {
    systemStateElement.textContent = label;
    systemStateElement.dataset.alert = String(alert);
  }

  function showCommandOnTrack(message, trainId) {
    if (!commandEcho) return;
    const output = $("strong", commandEcho);
    if (output) output.textContent = message;
    commandEcho.classList.remove("is-live");
    void commandEcho.offsetWidth;
    commandEcho.classList.add("is-live");
    window.clearTimeout(commandEchoTimer);
    commandEchoTimer = window.setTimeout(() => commandEcho.classList.remove("is-live"), 1200);

    if (trainId && trains[trainId]) {
      trains[trainId].element.classList.remove("is-commanded");
      void trains[trainId].element.getBoundingClientRect();
      trains[trainId].element.classList.add("is-commanded");
      window.setTimeout(() => trains[trainId].element.classList.remove("is-commanded"), 900);
    }
  }

  function setScenario(name, shouldLog = true) {
    state.scenario = name;
    state.running = false;
    state.elapsed = 0;
    state.nextSwitchAt = 3.4;
    state.conflictLatched = false;
    state.trafficHoldTrainId = null;
    state.holdAcknowledged = false;
    simulator.classList.remove("is-running");

    Object.values(trains).forEach((train) => {
      train.visible = true;
      train.status = "READY";
      train.destinationId = null;
      train.targetProgress = null;
      train.element.classList.remove("is-removed", "is-waiting");
      train.card.classList.remove("is-removed");
    });

    if (name === "follow") {
      assignRoute(trains[14], "outer", 0.31);
      trains[14].speed = 55;
      trains[14].direction = 1;
      assignRoute(trains[15], "outer", 0.18);
      trains[15].speed = 95;
      trains[15].direction = 1;
    } else if (name === "opposing") {
      assignRoute(trains[14], "left-inner", 0.18);
      trains[14].speed = 75;
      trains[14].direction = 1;
      assignRoute(trains[15], "left-inner", 0.47);
      trains[15].speed = 70;
      trains[15].direction = -1;
    } else {
      assignRoute(trains[14], "left-inner", 0.12);
      trains[14].speed = 80;
      trains[14].direction = 1;
      assignRoute(trains[15], "right-inner", 0.56);
      trains[15].speed = 60;
      trains[15].direction = 1;
    }

    Object.values(trains).forEach((train) => {
      if (firstBlockedSegment(train.routeId)) train.status = "BLOCK HOLD";
      syncNearestSensor(train);
    });

    $$(".scenario-control button", simulator).forEach((button) => {
      button.classList.toggle("is-active", button.dataset.scenario === name);
    });

    runButton.innerHTML = 'Run trains <span>▶</span>';
    setSystemState(
      Object.values(trains).some((train) => train.status === "BLOCK HOLD") ? "ROUTE BLOCKED" : "READY",
      Object.values(trains).some((train) => train.status === "BLOCK HOLD")
    );
    render();
    if (shouldLog) {
      const scenarioLabel = {
        free: "Free-running scenario loaded.",
        follow: "Same-direction conflict scenario loaded.",
        opposing: "Opposing-risk scenario loaded.",
      }[name];
      log(scenarioLabel, "note");
      showCommandOnTrack(`${name.toUpperCase()} SCENARIO LOADED`);
    }
  }

  function updateTrainCard(train) {
    if (!train.card) return;
    const setField = (name, value) => {
      const field = `[data-field="${name}"]`;
      const element = $(field, train.card);
      if (element) element.textContent = value;
    };
    const status = train.visible ? train.status : "REMOVED";
    const statusElement = $('[data-field="status"]', train.card);
    setField("status", status);
    statusElement.dataset.status = status;
    setField("speed", String(train.speed).padStart(3, "0"));
    setField("direction", train.direction === 1 ? "FORWARD →" : "REVERSE ←");
    setField("sensor", train.sensor);
    setField("route", train.route);
    setField("destination", train.destinationId || "NONE");
    const bar = $('[data-field="speed-bar"]', train.card);
    bar.style.width = `${Math.max(0, Math.min(100, (train.speed / 120) * 100))}%`;
    train.card.classList.toggle("is-removed", !train.visible);
  }

  function renderTrain(train) {
    const route = routeFor(train);
    const normalized = ((train.progress % 1) + 1) % 1;
    const distance = normalized * route.length;
    const point = route.element.getPointAtLength(distance);
    const lookDistance = ((distance + train.direction * 4 + route.length) % route.length);
    const look = route.element.getPointAtLength(lookDistance);
    let angle = Math.atan2(look.y - point.y, look.x - point.x) * (180 / Math.PI);
    if (train.direction < 0) angle += 180;
    train.element.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${angle})`);
    train.element.classList.toggle("is-removed", !train.visible);
    train.element.classList.toggle(
      "is-waiting",
      train.status === "WAITING" ||
        train.status === "OPERATOR HOLD" ||
        train.status === "TRAFFIC HOLD" ||
        train.status === "BLOCK HOLD"
    );
    updateTrainCard(train);
  }

  function updateSensor(train) {
    if (!train.visible) return;
    const route = routeFor(train);
    if (!route?.sensors.length) return;
    let closestIndex = 0;
    let closestDistance = Infinity;
    route.sensors.forEach((sensor, index) => {
      const raw = Math.abs(sensor.at - train.progress);
      const circular = Math.min(raw, 1 - raw);
      if (circular < closestDistance) {
        closestIndex = index;
        closestDistance = circular;
      }
    });

    if (closestIndex !== train.lastSensorIndex && closestDistance < 0.018) {
      train.lastSensorIndex = closestIndex;
      const sensor = route.sensors[closestIndex];
      train.sensor = train.direction === 1 ? sensor.forward : sensor.reverse;
      const sensorCircle = $(
        `[data-route-id="${route.id}"][data-sensor-index="${closestIndex}"] circle`,
        sensorLayer
      );
      sensorCircle?.classList.add("is-active");
      window.setTimeout(() => sensorCircle?.classList.remove("is-active"), 520);
      log(`${train.sensor} attributed to train ${train.id} in the browser model.`, "note", "SNSR");
    }
  }

  function toggleSwitch(id, nextState, reason = "operator command") {
    if (!(id in state.switches)) return false;
    const value = nextState || (state.switches[id] === "S" ? "C" : "S");

    const pairedTurnout = { 153: 154, 154: 153, 155: 156, 156: 155 }[id];
    if (value === "C" && state.switches[pairedTurnout] === "C") {
      state.switches[pairedTurnout] = "S";
      const pairedOutput = $(`[data-switch-state="${pairedTurnout}"]`, simulator);
      if (pairedOutput) pairedOutput.textContent = "STRAIGHT";
      $(`[data-turnout="${pairedTurnout}"]`, simulator)?.classList.remove("is-curved");
      log(
        `SW ${pairedTurnout} set straight — paired interlock before SW ${id} curved.`,
        "system",
        "SAFE"
      );
    }

    state.switches[id] = value;
    const label = value === "S" ? "STRAIGHT" : "CURVED";
    const output = `[data-switch-state="${id}"]`;
    const turnout = `[data-turnout="${id}"]`;
    const outputElement = $(output, simulator);
    const turnoutElement = $(turnout, simulator);
    if (outputElement) outputElement.textContent = label;
    turnoutElement?.classList.toggle("is-curved", value === "C");
    log(`SW ${String(id).padStart(2, "0")} set ${label.toLowerCase()} — ${reason}.`, "system", "SW");
    return true;
  }

  function runAutomaticTurnout() {
    if (state.elapsed < state.nextSwitchAt) return;
    const turnoutOrder = [153, 154, 155, 156];
    const id = turnoutOrder[Math.floor(state.elapsed / 3.4) % turnoutOrder.length];
    const nearest = Object.values(trains)
      .filter((train) => train.visible)
      .sort((a, b) => a.progress - b.progress)[0];
    toggleSwitch(id, undefined, `selected before train ${nearest?.id || "—"} arrival`);
    state.nextSwitchAt += 4.2;
  }

  const HOLD_DISTANCE_PX = 78;
  const RELEASE_DISTANCE_PX = 170;
  const HEAD_ON_DISTANCE_PX = 94;
  const LANE_TOLERANCE_PX = 16;

  function wrapProgress(progress) {
    return ((progress % 1) + 1) % 1;
  }

  function directedProgressGap(fromProgress, toProgress, direction) {
    return direction === 1
      ? wrapProgress(toProgress - fromProgress)
      : wrapProgress(fromProgress - toProgress);
  }

  function poseFor(train) {
    const route = routeFor(train);
    const distance = wrapProgress(train.progress) * route.length;
    const point = route.element.getPointAtLength(distance);
    const lookDistance = wrapProgress((distance + train.direction * 5) / route.length) * route.length;
    const look = route.element.getPointAtLength(lookDistance);
    const magnitude = Math.hypot(look.x - point.x, look.y - point.y) || 1;
    return {
      point,
      direction: { x: (look.x - point.x) / magnitude, y: (look.y - point.y) / magnitude },
    };
  }

  function sameRouteFollowingRisk(first, second, threshold) {
    if (first.routeId !== second.routeId || first.direction !== second.direction) return null;
    const route = routeFor(first);
    const firstToSecond = directedProgressGap(first.progress, second.progress, first.direction) * route.length;
    const secondToFirst = directedProgressGap(second.progress, first.progress, second.direction) * route.length;
    const tie = Math.abs(firstToSecond - secondToFirst) < 0.5;
    const firstTrails = tie ? first.speed >= second.speed : firstToSecond < secondToFirst;
    const distance = Math.min(firstToSecond, secondToFirst);
    if (distance > threshold) return null;
    return {
      trailing: firstTrails ? first : second,
      leading: firstTrails ? second : first,
      distance,
    };
  }

  function localFollowingRisk(first, second, threshold) {
    const firstPose = poseFor(first);
    const secondPose = poseFor(second);
    const alignment = firstPose.direction.x * secondPose.direction.x + firstPose.direction.y * secondPose.direction.y;
    if (alignment < 0.72) return null;
    const delta = {
      x: secondPose.point.x - firstPose.point.x,
      y: secondPose.point.y - firstPose.point.y,
    };
    const longitudinal = delta.x * firstPose.direction.x + delta.y * firstPose.direction.y;
    const lateral = Math.abs(delta.x * firstPose.direction.y - delta.y * firstPose.direction.x);
    if (lateral > LANE_TOLERANCE_PX || Math.abs(longitudinal) > threshold) return null;
    const firstTrails = Math.abs(longitudinal) < 1 ? first.speed >= second.speed : longitudinal > 0;
    return {
      trailing: firstTrails ? first : second,
      leading: firstTrails ? second : first,
      distance: Math.abs(longitudinal),
    };
  }

  function followingRisk(first, second, threshold) {
    return sameRouteFollowingRisk(first, second, threshold) || localFollowingRisk(first, second, threshold);
  }

  function headOnRisk(first, second, threshold = HEAD_ON_DISTANCE_PX) {
    const firstPose = poseFor(first);
    const secondPose = poseFor(second);
    const alignment = firstPose.direction.x * secondPose.direction.x + firstPose.direction.y * secondPose.direction.y;
    if (alignment >= -0.72) return false;
    if (first.routeId === second.routeId) {
      const route = routeFor(first);
      const raw = Math.abs(first.progress - second.progress);
      if (Math.min(raw, 1 - raw) * route.length <= threshold) return true;
    }
    const delta = {
      x: secondPose.point.x - firstPose.point.x,
      y: secondPose.point.y - firstPose.point.y,
    };
    const longitudinal = delta.x * firstPose.direction.x + delta.y * firstPose.direction.y;
    const lateral = Math.abs(delta.x * firstPose.direction.y - delta.y * firstPose.direction.x);
    return alignment < -0.72 && lateral <= LANE_TOLERANCE_PX && Math.abs(longitudinal) <= threshold;
  }

  function restoreProgress(train, previousPositions) {
    if (previousPositions?.has(train.id)) train.progress = previousPositions.get(train.id);
  }

  function releaseTrafficHold() {
    if (!state.trafficHoldTrainId) return;
    const train = trains[state.trafficHoldTrainId];
    if (train?.status === "TRAFFIC HOLD") {
      train.status = resumeStatus(train);
      log(
        train.status === "BLOCK HOLD"
          ? `Traffic hold cleared for train ${train.id}; its route block remains active.`
          : `Movement authority restored; train ${train.id} ${state.running ? "resumes" : "is ready"}.`,
        "system",
        "AUTH"
      );
    }
    state.trafficHoldTrainId = null;
  }

  function setTrafficHold(risk, previousPositions, message) {
    if (!risk || risk.trailing.status === "ARRIVED") return false;
    restoreProgress(risk.trailing, previousPositions);
    if (state.trafficHoldTrainId && state.trafficHoldTrainId !== risk.trailing.id) {
      releaseTrafficHold();
    }
    state.trafficHoldTrainId = risk.trailing.id;
    if (risk.trailing.status !== "TRAFFIC HOLD") {
      risk.trailing.status = "TRAFFIC HOLD";
      log(message || `Same-direction authority narrowed; trailing train ${risk.trailing.id} is waiting.`, "alert");
    }
    setSystemState("FOLLOWING HOLD", true);
    return true;
  }

  function evaluateConflict(previousPositions) {
    const first = trains[14];
    const second = trains[15];
    if (!first.visible || !second.visible) {
      releaseTrafficHold();
      const active = [first, second].find((train) => train.visible);
      const blockedSegment = active ? firstBlockedSegment(active.routeId) : null;
      if (active && blockedSegment && active.status !== "ARRIVED") active.status = "BLOCK HOLD";
      setSystemState(blockedSegment ? `${blockedSegment} BLOCKED` : active ? "NOMINAL" : "NO ACTIVE TRAINS", Boolean(blockedSegment));
      return;
    }

    if (headOnRisk(first, second)) {
      restoreProgress(first, previousPositions);
      restoreProgress(second, previousPositions);
      const moving = [first, second].filter((train) => train.status !== "ARRIVED");
      if (moving.length === 1) {
        setTrafficHold(
          { trailing: moving[0], leading: moving[0] === first ? second : first },
          previousPositions,
          `Destination is occupied; train ${moving[0].id} is waiting for movement authority.`
        );
        return;
      }
      releaseTrafficHold();
      if (!state.conflictLatched) {
        log("Opposing movement detected. Both trains stopped for operator recovery.", "alert");
      }
      state.conflictLatched = true;
      first.status = "OPERATOR HOLD";
      second.status = "OPERATOR HOLD";
      setSystemState("HEAD-ON HOLD", true);
      return;
    }

    if (state.conflictLatched) {
      [first, second].forEach((train) => {
        if (train.visible && train.status !== "ARRIVED") train.status = "OPERATOR HOLD";
      });
      setSystemState("HEAD-ON HOLD", true);
      return;
    }

    const releaseRisk = followingRisk(first, second, RELEASE_DISTANCE_PX);
    if (state.trafficHoldTrainId) {
      if (releaseRisk?.trailing.id === state.trafficHoldTrainId) {
        restoreProgress(releaseRisk.trailing, previousPositions);
        setSystemState("FOLLOWING HOLD", true);
        return;
      }
      releaseTrafficHold();
    }

    const holdRisk = followingRisk(first, second, HOLD_DISTANCE_PX);
    if (holdRisk && setTrafficHold(holdRisk, previousPositions)) return;

    if ([first, second].some((train) => train.status === "ARRIVED")) {
      setSystemState("DESTINATION OCCUPIED");
    } else {
      setSystemState(state.scenario === "opposing" ? "MONITORING" : "NOMINAL");
    }
  }

  function shouldMove(train) {
    return (
      state.running &&
      train.visible &&
      train.speed > 0 &&
      !state.conflictLatched &&
      !firstBlockedSegment(train.routeId) &&
      ["RUNNING", "REROUTED"].includes(train.status)
    );
  }

  function nextTrainPosition(train, delta) {
    const normalizedSpeed = train.speed / 120;
    const step = delta * normalizedSpeed * 0.055;
    if (train.targetProgress != null) {
      const remaining = directedProgressGap(train.progress, train.targetProgress, train.direction);
      if (remaining <= step + 0.000001) {
        return { progress: train.targetProgress, arrived: true };
      }
    }
    return { progress: wrapProgress(train.progress + train.direction * step), arrived: false };
  }

  function arriveTrain(train) {
    if (train.status === "ARRIVED") return;
    train.progress = train.targetProgress;
    train.speed = 0;
    train.status = "ARRIVED";
    log(
      `Train ${train.id} arrived at ${train.destinationId} (${destinations[train.destinationId].anchorSensor}) and stopped.`,
      "system",
      "ARRIVE"
    );
    showCommandOnTrack(`T${train.id} ARRIVED · ${train.destinationId}`, train.id);
  }

  function render() {
    Object.values(trains).forEach(renderTrain);
    syncDestinationHighlights();
    clockElement.textContent = timeString();
  }

  function tick(now) {
    const delta = Math.min((now - state.lastFrame) / 1000, 0.08);
    state.lastFrame = now;

    if (state.running) {
      state.elapsed += delta;
      evaluateConflict();
      const previousPositions = new Map();
      const proposedArrivals = new Set();
      Object.values(trains).forEach((train) => {
        if (!shouldMove(train)) return;
        previousPositions.set(train.id, train.progress);
        const next = nextTrainPosition(train, delta);
        train.progress = next.progress;
        if (next.arrived) proposedArrivals.add(train.id);
      });
      evaluateConflict(previousPositions);
      proposedArrivals.forEach((id) => {
        const train = trains[id];
        if (!["TRAFFIC HOLD", "OPERATOR HOLD"].includes(train.status) && train.progress === train.targetProgress) {
          arriveTrain(train);
        }
      });
      Object.values(trains).forEach(updateSensor);
      const visibleTrains = Object.values(trains).filter((train) => train.visible);
      if (visibleTrains.length && visibleTrains.every((train) => train.status === "ARRIVED")) {
        state.running = false;
        simulator.classList.remove("is-running");
        runButton.innerHTML = 'All arrived <span>✓</span>';
        setSystemState("ALL ARRIVED");
      }
      runAutomaticTurnout();
    }

    render();
    requestAnimationFrame(tick);
  }

  function startSimulation() {
    if (state.conflictLatched) {
      rejectCommand(
        "head-on protection is latched; recover with reroute, remove, or reset before releasing movement.",
        helpEntries.reroute[0],
        helpEntries.reroute[2]
      );
      return false;
    }
    const releasable = Object.values(trains).some(
      (train) =>
        train.visible &&
        train.speed > 0 &&
        !firstBlockedSegment(train.routeId) &&
        ["READY", "PAUSED", "STAGED"].includes(train.status)
    );
    if (!releasable) {
      rejectCommand("no train is ready to move; dispatch/reroute a train or resolve the safety hold.", helpEntries.dispatch[0], helpEntries.dispatch[2]);
      return false;
    }
    state.running = true;
    simulator.classList.add("is-running");
    Object.values(trains).forEach((train) => {
      if (
        train.visible &&
        train.speed > 0 &&
        !firstBlockedSegment(train.routeId) &&
        ["READY", "PAUSED", "STAGED"].includes(train.status)
      ) {
        train.status = "RUNNING";
      }
    });
    runButton.innerHTML = 'Running <span>●</span>';
    log("Dispatcher released the active browser scenario.", "system", "GO");
    showCommandOnTrack("GO ACCEPTED · TRAINS MOVING");
    return true;
  }

  function pauseSimulation() {
    state.running = false;
    simulator.classList.remove("is-running");
    Object.values(trains).forEach((train) => {
      if (train.visible && ["RUNNING", "REROUTED"].includes(train.status)) {
        train.status = "PAUSED";
      }
    });
    runButton.innerHTML = 'Resume <span>▶</span>';
    log("Browser model paused.", "note");
    showCommandOnTrack("PAUSE ACCEPTED · MOVEMENT HELD");
  }

  function statusSummary() {
    return Object.values(trains)
      .map((train) => `T${train.id} ${train.visible ? train.status : "REMOVED"} @ ${train.sensor}, speed ${train.speed}, ${train.route}, destination ${train.destinationId || "NONE"}`)
      .join(" · ");
  }

  function parseTrainId(value) {
    const id = Number(value);
    return trains[id] ? id : null;
  }

  function currentPoint(train) {
    const route = routeFor(train);
    return route.element.getPointAtLength(train.progress * route.length);
  }

  function nearestProgress(point, route) {
    let bestProgress = 0;
    let bestDistance = Infinity;
    const samples = 192;
    for (let index = 0; index < samples; index += 1) {
      const progress = index / samples;
      const candidate = route.element.getPointAtLength(progress * route.length);
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestProgress = progress;
      }
    }
    return bestProgress;
  }

  const sourceProgressByLetter = Object.freeze({ A: 0.04, B: 0.2, C: 0.36, D: 0.52, E: 0.68, F: 0.84 });

  function plannedDestinationStart(train, destinationId, source = "CURRENT") {
    const destination = destinations[destinationId.toUpperCase()];
    const nextRoute = routes[destination.routeId];
    const current = currentPoint(train);
    const progress = source === "CURRENT" ? nearestProgress(current, nextRoute) : sourceProgressByLetter[source];
    return { destination, nextRoute, progress };
  }

  function destinationStartIsOccupied(train, destinationId, source = "CURRENT") {
    const plan = plannedDestinationStart(train, destinationId, source);
    const candidate = plan.nextRoute.element.getPointAtLength(plan.progress * plan.nextRoute.length);
    const other = trains[train.id === 14 ? 15 : 14];
    if (!other.visible) return false;
    const occupied = currentPoint(other);
    return Math.hypot(candidate.x - occupied.x, candidate.y - occupied.y) < 58;
  }

  function assignDestination(train, destinationId, source = "CURRENT") {
    const { destination, nextRoute, progress } = plannedDestinationStart(train, destinationId, source);
    train.routeId = destination.routeId;
    train.progress = progress;
    train.route = nextRoute.label;
    train.destinationId = destination.id;
    train.targetProgress = destination.progress;
    syncNearestSensor(train);
    return destination;
  }

  function firstBlockedSegment(routeId) {
    return (routeSegments[routeId] || []).find((segment) => state.blockedSegments.has(segment)) || null;
  }

  function resumeStatus(train) {
    if (firstBlockedSegment(train.routeId)) return "BLOCK HOLD";
    if (train.speed <= 0) return "PAUSED";
    return state.running ? "RUNNING" : "READY";
  }

  const helpEntries = Object.freeze({
    help: ["help [command|destinations]", "Show valid syntax, meaning, and examples.", "help dispatch"],
    scenario: ["scenario <free|follow|opposing>", "Load a two-train browser scenario.", "scenario follow"],
    dispatch: ["dispatch <14|15> <A-F|CURRENT> <1..120> <D1-D8>", "Stage a train for a labeled stop point; enter go to release it.", "dispatch 14 CURRENT 80 d4"],
    go: ["go", "Release READY, PAUSED, or STAGED trains. Aliases: run, start.", "go"],
    pause: ["pause", "Hold all moving trains without changing their routes.", "pause"],
    speed: ["speed <14|15> <0..120>", "Change requested browser speed; zero pauses that train.", "speed 14 70"],
    reroute: ["reroute <14|15> <1..120> <D1-D8>", "Replan from CURRENT to a labeled destination.", "reroute 14 60 d2"],
    cancel: ["cancel <14|15>", "Command speed zero while retaining browser authority.", "cancel 14"],
    remove: ["remove <14|15>", "Remove a train and release its browser authority.", "remove 15"],
    sw: ["sw <153|154|155|156> <S|C>", "Set a special turnout straight or curved with paired interlock protection.", "sw 153 C"],
    status: ["status", "Print train state, sensor, speed, route, and destination.", "status"],
    trips: ["trips", "Print the same compact fleet snapshot used by this showcase.", "trips"],
    trackview: ["trackview", "Print the current fleet snapshot beside the live map.", "trackview"],
    block: ["block <LEFT-INNER|RIGHT-INNER|MAIN-CIRCUIT|INTERLOCK>", "Prevent dispatch and hold trains whose browser route depends on that segment.", "block INTERLOCK"],
    unblock: ["unblock <segment>", "Release a previously blocked browser segment and eligible held trains.", "unblock INTERLOCK"],
    blocks: ["blocks", "List blocked browser segments.", "blocks"],
    reset: ["reset", "Restore the selected scenario and clear destinations.", "reset"],
  });

  function rejectCommand(reason, syntax, example) {
    log(`Command rejected: ${reason}`, "alert", "ERR");
    if (syntax) log(`Syntax: ${syntax}`, "note", "USE");
    if (example) log(`Example: ${example}`, "note", "TRY");
    showCommandOnTrack(`NOT EXECUTED · ${reason}`);
  }

  function showHelp(topic) {
    topic = ({ run: "go", start: "go" })[topic] || topic;
    if (topic === "destinations") {
      const introRow = log("DESTINATIONS — each bold D-number is a real stop pin on the map above.", "system", "GUIDE");
      Object.values(destinations).forEach((destination) => {
        logHelp(
          destination.id,
          `${destination.label} — the train stops at this labeled map pin.`,
          `dispatch 14 CURRENT 80 ${destination.id.toLowerCase()}`,
          "DEST"
        );
      });
      requestAnimationFrame(() => {
        terminalLog.scrollTop = Math.max(0, introRow.offsetTop - terminalLog.offsetTop - 8);
      });
      return true;
    }
    if (topic) {
      const entry = helpEntries[topic];
      if (!entry) return false;
      log("FOCUSED HELP — bold text is the exact command syntax.", "system", "GUIDE");
      logHelp(entry[0], entry[1], entry[2]);
      return true;
    }
    const introRow = log(
      `${Object.keys(helpEntries).length} AVAILABLE COMMANDS — bold text is the syntax. Replace values inside <…>; do not type the brackets.`,
      "system",
      "GUIDE"
    );
    Object.values(helpEntries).forEach(([syntax, meaning, example]) => {
      logHelp(syntax, meaning, example);
    });
    log("Need a stop? Type help destinations. Need one command? Type help <command>.", "note", "NEXT");
    requestAnimationFrame(() => {
      terminalLog.scrollTop = Math.max(0, introRow.offsetTop - terminalLog.offsetTop - 8);
    });
    return true;
  }

  function executeCommand(rawCommand) {
    const command = rawCommand.trim();
    if (!command) return;
    log(command, "command");
    const parts = command.split(/\s+/);
    const verb = parts[0].toLowerCase();

    if (verb === "help") {
      if (parts.length > 2) {
        rejectCommand("help accepts at most one topic.", helpEntries.help[0], helpEntries.help[2]);
        return;
      }
      const topic = parts[1]?.toLowerCase();
      if (!showHelp(topic)) {
        rejectCommand(`unknown help topic “${parts[1]}”.`, helpEntries.help[0], "help destinations");
      }
      return;
    }

    if (verb === "go" || verb === "run" || verb === "start") {
      if (parts.length !== 1) {
        rejectCommand(`${verb} does not accept arguments.`, helpEntries.go[0], helpEntries.go[2]);
        return;
      }
      if (state.running) {
        rejectCommand("the simulation is already running.", helpEntries.pause[0], helpEntries.pause[2]);
        return;
      }
      const releasable = Object.values(trains).some(
        (train) =>
          train.visible &&
          train.speed > 0 &&
          !firstBlockedSegment(train.routeId) &&
          ["READY", "PAUSED", "STAGED"].includes(train.status)
      );
      if (!releasable) {
        rejectCommand("no train is ready to move; dispatch/reroute a train or resolve the safety hold.", helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      startSimulation();
      return;
    }

    if (verb === "pause") {
      if (parts.length !== 1) {
        rejectCommand("pause does not accept arguments.", helpEntries.pause[0], helpEntries.pause[2]);
        return;
      }
      if (!state.running) {
        rejectCommand("the simulation is already paused.", helpEntries.go[0], helpEntries.go[2]);
        return;
      }
      pauseSimulation();
      return;
    }

    if (verb === "status" || verb === "trips" || verb === "trackview") {
      if (parts.length !== 1) {
        rejectCommand(`${verb} does not accept arguments.`, helpEntries[verb][0], helpEntries[verb][2]);
        return;
      }
      log(statusSummary(), "note", verb === "status" ? "STATE" : verb.toUpperCase());
      return;
    }

    if (verb === "reset") {
      if (parts.length !== 1) {
        rejectCommand("reset does not accept arguments.", helpEntries.reset[0], helpEntries.reset[2]);
        return;
      }
      setScenario(state.scenario, false);
      log("Scenario reset to its initial browser state.", "system");
      showCommandOnTrack("SCENARIO RESET");
      return;
    }

    if (verb === "scenario") {
      if (parts.length !== 2 || !["free", "follow", "opposing"].includes(parts[1]?.toLowerCase())) {
        rejectCommand("scenario must be free, follow, or opposing.", helpEntries.scenario[0], helpEntries.scenario[2]);
        return;
      }
      setScenario(parts[1].toLowerCase());
      return;
    }

    if (verb === "dispatch") {
      if (parts.length !== 5) {
        rejectCommand("dispatch requires exactly four arguments.", helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      const id = parseTrainId(parts[1]);
      const source = parts[2].toUpperCase();
      const speed = Number(parts[3]);
      const destinationId = parts[4].toUpperCase();
      if (!id) {
        rejectCommand("train must be 14 or 15.", helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      if (!/^(CURRENT|[A-F])$/.test(source)) {
        rejectCommand("source must be A–F or CURRENT.", helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      if (!Number.isInteger(speed) || speed < 1 || speed > 120) {
        rejectCommand("speed must be an integer from 1 to 120.", helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      if (!destinations[destinationId]) {
        rejectCommand("destination must be D1–D8; type help destinations to see every stop.", helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      if (state.conflictLatched) {
        rejectCommand(
          "head-on protection is latched; recover with reroute, remove, or reset before staging a new dispatch.",
          helpEntries.reroute[0],
          helpEntries.reroute[2]
        );
        return;
      }
      const blockedSegment = firstBlockedSegment(destinations[destinationId].routeId);
      if (blockedSegment) {
        rejectCommand(`${blockedSegment} is blocked; unblock it before dispatch.`, helpEntries.unblock[0], `unblock ${blockedSegment}`);
        return;
      }
      const train = trains[id];
      if (state.running) {
        rejectCommand("pause the simulation before staging a new dispatch.", helpEntries.pause[0], helpEntries.pause[2]);
        return;
      }
      if (destinationStartIsOccupied(train, destinationId, source)) {
        rejectCommand("that source position is occupied by the other train; choose another source or remove/reroute it.", helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      train.visible = true;
      train.speed = speed;
      train.direction = 1;
      const destination = assignDestination(train, destinationId, source);
      train.status = "STAGED";
      train.element.classList.remove("is-removed");
      train.card.classList.remove("is-removed");
      if (state.trafficHoldTrainId === id) state.trafficHoldTrainId = null;
      log(`Train ${id} staged from ${source} at speed ${speed} toward ${destination.id} (${destination.anchorSensor}).`, "system", "DSP");
      showCommandOnTrack(`T${id} STAGED · ENTER GO TO RELEASE`, id);
      render();
      return;
    }

    if (verb === "reroute") {
      if (parts.length !== 4) {
        rejectCommand("reroute requires train, speed, and destination.", helpEntries.reroute[0], helpEntries.reroute[2]);
        return;
      }
      const id = parseTrainId(parts[1]);
      const speed = Number(parts[2]);
      const destinationId = parts[3].toUpperCase();
      if (!id) {
        rejectCommand("train must be 14 or 15.", helpEntries.reroute[0], helpEntries.reroute[2]);
        return;
      }
      if (!Number.isInteger(speed) || speed < 1 || speed > 120) {
        rejectCommand("speed must be an integer from 1 to 120.", helpEntries.reroute[0], helpEntries.reroute[2]);
        return;
      }
      if (!destinations[destinationId]) {
        rejectCommand("destination must be D1–D8; type help destinations to see every stop.", helpEntries.reroute[0], helpEntries.reroute[2]);
        return;
      }
      const blockedSegment = firstBlockedSegment(destinations[destinationId].routeId);
      if (blockedSegment) {
        rejectCommand(`${blockedSegment} is blocked; unblock it before rerouting.`, helpEntries.unblock[0], `unblock ${blockedSegment}`);
        return;
      }
      const train = trains[id];
      if (!train.visible) {
        rejectCommand(`train ${id} is removed; dispatch it before rerouting.`, helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      if (destinationStartIsOccupied(train, destinationId, "CURRENT")) {
        rejectCommand("the mapped CURRENT position is occupied by the other train; remove or reroute the blocking train first.", helpEntries.reroute[0], helpEntries.reroute[2]);
        return;
      }
      train.speed = speed;
      const destination = assignDestination(train, destinationId, "CURRENT");
      train.status = state.running ? "REROUTED" : "READY";
      state.conflictLatched = false;
      releaseTrafficHold();
      state.scenario = "free";
      $$(".scenario-control button", simulator).forEach((button) => {
        button.classList.toggle("is-active", button.dataset.scenario === "free");
      });
      const other = trains[id === 14 ? 15 : 14];
      if (other.visible && other.status === "OPERATOR HOLD") {
        other.status = resumeStatus(other);
      }
      setSystemState("RECOVERING");
      log(`Train ${id} safely stopped, replanned from CURRENT, and assigned ${destination.id} (${destination.anchorSensor}).`, "system", "ROUTE");
      showCommandOnTrack(`T${id} REROUTED · ${routes[destination.routeId].label} → ${destination.id}`, id);
      evaluateConflict();
      render();
      return;
    }

    if (verb === "cancel") {
      const id = parseTrainId(parts[1]);
      if (parts.length !== 2 || !id) {
        rejectCommand("cancel requires train 14 or 15.", helpEntries.cancel[0], helpEntries.cancel[2]);
        return;
      }
      const train = trains[id];
      if (!train.visible || train.status === "ARRIVED") {
        rejectCommand(`train ${id} is not an active moving plan.`, helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      train.speed = 0;
      const routeBlock = firstBlockedSegment(train.routeId);
      train.status = routeBlock ? "BLOCK HOLD" : "BRAKING";
      setSystemState(routeBlock ? `${routeBlock} BLOCKED` : "CANCEL BRAKING", true);
      log(
        routeBlock
          ? `Train ${id} speed set to zero; ${routeBlock} remains blocked.`
          : `Train ${id} commanded to speed zero; its browser authority remains held until remove/reset.`,
        "system",
        "CANCEL"
      );
      showCommandOnTrack(routeBlock ? `T${id} HELD · ${routeBlock} BLOCKED` : `T${id} BRAKING TO ZERO`, id);
      return;
    }

    if (verb === "remove") {
      const id = parseTrainId(parts[1]);
      if (parts.length !== 2 || !id) {
        rejectCommand("remove requires train 14 or 15.", helpEntries.remove[0], helpEntries.remove[2]);
        return;
      }
      const train = trains[id];
      if (!train.visible) {
        rejectCommand(`train ${id} is already removed.`, helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      train.visible = false;
      train.status = "REMOVED";
      train.destinationId = null;
      train.targetProgress = null;
      train.element.classList.add("is-removed");
      train.card.classList.add("is-removed");
      state.conflictLatched = false;
      state.trafficHoldTrainId = null;
      const other = trains[id === 14 ? 15 : 14];
      if (other.visible && ["OPERATOR HOLD", "TRAFFIC HOLD"].includes(other.status)) {
        other.status = resumeStatus(other);
      }
      const remainingBlock = other.visible ? firstBlockedSegment(other.routeId) : null;
      setSystemState(remainingBlock ? `${remainingBlock} BLOCKED` : "RECOVERED", Boolean(remainingBlock));
      if (!Object.values(trains).some((candidate) => candidate.visible)) {
        state.running = false;
        simulator.classList.remove("is-running");
        runButton.innerHTML = 'No active trains <span>—</span>';
        setSystemState("NO ACTIVE TRAINS");
      }
      log(`Train ${id} marked physically removed; its browser plan and authority were released.`, "system", "REMOVE");
      showCommandOnTrack(`T${id} REMOVED · AUTHORITY RELEASED`, id);
      return;
    }

    if (verb === "block" || verb === "unblock") {
      const segment = (parts[1] || "").toUpperCase();
      if (parts.length !== 2 || !validSegments.has(segment)) {
        rejectCommand("segment must be LEFT-INNER, RIGHT-INNER, MAIN-CIRCUIT, or INTERLOCK.", helpEntries[verb][0], helpEntries[verb][2]);
        return;
      }
      if (verb === "block" && state.blockedSegments.has(segment)) {
        rejectCommand(`${segment} is already blocked.`, helpEntries.blocks[0], helpEntries.blocks[2]);
        return;
      }
      if (verb === "unblock" && !state.blockedSegments.has(segment)) {
        rejectCommand(`${segment} is not blocked.`, helpEntries.blocks[0], helpEntries.blocks[2]);
        return;
      }
      if (verb === "block") {
        state.blockedSegments.add(segment);
        Object.values(trains).forEach((train) => {
          if (
            train.visible &&
            routeSegments[train.routeId]?.includes(segment) &&
            ["READY", "STAGED", "PAUSED", "RUNNING", "REROUTED"].includes(train.status)
          ) {
            train.status = "BLOCK HOLD";
          }
        });
        setSystemState(`${segment} BLOCKED`, true);
      } else {
        state.blockedSegments.delete(segment);
        Object.values(trains).forEach((train) => {
          if (train.status !== "BLOCK HOLD" || firstBlockedSegment(train.routeId)) return;
          train.status = resumeStatus(train);
        });
        setSystemState(state.blockedSegments.size ? "PARTIAL BLOCK" : "NOMINAL");
      }
      log(
        `${segment} ${verb === "block" ? "blocked; affected trains are held" : "unblocked; eligible movement authority restored"}.`,
        "system",
        "ZONE"
      );
      render();
      return;
    }

    if (verb === "blocks") {
      if (parts.length !== 1) {
        rejectCommand("blocks does not accept arguments.", helpEntries.blocks[0], helpEntries.blocks[2]);
        return;
      }
      log(
        state.blockedSegments.size ? [...state.blockedSegments].join(", ") : "No browser segments are blocked.",
        "note",
        "ZONE"
      );
      return;
    }

    if (verb === "sw") {
      const id = Number(parts[1]);
      const switchState = (parts[2] || "").toUpperCase();
      if (parts.length !== 3 || ![153, 154, 155, 156].includes(id) || !["S", "C"].includes(switchState)) {
        rejectCommand("turnout must be 153–156 and state must be S or C.", helpEntries.sw[0], helpEntries.sw[2]);
        return;
      }
      toggleSwitch(id, switchState, "operator command");
      showCommandOnTrack(`SW${id} → ${switchState === "S" ? "STRAIGHT" : "CURVED"}`);
      return;
    }

    if (verb === "speed") {
      const id = parseTrainId(parts[1]);
      const speed = Number(parts[2]);
      if (parts.length !== 3 || !id || !Number.isInteger(speed) || speed < 0 || speed > 120) {
        rejectCommand("speed requires train 14 or 15 and an integer from 0 to 120.", helpEntries.speed[0], helpEntries.speed[2]);
        return;
      }
      const train = trains[id];
      if (!train.visible) {
        rejectCommand(`train ${id} is removed; dispatch it before changing speed.`, helpEntries.dispatch[0], helpEntries.dispatch[2]);
        return;
      }
      if (train.status === "ARRIVED" && speed > 0) {
        rejectCommand(`train ${id} is at ${train.destinationId}; dispatch or reroute it to a new destination.`, helpEntries.reroute[0], helpEntries.reroute[2]);
        return;
      }
      if (train.status === "ARRIVED") {
        train.speed = 0;
        log(`Train ${id} remains stopped at ${train.destinationId}.`, "system", "ARRIVE");
        showCommandOnTrack(`T${id} REMAINS STOPPED · ${train.destinationId}`, id);
        return;
      }
      train.speed = speed;
      if (firstBlockedSegment(train.routeId)) {
        train.status = "BLOCK HOLD";
      } else if (!["TRAFFIC HOLD", "OPERATOR HOLD"].includes(train.status)) {
        if (speed === 0 && train.status !== "ARRIVED") train.status = "PAUSED";
        else if (state.running && train.status !== "ARRIVED") train.status = "RUNNING";
      }
      log(`Train ${id} browser speed set to ${speed}.`, "system", "SPD");
      showCommandOnTrack(`T${id} SPEED → ${speed}`, id);
      return;
    }

    rejectCommand(`unknown command “${verb}”. Type help to see every valid command.`, helpEntries.help[0], helpEntries.help[2]);
  }

  $$(".scenario-control button", simulator).forEach((button) => {
    button.addEventListener("click", () => setScenario(button.dataset.scenario));
  });

  runButton.addEventListener("click", () => {
    if (state.running) pauseSimulation();
    else startSimulation();
  });
  pauseButton.addEventListener("click", pauseSimulation);

  $$("[data-command]", simulator).forEach((button) => {
    button.addEventListener("click", () => {
      terminalInput.value = button.dataset.command;
      terminalInput.focus();
      executeCommand(button.dataset.command);
      terminalInput.value = "";
    });
  });

  $('[data-action="clear-log"]', simulator).addEventListener("click", () => {
    terminalLog.replaceChildren();
    log("Terminal history cleared.", "note");
  });

  terminalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    executeCommand(terminalInput.value);
    terminalInput.value = "";
  });

  drawSensors();
  drawDestinations();
  toggleSwitch(154, "C", "initial browser state");
  toggleSwitch(156, "C", "initial browser state");
  setScenario("free", false);
  requestAnimationFrame(tick);
})();
