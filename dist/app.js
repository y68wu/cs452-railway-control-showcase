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
    terminalLog.append(row);
    terminalLog.scrollTop = terminalLog.scrollHeight;
    latestEventElement.textContent = message;

    while (terminalLog.children.length > 40) {
      terminalLog.firstElementChild.remove();
    }
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
    state.holdAcknowledged = false;
    simulator.classList.remove("is-running");

    Object.values(trains).forEach((train) => {
      train.visible = true;
      train.status = "READY";
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

    Object.values(trains).forEach(syncNearestSensor);

    $$(".scenario-control button", simulator).forEach((button) => {
      button.classList.toggle("is-active", button.dataset.scenario === name);
    });

    runButton.innerHTML = 'Run trains <span>▶</span>';
    setSystemState("READY");
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
      train.status === "WAITING" || train.status === "OPERATOR HOLD" || train.status === "TRAFFIC HOLD"
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

  function circularGap(a, b) {
    const raw = Math.abs(a.progress - b.progress);
    return Math.min(raw, 1 - raw);
  }

  function evaluateConflict() {
    const first = trains[14];
    const second = trains[15];
    if (!first.visible || !second.visible) {
      setSystemState("NOMINAL");
      return;
    }

    if (first.routeId !== second.routeId) {
      setSystemState("NOMINAL");
      return;
    }

    if (state.scenario === "follow") {
      const gap = (first.progress - second.progress + 1) % 1;
      if (gap < 0.092 && gap > 0.002) {
        if (second.status !== "TRAFFIC HOLD") {
          second.status = "TRAFFIC HOLD";
          log("Same-direction authority narrowed; trailing train 15 is waiting.", "alert");
        }
        setSystemState("FOLLOWING HOLD", true);
      } else if (second.status === "TRAFFIC HOLD" && gap > 0.125) {
        second.status = "RUNNING";
        setSystemState("NOMINAL");
        log("Movement authority restored; trailing train 15 resumes.", "system", "AUTH");
      }
      return;
    }

    if (state.scenario === "opposing") {
      const gap = circularGap(first, second);
      if (gap < 0.075 && !state.conflictLatched) {
        state.conflictLatched = true;
        first.status = "OPERATOR HOLD";
        second.status = "OPERATOR HOLD";
        setSystemState("HEAD-ON HOLD", true);
        log("Opposing movement detected. Both trains stopped for operator recovery.", "alert");
      }
      if (!state.conflictLatched) setSystemState("MONITORING");
      return;
    }

    setSystemState("NOMINAL");
  }

  function shouldMove(train) {
    return (
      state.running &&
      train.visible &&
      ["RUNNING", "REROUTED"].includes(train.status)
    );
  }

  function render() {
    Object.values(trains).forEach(renderTrain);
    clockElement.textContent = timeString();
  }

  function tick(now) {
    const delta = Math.min((now - state.lastFrame) / 1000, 0.08);
    state.lastFrame = now;

    if (state.running) {
      state.elapsed += delta;
      Object.values(trains).forEach((train) => {
        if (!shouldMove(train)) return;
        const normalizedSpeed = train.speed / 120;
        train.progress = (train.progress + train.direction * delta * (0.018 + normalizedSpeed * 0.035) + 1) % 1;
        updateSensor(train);
      });
      evaluateConflict();
      runAutomaticTurnout();
    }

    render();
    requestAnimationFrame(tick);
  }

  function startSimulation() {
    state.running = true;
    simulator.classList.add("is-running");
    Object.values(trains).forEach((train) => {
      if (train.visible && ["READY", "PAUSED", "STAGED"].includes(train.status)) {
        train.status = "RUNNING";
      }
    });
    runButton.innerHTML = 'Running <span>●</span>';
    log("Dispatcher released the active browser scenario.", "system", "GO");
    showCommandOnTrack("GO ACCEPTED · TRAINS MOVING");
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
      .map((train) => `T${train.id} ${train.visible ? train.status : "REMOVED"} @ ${train.sensor}, speed ${train.speed}, ${train.route}`)
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

  function executeCommand(rawCommand) {
    const command = rawCommand.trim();
    if (!command) return;
    log(command, "command");
    const parts = command.split(/\s+/);
    const verb = parts[0].toLowerCase();

    if (verb === "help") {
      log(
        "Subset: dispatch <train> <A-F|CURRENT> <1..120> <d1-d8>; go; trips; reroute <train> <1..120> <d1-d8>; cancel <train>; remove <train>; trackview; block <id>; unblock <id>; status; reset.",
        "note",
        "HELP"
      );
      return;
    }

    if (verb === "go" || verb === "run" || verb === "start") {
      startSimulation();
      return;
    }

    if (verb === "pause") {
      pauseSimulation();
      return;
    }

    if (verb === "status" || verb === "trips" || verb === "trackview") {
      log(statusSummary(), "note", verb === "status" ? "STATE" : verb.toUpperCase());
      return;
    }

    if (verb === "reset") {
      setScenario(state.scenario, false);
      log("Scenario reset to its initial browser state.", "system");
      showCommandOnTrack("SCENARIO RESET");
      return;
    }

    if (verb === "scenario" && ["free", "follow", "opposing"].includes(parts[1])) {
      setScenario(parts[1]);
      return;
    }

    if (verb === "dispatch") {
      const id = parseTrainId(parts[1]);
      const source = (parts[2] || "").toUpperCase();
      const speed = Number(parts[3]);
      const destination = (parts[4] || "").toLowerCase();
      if (!id || !/^(CURRENT|[A-F])$/.test(source) || !Number.isInteger(speed) || speed < 1 || speed > 120 || !/^d[1-8]$/.test(destination)) {
        log("Usage: dispatch <14|15> <A-F|CURRENT> <speed 1..120> <d1-d8>", "alert", "ERR");
        return;
      }
      const train = trains[id];
      train.visible = true;
      train.speed = speed;
      train.route = `${routeFor(train).label} · ${destination.toUpperCase()}`;
      train.status = "STAGED";
      train.element.classList.remove("is-removed");
      train.card.classList.remove("is-removed");
      log(`Train ${id} staged from ${source} at speed ${speed} toward ${destination.toUpperCase()}.`, "system", "DSP");
      showCommandOnTrack(`T${id} STAGED · ENTER GO TO RELEASE`, id);
      return;
    }

    if (verb === "reroute") {
      const id = parseTrainId(parts[1]);
      const speed = Number(parts[2]);
      const destination = (parts[3] || "d2").toLowerCase();
      if (!id || (parts[2] && (!Number.isInteger(speed) || speed < 1 || speed > 120)) || !/^d[1-8]$/.test(destination)) {
        log("Usage: reroute <14|15> <speed 1..120> <d1-d8>", "alert", "ERR");
        return;
      }
      const train = trains[id];
      const before = currentPoint(train);
      train.visible = true;
      if (Number.isInteger(speed)) train.speed = speed;
      const nextRouteId = train.routeId === "outer"
        ? (Number(destination.slice(1)) % 2 === 0 ? "right-inner" : "left-inner")
        : "outer";
      const nextRoute = routes[nextRouteId];
      train.routeId = nextRouteId;
      train.progress = nearestProgress(before, nextRoute);
      train.route = `${nextRoute.label} · ${destination.toUpperCase()}`;
      syncNearestSensor(train);
      train.status = state.running ? "REROUTED" : "READY";
      state.conflictLatched = false;
      state.scenario = "free";
      $$(".scenario-control button", simulator).forEach((button) => {
        button.classList.toggle("is-active", button.dataset.scenario === "free");
      });
      const other = trains[id === 14 ? 15 : 14];
      if (other.visible && other.status === "OPERATOR HOLD") {
        other.status = state.running ? "RUNNING" : "READY";
      }
      setSystemState("RECOVERING");
      log(`Train ${id} safely stopped, replanned from CURRENT, and assigned ${destination.toUpperCase()} in the browser model.`, "system", "ROUTE");
      showCommandOnTrack(`T${id} REROUTED · ${nextRoute.label}`, id);
      return;
    }

    if (verb === "cancel") {
      const id = parseTrainId(parts[1]);
      if (!id) {
        log("Usage: cancel <14|15>", "alert", "ERR");
        return;
      }
      const train = trains[id];
      train.speed = 0;
      train.status = "BRAKING";
      setSystemState("CANCEL BRAKING", true);
      log(`Train ${id} commanded to speed zero; its browser authority remains held until remove/reset.`, "system", "CANCEL");
      showCommandOnTrack(`T${id} BRAKING TO ZERO`, id);
      return;
    }

    if (verb === "remove") {
      const id = parseTrainId(parts[1]);
      if (!id) {
        log("Usage: remove <14|15>", "alert", "ERR");
        return;
      }
      const train = trains[id];
      train.visible = false;
      train.status = "REMOVED";
      train.element.classList.add("is-removed");
      train.card.classList.add("is-removed");
      state.conflictLatched = false;
      const other = trains[id === 14 ? 15 : 14];
      if (other.visible && ["OPERATOR HOLD", "TRAFFIC HOLD"].includes(other.status)) {
        other.status = state.running ? "RUNNING" : "READY";
      }
      setSystemState("RECOVERED");
      log(`Train ${id} marked physically removed; its browser plan and authority were released.`, "system", "REMOVE");
      showCommandOnTrack(`T${id} REMOVED · AUTHORITY RELEASED`, id);
      return;
    }

    if (verb === "block" || verb === "unblock") {
      const segment = (parts[1] || "").toUpperCase();
      if (!segment) {
        log(`Usage: ${verb} <segment-id>`, "alert", "ERR");
        return;
      }
      if (verb === "block") state.blockedSegments.add(segment);
      else state.blockedSegments.delete(segment);
      log(`${segment} ${verb === "block" ? "blocked" : "unblocked"} in the browser plan.`, "system", "ZONE");
      return;
    }

    if (verb === "blocks") {
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
      if (![153, 154, 155, 156].includes(id) || !["S", "C"].includes(switchState)) {
        log("Browser-only convenience: sw <153|154|155|156> <S|C>", "alert", "ERR");
        return;
      }
      toggleSwitch(id, switchState, "operator command");
      showCommandOnTrack(`SW${id} → ${switchState === "S" ? "STRAIGHT" : "CURVED"}`);
      return;
    }

    if (verb === "speed") {
      const id = parseTrainId(parts[1]);
      const speed = Number(parts[2]);
      if (!id || !Number.isInteger(speed) || speed < 0 || speed > 120) {
        log("Browser-only convenience: speed <14|15> <0..120>", "alert", "ERR");
        return;
      }
      trains[id].speed = speed;
      if (speed === 0) trains[id].status = "PAUSED";
      else if (state.running && trains[id].visible) trains[id].status = "RUNNING";
      log(`Train ${id} browser speed set to ${speed}.`, "system", "SPD");
      showCommandOnTrack(`T${id} SPEED → ${speed}`, id);
      return;
    }

    log(`Unknown browser command “${verb}”. Type help for the accepted subset.`, "alert", "ERR");
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
  toggleSwitch(154, "C", "initial browser state");
  toggleSwitch(156, "C", "initial browser state");
  setScenario("free", false);
  requestAnimationFrame(tick);
})();
