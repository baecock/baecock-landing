(function () {
  "use strict";

  var GRADE_ORDER = ["S", "A", "B", "C", "D", "E", "F"];
  var GROUP_CYCLE = ["", "A", "B"];
  var GRADE_MODE_LABELS = { ignore: "급수 무시", same: "동일 급수끼리", mix: "급수 섞어서" };
  var DOUBLES_TYPE_LABELS = { all: "전체(성별 무관)", male: "남자복식", female: "여자복식", mixed: "혼합복식" };
  var MIN_PARTICIPANTS = 4;
  var ARRANGEMENT_ATTEMPTS = 30;
  var MAX_ROUNDS_PER_GROUP = 40;

  var participants = [];
  var nextId = 1;
  var mode = "random"; // 'random' | 'manual'
  var manualSortByGrade = false;

  var sessionState = { pairHistory: null, opponentHistory: null, benchCounts: null };
  var manualState = { courts: [] }; // { slots: [id|null, id|null, id|null, id|null] } (0-1: 팀A, 2-3: 팀B)

  // currentSession.groups: [{ label: 'A팀'|null, rounds: [{courts:[{teamA:[id,id],teamB:[id,id]}], benchedIds:[id...]}] }]
  var currentSession = null;
  var uiState = { editingKey: null, editingSlotKey: null };

  resetSessionHistory();

  // DOM
  var nameInput = document.getElementById("participant-name");
  var gradeSelect = document.getElementById("participant-grade");
  var genderSelect = document.getElementById("participant-gender");
  var ageSelect = document.getElementById("participant-age");
  var groupSelect = document.getElementById("participant-group");
  var addBtn = document.getElementById("add-participant");
  var countEl = document.getElementById("participant-count");
  var groupHintEl = document.getElementById("group-hint");
  var listEl = document.getElementById("participant-list");
  var errorEl = document.getElementById("match-error");
  var noteEl = document.getElementById("match-note");

  var modeTabRandom = document.getElementById("mode-tab-random");
  var modeTabManual = document.getElementById("mode-tab-manual");
  var gradeModeRow = document.getElementById("grade-mode-row");
  var gradeModeSelect = document.getElementById("grade-mode");
  var doublesTypeSelect = document.getElementById("doubles-type");
  var gamesPerPersonRow = document.getElementById("games-per-person-row");
  var gamesPerPersonSelect = document.getElementById("games-per-person");
  var courtCountRow = document.getElementById("court-count-row");
  var courtCountSelect = document.getElementById("court-count");
  var genModeNormalRadio = document.getElementById("generation-mode-normal");
  var genModeTeamRadio = document.getElementById("generation-mode-team");
  var genModeCards = document.querySelectorAll(".generation-mode__card");
  var teamModePanel = document.getElementById("team-mode-panel");
  var autoGroupSplitBtn = document.getElementById("auto-group-split");

  var randomPanel = document.getElementById("random-panel");
  var generateBtn = document.getElementById("generate-match");

  var manualPanel = document.getElementById("manual-panel");
  var manualErrorEl = document.getElementById("manual-error");
  var manualPoolCountEl = document.getElementById("manual-pool-count");
  var manualSortToggle = document.getElementById("manual-sort-toggle");
  var manualPoolEl = document.getElementById("manual-pool");
  var addCourtBtn = document.getElementById("add-court");
  var manualCourtsEl = document.getElementById("manual-courts");
  var confirmManualBtn = document.getElementById("confirm-manual");

  var resultsSection = document.getElementById("match-results");
  var boardEl = document.getElementById("matchup-board");

  // ---- 공통 유틸 ----

  function resetSessionHistory() {
    sessionState.pairHistory = new Set();
    sessionState.opponentHistory = new Set();
    sessionState.benchCounts = {};
  }

  function pairKey(a, b) {
    return [a, b].sort(function (x, y) { return x - y; }).join("_");
  }

  function shuffle(list) {
    var result = list.slice();
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }

  function byId(id) {
    for (var i = 0; i < participants.length; i++) {
      if (participants[i].id === id) return participants[i];
    }
    return null;
  }

  function gradeLabel(grade) {
    return grade ? grade + "급" : "";
  }

  function ageLabel(age) {
    return age ? age + "대" : "";
  }

  function groupLabel(group) {
    return group === "A" ? "A팀" : group === "B" ? "B팀" : "";
  }

  function isTeamMode() {
    return genModeTeamRadio.checked;
  }

  function gradeRankForMix(p) {
    if (!p.grade) return 3.5;
    return GRADE_ORDER.indexOf(p.grade);
  }

  // 급수순 "정렬 표시" 전용 — 미설정은 섞어서 매칭(중간 취급)과 달리 항상 맨 뒤로 보낸다
  function gradeRankForSort(p) {
    if (!p.grade) return GRADE_ORDER.length;
    return GRADE_ORDER.indexOf(p.grade);
  }

  function gradeGroupKey(p) {
    return p.grade || "__none__";
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  function showNote(message) {
    var prefix = noteEl.hidden ? "" : noteEl.textContent + " ";
    noteEl.textContent = prefix + message;
    noteEl.hidden = false;
  }

  function clearNote() {
    noteEl.textContent = "";
    noteEl.hidden = true;
  }

  function hideResults() {
    resultsSection.hidden = true;
    currentSession = null;
    uiState.editingKey = null;
    uiState.editingSlotKey = null;
    generateBtn.textContent = "매칭하기";
    resetSessionHistory();
    manualState.courts = [];
    if (mode === "manual") {
      renderManualPool();
      renderManualCourts();
    }
  }

  // ---- 참가자 입력 ----

  function renderParticipants() {
    countEl.textContent = String(participants.length);
    listEl.textContent = "";

    if (participants.length === 0) {
      var empty = document.createElement("li");
      empty.className = "participant-list__empty";
      empty.textContent = "아직 참가자가 없어요. 위에서 이름을 입력하고 추가해보세요.";
      listEl.appendChild(empty);
      return;
    }

    participants.forEach(function (p) {
      var item = document.createElement("li");
      item.className = "participant-item";

      var main = document.createElement("div");
      main.className = "participant-item__main";

      var label = document.createElement("span");
      label.textContent = p.name;
      main.appendChild(label);

      if (p.grade) {
        var gradeBadge = document.createElement("span");
        gradeBadge.className = "badge badge--grade";
        gradeBadge.textContent = gradeLabel(p.grade);
        main.appendChild(gradeBadge);
      }

      if (p.gender) {
        var genderBadge = document.createElement("span");
        genderBadge.className = "badge " + (p.gender === "M" ? "badge--gender-m" : "badge--gender-f");
        genderBadge.textContent = p.gender === "M" ? "남" : "여";
        main.appendChild(genderBadge);
      }

      if (p.age) {
        var ageBadge = document.createElement("span");
        ageBadge.className = "badge badge--age";
        ageBadge.textContent = ageLabel(p.age);
        main.appendChild(ageBadge);
      }

      if (isTeamMode()) {
        var groupBadge = document.createElement("button");
        groupBadge.type = "button";
        groupBadge.className = "badge badge--group-toggle " + (p.group === "A" ? "badge--group-a" : p.group === "B" ? "badge--group-b" : "badge--grade");
        groupBadge.dataset.id = String(p.id);
        groupBadge.title = "클릭하면 그룹이 바뀌어요 (미배정→A팀→B팀)";
        groupBadge.textContent = p.group ? groupLabel(p.group) : "그룹 미배정";
        main.appendChild(groupBadge);
      }

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "participant-item__remove";
      removeBtn.dataset.id = String(p.id);
      removeBtn.textContent = "삭제";

      item.appendChild(main);
      item.appendChild(removeBtn);
      listEl.appendChild(item);
    });
  }

  function addParticipant() {
    var name = nameInput.value.trim();
    if (!name) return;

    participants.push({
      id: nextId++,
      name: name,
      grade: gradeSelect.value || null,
      gender: genderSelect.value || null,
      age: ageSelect.value || null,
      group: groupSelect.value || null
    });

    nameInput.value = "";
    nameInput.focus();
    gradeSelect.value = "";
    genderSelect.value = "";
    ageSelect.value = "";
    groupSelect.value = "";
    clearError();
    clearNote();
    hideResults();
    renderParticipants();
  }

  function removeParticipant(id) {
    participants = participants.filter(function (p) { return p.id !== id; });
    clearError();
    clearNote();
    hideResults();
    renderParticipants();
  }

  function cycleGroup(id) {
    var p = byId(id);
    if (!p) return;
    var idx = GROUP_CYCLE.indexOf(p.group || "");
    p.group = GROUP_CYCLE[(idx + 1) % GROUP_CYCLE.length] || null;
    clearError();
    clearNote();
    hideResults();
    renderParticipants();
  }

  function autoSplitGroups() {
    var shuffled = shuffle(participants);
    shuffled.forEach(function (p, index) {
      p.group = index % 2 === 0 ? "A" : "B";
    });
    clearError();
    clearNote();
    hideResults();
    renderParticipants();
    if (mode === "manual") { renderManualPool(); renderManualCourts(); }
  }

  // ---- 매칭 모드 / 옵션 ----

  function switchMode(nextMode) {
    if (mode === nextMode) return;
    mode = nextMode;

    modeTabRandom.classList.toggle("is-active", mode === "random");
    modeTabRandom.setAttribute("aria-selected", mode === "random" ? "true" : "false");
    modeTabManual.classList.toggle("is-active", mode === "manual");
    modeTabManual.setAttribute("aria-selected", mode === "manual" ? "true" : "false");

    gradeModeRow.hidden = mode !== "random";
    gamesPerPersonRow.hidden = mode !== "random";
    courtCountRow.hidden = mode !== "random";
    randomPanel.hidden = mode !== "random";
    manualPanel.hidden = mode !== "manual";

    clearError();
    clearNote();
    hideResults();

    if (mode === "manual") {
      renderManualPool();
      renderManualCourts();
    }
  }

  // ---- 랜덤 매칭 알고리즘 ----

  function buildTeams(list) {
    var teams = [];
    for (var i = 0; i < list.length; i += 2) {
      teams.push([list[i], list[i + 1]]);
    }
    return teams;
  }

  function scorePartnerRepeat(teams) {
    var score = 0;
    teams.forEach(function (team) {
      if (sessionState.pairHistory.has(pairKey(team[0].id, team[1].id))) score += 2;
    });
    return score;
  }

  function scoreOpponentRepeat(teams) {
    var score = 0;
    for (var i = 0; i < teams.length; i += 2) {
      var teamA = teams[i];
      var teamB = teams[i + 1];
      if (!teamA || !teamB) continue;
      for (var x = 0; x < teamA.length; x++) {
        for (var y = 0; y < teamB.length; y++) {
          if (sessionState.opponentHistory.has(pairKey(teamA[x].id, teamB[y].id))) score += 1;
        }
      }
    }
    return score;
  }

  function generateArrangement(pool) {
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < ARRANGEMENT_ATTEMPTS; i++) {
      var teams = buildTeams(shuffle(pool));
      var score = scorePartnerRepeat(teams) + scoreOpponentRepeat(teams);
      if (score < bestScore) {
        best = teams;
        bestScore = score;
        if (bestScore === 0) break;
      }
    }
    return best;
  }

  function arrangeCourts(teams) {
    var best = teams;
    var bestScore = Infinity;
    for (var i = 0; i < ARRANGEMENT_ATTEMPTS; i++) {
      var order = shuffle(teams);
      var score = scoreOpponentRepeat(order);
      if (score < bestScore) {
        best = order;
        bestScore = score;
        if (bestScore === 0) break;
      }
    }
    return best;
  }

  function groupByGradeConcat(pool) {
    var groups = {};
    GRADE_ORDER.concat(["__none__"]).forEach(function (g) { groups[g] = []; });
    pool.forEach(function (p) { groups[gradeGroupKey(p)].push(p); });

    var result = [];
    GRADE_ORDER.concat(["__none__"]).forEach(function (g) {
      result = result.concat(shuffle(groups[g]));
    });
    return result;
  }

  function orderForMixedGrade(pool) {
    var sorted = pool.slice().sort(function (a, b) { return gradeRankForMix(a) - gradeRankForMix(b); });
    var result = [];
    var i = 0;
    var j = sorted.length - 1;
    while (i < j) {
      result.push(sorted[i]);
      result.push(sorted[j]);
      i++;
      j--;
    }
    if (i === j) result.push(sorted[i]);
    return result;
  }

  function formTeams(activePool, gradeMode) {
    if (activePool.length === 0) return [];
    if (gradeMode === "ignore") return generateArrangement(activePool);
    var ordered = gradeMode === "same" ? groupByGradeConcat(activePool) : orderForMixedGrade(activePool);
    var teams = buildTeams(ordered);
    return arrangeCourts(teams);
  }

  function generateArrangementMixed(males, females) {
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < ARRANGEMENT_ATTEMPTS; i++) {
      var shuffledM = shuffle(males);
      var shuffledF = shuffle(females);
      var teams = [];
      for (var k = 0; k < shuffledM.length; k++) teams.push([shuffledM[k], shuffledF[k]]);
      var score = scorePartnerRepeat(teams) + scoreOpponentRepeat(teams);
      if (score < bestScore) {
        best = teams;
        bestScore = score;
        if (bestScore === 0) break;
      }
    }
    return best;
  }

  function orderByGrade(pool, descending) {
    return pool.slice().sort(function (a, b) {
      return descending ? gradeRankForMix(b) - gradeRankForMix(a) : gradeRankForMix(a) - gradeRankForMix(b);
    });
  }

  function formTeamsMixed(activeM, activeF, gradeMode) {
    if (activeM.length === 0) return [];
    if (gradeMode === "ignore") return generateArrangementMixed(activeM, activeF);

    var orderedM, orderedF;
    if (gradeMode === "same") {
      orderedM = groupByGradeConcat(activeM);
      orderedF = groupByGradeConcat(activeF);
    } else {
      orderedM = orderByGrade(activeM, false);
      orderedF = orderByGrade(activeF, true);
    }

    var teams = [];
    for (var i = 0; i < orderedM.length; i++) teams.push([orderedM[i], orderedF[i]]);
    return arrangeCourts(teams);
  }

  function buildCourts(teams) {
    var courts = [];
    for (var i = 0; i < teams.length; i += 2) courts.push([teams[i], teams[i + 1]]);
    return courts;
  }

  function selectBenchGroup(pool, n) {
    if (n <= 0) return [];
    var items = shuffle(pool).map(function (p) {
      return { p: p, count: sessionState.benchCounts[p.id] || 0 };
    });
    items.sort(function (a, b) { return a.count - b.count; });
    return items.slice(0, n).map(function (item) { return item.p; });
  }

  function applyBench(list) {
    list.forEach(function (p) {
      sessionState.benchCounts[p.id] = (sessionState.benchCounts[p.id] || 0) + 1;
    });
  }

  function recordHistoryForCourt(court) {
    sessionState.pairHistory.add(pairKey(court.teamA[0], court.teamA[1]));
    sessionState.pairHistory.add(pairKey(court.teamB[0], court.teamB[1]));
    for (var x = 0; x < 2; x++) {
      for (var y = 0; y < 2; y++) {
        sessionState.opponentHistory.add(pairKey(court.teamA[x], court.teamB[y]));
      }
    }
  }

  function toIdCourts(courts) {
    return courts.map(function (court) {
      return { teamA: [court[0][0].id, court[0][1].id], teamB: [court[1][0].id, court[1][1].id] };
    });
  }

  function validateCount(n, label) {
    if (n < MIN_PARTICIPANTS) {
      showError(label + "을(를) 하려면 참가자가 최소 " + MIN_PARTICIPANTS + "명 필요해요 (현재 " + n + "명)");
      return false;
    }
    return true;
  }

  // pool을 검증하고, 매칭에 쓸 형태로 정리한다 (실제 코트 배정/휴식 선정은 라운드마다 별도로 수행)
  function resolveDoublesPools(doublesType, pool, groupTag) {
    var prefix = groupTag ? groupTag + ": " : "";

    if (doublesType === "all") {
      if (!validateCount(pool.length, prefix + "매칭")) return null;
      return { kind: "single", pool: pool };
    }

    if (doublesType === "male" || doublesType === "female") {
      var wantGender = doublesType === "male" ? "M" : "F";
      var label = doublesType === "male" ? "남자복식" : "여자복식";
      var genderPool = pool.filter(function (p) { return p.gender === wantGender; });
      var excludedUnset = pool.filter(function (p) { return !p.gender; }).length;
      if (!validateCount(genderPool.length, prefix + label)) return null;
      if (excludedUnset > 0) {
        showNote(prefix + "성별 미설정 참가자 " + excludedUnset + "명은 이번 " + label + " 매칭 대상에서 제외됐어요.");
      }
      return { kind: "single", pool: genderPool };
    }

    var males = pool.filter(function (p) { return p.gender === "M"; });
    var females = pool.filter(function (p) { return p.gender === "F"; });
    var excludedUnsetMixed = pool.filter(function (p) { return !p.gender; }).length;

    if (males.length < 2 || females.length < 2) {
      showError(prefix + "혼합복식은 남녀가 각각 최소 2명씩 필요해요 (현재 남 " + males.length + "명 / 여 " + females.length + "명)");
      return null;
    }
    if (excludedUnsetMixed > 0) {
      showNote(prefix + "성별 미설정 참가자 " + excludedUnsetMixed + "명은 이번 혼합복식 매칭 대상에서 제외됐어요.");
    }
    return { kind: "mixed", males: males, females: females };
  }

  // 라운드 하나(모든 코트 + 이번 라운드 휴식자)를 생성한다. 참가/휴식 히스토리는 세션 전체에서 누적된다.
  // courtLimit: null이면 인원이 허용하는 만큼 전부 사용, 숫자면 한 라운드에 그만큼만 동시 진행하고 나머지는 휴식
  function generateRoundForPool(resolved, gradeMode, courtLimit) {
    var benchList = [];
    var teams;

    if (resolved.kind === "single") {
      var active = resolved.pool;
      var remainder = active.length % 4;
      if (remainder > 0) {
        var remainderBench = selectBenchGroup(active, remainder);
        benchList = benchList.concat(remainderBench);
        var remainderIds = remainderBench.map(function (p) { return p.id; });
        active = active.filter(function (p) { return remainderIds.indexOf(p.id) === -1; });
      }

      if (courtLimit && active.length / 4 > courtLimit) {
        var overflow = active.length - courtLimit * 4;
        var overflowBench = selectBenchGroup(active, overflow);
        benchList = benchList.concat(overflowBench);
        var overflowIds = overflowBench.map(function (p) { return p.id; });
        active = active.filter(function (p) { return overflowIds.indexOf(p.id) === -1; });
      }

      applyBench(benchList);
      teams = formTeams(active, gradeMode);
    } else {
      var males = resolved.males;
      var females = resolved.females;
      var pairCount = Math.min(males.length, females.length);
      var activeM = males;
      var activeF = females;

      if (males.length > pairCount) {
        var excessM = selectBenchGroup(males, males.length - pairCount);
        var excessMIds = excessM.map(function (p) { return p.id; });
        activeM = males.filter(function (p) { return excessMIds.indexOf(p.id) === -1; });
        benchList = benchList.concat(excessM);
      } else if (females.length > pairCount) {
        var excessF = selectBenchGroup(females, females.length - pairCount);
        var excessFIds = excessF.map(function (p) { return p.id; });
        activeF = females.filter(function (p) { return excessFIds.indexOf(p.id) === -1; });
        benchList = benchList.concat(excessF);
      }

      if (pairCount % 2 === 1 && pairCount > 1) {
        var extraM = selectBenchGroup(activeM, 1)[0];
        var extraF = selectBenchGroup(activeF, 1)[0];
        activeM = activeM.filter(function (p) { return p.id !== extraM.id; });
        activeF = activeF.filter(function (p) { return p.id !== extraF.id; });
        benchList = benchList.concat([extraM, extraF]);
      }

      if (courtLimit && activeM.length / 2 > courtLimit) {
        var pairOverflow = activeM.length - courtLimit * 2;
        var overflowM = selectBenchGroup(activeM, pairOverflow);
        var overflowF = selectBenchGroup(activeF, pairOverflow);
        var overflowMIds = overflowM.map(function (p) { return p.id; });
        var overflowFIds = overflowF.map(function (p) { return p.id; });
        activeM = activeM.filter(function (p) { return overflowMIds.indexOf(p.id) === -1; });
        activeF = activeF.filter(function (p) { return overflowFIds.indexOf(p.id) === -1; });
        benchList = benchList.concat(overflowM, overflowF);
      }

      applyBench(benchList);
      teams = formTeamsMixed(activeM, activeF, gradeMode);
    }

    var idCourts = teams && teams.length ? toIdCourts(buildCourts(teams)) : [];
    idCourts.forEach(recordHistoryForCourt);

    return { courts: idCourts, benchedIds: benchList.map(function (p) { return p.id; }) };
  }

  // 최소 게임 수에 도달할 때까지 라운드를 반복 생성한다 (이미 있는 세션 내 휴식 순환 로직을 그대로 반복 적용)
  function generateSessionForPool(resolved, gradeMode, gamesPerPerson, poolIds, courtLimit) {
    var playCount = {};
    poolIds.forEach(function (id) { playCount[id] = 0; });

    var rounds = [];
    var safety = MAX_ROUNDS_PER_GROUP;

    while (safety-- > 0) {
      var round = generateRoundForPool(resolved, gradeMode, courtLimit);
      rounds.push(round);

      var benchedSet = {};
      round.benchedIds.forEach(function (id) { benchedSet[id] = true; });
      poolIds.forEach(function (id) {
        if (!benchedSet[id]) playCount[id] = (playCount[id] || 0) + 1;
      });

      var min = Math.min.apply(null, poolIds.map(function (id) { return playCount[id] || 0; }));
      if (min >= gamesPerPerson) break;
    }

    return rounds;
  }

  function generateMatches() {
    clearError();
    clearNote();

    var doublesType = doublesTypeSelect.value;
    var gradeMode = gradeModeSelect.value;
    var gamesPerPerson = Number(gamesPerPersonSelect.value) || 1;
    var courtLimit = courtCountSelect.value === "auto" ? null : Number(courtCountSelect.value);
    var grouped = isTeamMode();

    var groupsToRun = [];

    if (grouped) {
      var groupA = participants.filter(function (p) { return p.group === "A"; });
      var groupB = participants.filter(function (p) { return p.group === "B"; });
      var unassigned = participants.filter(function (p) { return !p.group; });

      if (unassigned.length > 0) {
        showError("그룹 미배정 참가자가 " + unassigned.length + "명 있어요. 모든 참가자를 A팀/B팀으로 배정하거나 '참가자 절반씩 자동 배정'을 눌러주세요.");
        return;
      }
      if (groupA.length > 0) groupsToRun.push({ label: "A팀", pool: groupA });
      if (groupB.length > 0) groupsToRun.push({ label: "B팀", pool: groupB });
      if (groupsToRun.length === 0) {
        showError("A팀/B팀에 배정된 참가자가 없어요.");
        return;
      }
    } else {
      groupsToRun.push({ label: null, pool: participants.slice() });
    }

    var sessionGroups = [];
    for (var i = 0; i < groupsToRun.length; i++) {
      var g = groupsToRun[i];
      var resolved = resolveDoublesPools(doublesType, g.pool, g.label);
      if (!resolved) return;
      var rounds = generateSessionForPool(resolved, gradeMode, gamesPerPerson, g.pool.map(function (p) { return p.id; }), courtLimit);
      sessionGroups.push({ label: g.label, rounds: rounds });
    }

    currentSession = {
      groups: sessionGroups,
      editable: true,
      settings: { gradeMode: gradeMode, doublesType: doublesType, gamesPerPerson: gamesPerPerson, courtLimit: courtLimit, grouped: grouped }
    };
    resultsSection.hidden = false;
    generateBtn.textContent = "다시 뽑기";
    renderBoard();
  }

  // ---- 결과 렌더링 (랜덤/수동 공용) ----

  function renderBoard() {
    boardEl.textContent = "";
    if (!currentSession) return;

    boardEl.appendChild(renderSessionSummary(currentSession));

    currentSession.groups.forEach(function (group, groupIndex) {
      if (group.label) {
        var heading = document.createElement("h3");
        heading.className = "session-group__title";
        heading.textContent = group.label;
        boardEl.appendChild(heading);
      }

      group.rounds.forEach(function (round, roundIndex) {
        if (group.rounds.length > 1) {
          var roundTitle = document.createElement("p");
          roundTitle.className = "session-round__title";
          roundTitle.textContent = (roundIndex + 1) + "라운드";
          boardEl.appendChild(roundTitle);
        }

        var grid = document.createElement("div");
        grid.className = "matchup-board";
        round.courts.forEach(function (court, courtIndex) {
          grid.appendChild(renderMatchupCard(court, courtIndex + 1, groupIndex, roundIndex, courtIndex));
        });
        boardEl.appendChild(grid);

        if (round.benchedIds.length > 0) {
          var names = round.benchedIds.map(function (id) {
            var p = byId(id);
            return p ? p.name : "";
          });
          var note = document.createElement("p");
          note.className = "waiting-note";
          note.textContent = currentSession.editable
            ? "이번 라운드 휴식: " + names.join(" · ") + " (게임 수가 고르게 배분되도록 순환 배정돼요)"
            : "이번 대진에 포함되지 않음: " + names.join(" · ");
          boardEl.appendChild(note);
        }
      });
    });
  }

  function renderSessionSummary(session) {
    var card = document.createElement("div");
    card.className = "session-summary";

    var totalCourts = 0;
    var stats = {}; // id -> { games, totalRounds } — totalRounds는 그 인원이 속한 그룹의 라운드 수 기준

    session.groups.forEach(function (group) {
      var scopedIds = {};
      group.rounds.forEach(function (round) {
        round.courts.forEach(function (court) {
          totalCourts++;
          court.teamA.concat(court.teamB).forEach(function (id) { scopedIds[id] = true; });
        });
        round.benchedIds.forEach(function (id) { scopedIds[id] = true; });
      });

      Object.keys(scopedIds).forEach(function (idStr) {
        var id = Number(idStr);
        stats[id] = stats[id] || { games: 0, totalRounds: 0 };
        stats[id].totalRounds += group.rounds.length;
      });

      group.rounds.forEach(function (round) {
        round.courts.forEach(function (court) {
          court.teamA.concat(court.teamB).forEach(function (id) {
            stats[id].games++;
          });
        });
      });
    });

    var roundLabel = session.groups.length > 1
      ? session.groups.map(function (g) { return g.label + " " + g.rounds.length + "라운드"; }).join(" · ")
      : String(session.groups[0].rounds.length);

    var statsRow = document.createElement("div");
    statsRow.className = "session-summary__stats";
    statsRow.appendChild(renderStat(roundLabel, session.groups.length > 1 ? "라운드" : "라운드 수"));
    statsRow.appendChild(renderStat(String(totalCourts), "총 경기 수"));
    card.appendChild(statsRow);

    var statIds = Object.keys(stats).map(Number);
    if (statIds.length > 0) {
      var countSection = document.createElement("div");
      countSection.className = "session-summary__section";
      var countHeading = document.createElement("p");
      countHeading.className = "session-summary__heading";
      countHeading.textContent = "인원별 경기 · 휴식 통계";
      countSection.appendChild(countHeading);
      countSection.appendChild(renderStatsTable(stats));
      card.appendChild(countSection);
    }

    var settingsSection = document.createElement("div");
    settingsSection.className = "session-summary__section";
    var settingsHeading = document.createElement("p");
    settingsHeading.className = "session-summary__heading";
    settingsHeading.textContent = "생성 조건";
    settingsSection.appendChild(settingsHeading);

    var settingsChips = document.createElement("div");
    settingsChips.className = "session-summary__chips";
    tagsForSettings(session.settings).forEach(function (text) {
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = text;
      settingsChips.appendChild(chip);
    });
    settingsSection.appendChild(settingsChips);
    card.appendChild(settingsSection);

    return card;
  }

  function renderStat(value, label) {
    var stat = document.createElement("div");
    stat.className = "session-summary__stat";
    var valueEl = document.createElement("span");
    valueEl.className = "session-summary__stat-value";
    valueEl.textContent = value;
    var labelEl = document.createElement("span");
    labelEl.className = "session-summary__stat-label";
    labelEl.textContent = label;
    stat.appendChild(valueEl);
    stat.appendChild(labelEl);
    return stat;
  }

  function renderStatsTable(stats) {
    var wrap = document.createElement("div");
    wrap.className = "session-summary__table-wrap";

    var table = document.createElement("table");
    table.className = "session-summary__table";

    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    ["이름", "급수", "연령대", "경기", "휴식"].forEach(function (text) {
      var th = document.createElement("th");
      th.textContent = text;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    participants.forEach(function (p) {
      var s = stats[p.id];
      if (!s) return;

      var row = document.createElement("tr");
      var nameTd = document.createElement("td");
      nameTd.textContent = p.name;
      var gradeTd = document.createElement("td");
      gradeTd.textContent = p.grade ? gradeLabel(p.grade) : "-";
      var ageTd = document.createElement("td");
      ageTd.textContent = p.age ? ageLabel(p.age) : "-";
      var gamesTd = document.createElement("td");
      gamesTd.className = "is-numeric";
      gamesTd.textContent = String(s.games);
      var restTd = document.createElement("td");
      restTd.textContent = String(s.totalRounds - s.games);

      row.appendChild(nameTd);
      row.appendChild(gradeTd);
      row.appendChild(ageTd);
      row.appendChild(gamesTd);
      row.appendChild(restTd);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    wrap.appendChild(table);
    return wrap;
  }

  function tagsForSettings(settings) {
    if (!settings) return ["직접 구성 (수동 매칭)"];
    return [
      GRADE_MODE_LABELS[settings.gradeMode],
      DOUBLES_TYPE_LABELS[settings.doublesType],
      "최소 " + settings.gamesPerPerson + "게임",
      settings.courtLimit ? "코트 " + settings.courtLimit + "개" : "코트 자동",
      settings.grouped ? "A/B 그룹 나누기" : null
    ].filter(Boolean);
  }

  // 팀 4명의 성별 구성으로 이 경기의 실제 복식 유형을 판별한다 (전체 모드에서는 매칭마다 구성이 달라질 수 있음)
  function matchDoublesLabel(teamA, teamB) {
    var all = teamA.concat(teamB);
    if (all.some(function (p) { return !p.gender; })) return null;

    if (all.every(function (p) { return p.gender === "M"; })) return "남자복식";
    if (all.every(function (p) { return p.gender === "F"; })) return "여자복식";

    function isMixedPair(team) {
      return (team[0].gender === "M" && team[1].gender === "F") || (team[0].gender === "F" && team[1].gender === "M");
    }
    if (isMixedPair(teamA) && isMixedPair(teamB)) return "혼합복식";

    return null;
  }

  function renderTeamBlock(players, isTeamB) {
    var team = document.createElement("div");
    team.className = "matchup-card__team" + (isTeamB ? " matchup-card__team--b" : "");
    players.forEach(function (p) {
      var playerRow = document.createElement("div");
      playerRow.className = "matchup-card__player";

      var nameEl = document.createElement("span");
      nameEl.textContent = p.name;
      playerRow.appendChild(nameEl);

      if (p.grade) {
        var gradeBadge = document.createElement("span");
        gradeBadge.className = "badge badge--grade";
        gradeBadge.textContent = gradeLabel(p.grade);
        playerRow.appendChild(gradeBadge);
      }

      if (p.gender) {
        var genderBadge = document.createElement("span");
        genderBadge.className = "badge " + (p.gender === "M" ? "badge--gender-m" : "badge--gender-f");
        genderBadge.textContent = p.gender === "M" ? "남" : "여";
        playerRow.appendChild(genderBadge);
      }

      team.appendChild(playerRow);
    });
    return team;
  }

  function renderMatchupCard(court, courtNumber, groupIndex, roundIndex, courtIndex) {
    var key = groupIndex + "-" + roundIndex + "-" + courtIndex;
    var teamA = court.teamA.map(byId);
    var teamB = court.teamB.map(byId);

    var card = document.createElement("article");
    card.className = "matchup-card";

    var header = document.createElement("div");
    header.className = "matchup-card__header";

    var headerLeft = document.createElement("div");
    headerLeft.className = "matchup-card__header-left";

    var label = document.createElement("p");
    label.className = "matchup-card__court";
    label.textContent = "코트 ";

    var courtNumberEl = document.createElement("span");
    courtNumberEl.className = "font-emphasis";
    courtNumberEl.textContent = String(courtNumber);
    label.appendChild(courtNumberEl);
    headerLeft.appendChild(label);

    var doublesLabel = matchDoublesLabel(teamA, teamB);
    if (doublesLabel) {
      var doublesChip = document.createElement("span");
      doublesChip.className = "matchup-card__doubles-chip";
      doublesChip.textContent = doublesLabel;
      headerLeft.appendChild(doublesChip);
    }

    header.appendChild(headerLeft);

    if (currentSession.editable) {
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "matchup-card__edit-btn";
      editBtn.dataset.key = key;
      editBtn.textContent = uiState.editingKey === key ? "닫기" : "수정";
      header.appendChild(editBtn);
    }

    card.appendChild(header);

    var row = document.createElement("div");
    row.className = "matchup-card__row";

    var vsBadge = document.createElement("span");
    vsBadge.className = "matchup-card__vs-badge";
    vsBadge.textContent = "VS";

    row.appendChild(renderTeamBlock(teamA, false));
    row.appendChild(vsBadge);
    row.appendChild(renderTeamBlock(teamB, true));
    card.appendChild(row);

    if (currentSession.editable && uiState.editingKey === key) {
      card.appendChild(renderSlotEditor(court, key, getRoundData(groupIndex, roundIndex)));
    }

    return card;
  }

  function getRoundData(groupIndex, roundIndex) {
    return currentSession.groups[groupIndex].rounds[roundIndex];
  }

  function renderSlotEditor(court, key, roundData) {
    var wrap = document.createElement("div");
    wrap.className = "matchup-card__slots";

    var slots = [
      { key: "teamA-0", label: "팀A", id: court.teamA[0] },
      { key: "teamA-1", label: "팀A", id: court.teamA[1] },
      { key: "teamB-0", label: "팀B", id: court.teamB[0] },
      { key: "teamB-1", label: "팀B", id: court.teamB[1] }
    ];

    slots.forEach(function (slot) {
      var p = byId(slot.id);
      var row = document.createElement("div");
      row.className = "matchup-card__slot-row";

      var text = document.createElement("span");
      text.textContent = slot.label + " · " + (p ? p.name : "");
      row.appendChild(text);

      if (roundData.benchedIds.length > 0) {
        var swapBtn = document.createElement("button");
        swapBtn.type = "button";
        swapBtn.className = "matchup-card__slot-swap";
        swapBtn.dataset.key = key;
        swapBtn.dataset.slotKey = slot.key;
        swapBtn.textContent = uiState.editingSlotKey === slot.key ? "취소" : "교체";
        row.appendChild(swapBtn);
      } else {
        var noneText = document.createElement("span");
        noneText.className = "bench-picker__empty";
        noneText.textContent = "교체 가능 인원 없음";
        row.appendChild(noneText);
      }

      wrap.appendChild(row);

      if (uiState.editingSlotKey === slot.key) {
        wrap.appendChild(renderBenchPicker(key, slot.key, roundData));
      }
    });

    return wrap;
  }

  function renderBenchPicker(key, slotKey, roundData) {
    var picker = document.createElement("div");
    picker.className = "bench-picker";

    roundData.benchedIds.forEach(function (id) {
      var p = byId(id);
      if (!p) return;
      var option = document.createElement("button");
      option.type = "button";
      option.className = "bench-picker__option";
      option.dataset.key = key;
      option.dataset.slotKey = slotKey;
      option.dataset.benchId = String(id);
      option.textContent = p.name;
      picker.appendChild(option);
    });

    return picker;
  }

  function swapSlot(key, slotKey, newId) {
    var parts = key.split("-");
    var groupIndex = Number(parts[0]);
    var roundIndex = Number(parts[1]);
    var courtIndex = Number(parts[2]);
    var roundData = getRoundData(groupIndex, roundIndex);
    var court = roundData.courts[courtIndex];

    var slotParts = slotKey.split("-");
    var teamKey = slotParts[0] === "teamA" ? "teamA" : "teamB";
    var slotIdx = Number(slotParts[1]);
    var oldId = court[teamKey][slotIdx];

    court[teamKey][slotIdx] = newId;
    roundData.benchedIds = roundData.benchedIds.filter(function (id) { return id !== newId; }).concat([oldId]);

    sessionState.benchCounts[newId] = Math.max(0, (sessionState.benchCounts[newId] || 0) - 1);
    sessionState.benchCounts[oldId] = (sessionState.benchCounts[oldId] || 0) + 1;

    recordHistoryForCourt(court);

    uiState.editingKey = null;
    uiState.editingSlotKey = null;
    renderBoard();
  }

  boardEl.addEventListener("click", function (event) {
    var editBtn = event.target.closest(".matchup-card__edit-btn");
    if (editBtn) {
      var key = editBtn.dataset.key;
      uiState.editingKey = uiState.editingKey === key ? null : key;
      uiState.editingSlotKey = null;
      renderBoard();
      return;
    }

    var swapBtn = event.target.closest(".matchup-card__slot-swap");
    if (swapBtn) {
      var slotKey = swapBtn.dataset.slotKey;
      uiState.editingSlotKey = uiState.editingSlotKey === slotKey ? null : slotKey;
      renderBoard();
      return;
    }

    var benchOption = event.target.closest(".bench-picker__option");
    if (benchOption) {
      swapSlot(benchOption.dataset.key, benchOption.dataset.slotKey, Number(benchOption.dataset.benchId));
      return;
    }
  });

  // ---- 수동 매칭 ----

  function assignedIdsInManual() {
    var ids = [];
    manualState.courts.forEach(function (court) {
      court.slots.forEach(function (id) { if (id !== null) ids.push(id); });
    });
    return ids;
  }

  function filterByDoublesTypeForDisplay(pool) {
    var doublesType = doublesTypeSelect.value;
    if (doublesType === "male") return pool.filter(function (p) { return p.gender === "M"; });
    if (doublesType === "female") return pool.filter(function (p) { return p.gender === "F"; });
    if (doublesType === "mixed") return pool.filter(function (p) { return p.gender === "M" || p.gender === "F"; });
    return pool;
  }

  function renderManualPool() {
    var assignedIds = assignedIdsInManual();
    var pool = filterByDoublesTypeForDisplay(participants.slice());

    if (manualSortByGrade) {
      pool.sort(function (a, b) { return gradeRankForSort(a) - gradeRankForSort(b); });
    }

    manualPoolCountEl.textContent = String(pool.length);
    manualPoolEl.textContent = "";

    pool.forEach(function (p) {
      var item = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "manual-pool__item";
      btn.dataset.id = String(p.id);

      if (assignedIds.indexOf(p.id) !== -1) btn.disabled = true;

      var text = p.name;
      if (p.grade) text += " · " + gradeLabel(p.grade);
      if (p.gender) text += " · " + (p.gender === "M" ? "남" : "여");
      if (p.group) text += " · " + groupLabel(p.group);
      btn.textContent = text;

      item.appendChild(btn);
      manualPoolEl.appendChild(item);
    });
  }

  function renderManualCourts() {
    manualCourtsEl.textContent = "";

    manualState.courts.forEach(function (court, courtIndex) {
      var card = document.createElement("div");
      card.className = "manual-court";

      var header = document.createElement("div");
      header.className = "manual-court__header";

      var title = document.createElement("span");
      title.className = "manual-court__title";
      title.textContent = "코트 " + (courtIndex + 1);

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "manual-court__remove";
      removeBtn.dataset.courtIndex = String(courtIndex);
      removeBtn.textContent = "삭제";

      header.appendChild(title);
      header.appendChild(removeBtn);
      card.appendChild(header);

      var teamsRow = document.createElement("div");
      teamsRow.className = "manual-court__teams";

      var teamA = renderManualTeam(court, courtIndex, [0, 1]);
      var vs = document.createElement("span");
      vs.className = "matchup-card__vs";
      vs.textContent = "VS";
      var teamB = renderManualTeam(court, courtIndex, [2, 3]);

      teamsRow.appendChild(teamA);
      teamsRow.appendChild(vs);
      teamsRow.appendChild(teamB);
      card.appendChild(teamsRow);

      manualCourtsEl.appendChild(card);
    });
  }

  function renderManualTeam(court, courtIndex, slotIndexes) {
    var team = document.createElement("div");
    team.className = "manual-court__team";

    slotIndexes.forEach(function (slotIndex) {
      var id = court.slots[slotIndex];
      var slot = document.createElement("button");
      slot.type = "button";
      slot.className = "manual-court__slot" + (id !== null ? " is-filled" : "");
      slot.dataset.courtIndex = String(courtIndex);
      slot.dataset.slotIndex = String(slotIndex);

      if (id !== null) {
        var p = byId(id);
        slot.textContent = p ? p.name : "";
      } else {
        slot.textContent = "빈 슬롯";
      }

      team.appendChild(slot);
    });

    return team;
  }

  function assignToNextEmptySlot(participantId) {
    for (var i = 0; i < manualState.courts.length; i++) {
      var slots = manualState.courts[i].slots;
      for (var s = 0; s < slots.length; s++) {
        if (slots[s] === null) {
          slots[s] = participantId;
          return true;
        }
      }
    }
    return false;
  }

  manualPoolEl.addEventListener("click", function (event) {
    var btn = event.target.closest(".manual-pool__item");
    if (!btn || btn.disabled) return;

    var id = Number(btn.dataset.id);
    var assigned = assignToNextEmptySlot(id);
    if (!assigned) {
      manualErrorEl.textContent = "빈 슬롯이 없어요. 코트를 먼저 추가해주세요.";
      manualErrorEl.hidden = false;
      return;
    }
    manualErrorEl.hidden = true;
    renderManualPool();
    renderManualCourts();
  });

  manualCourtsEl.addEventListener("click", function (event) {
    var removeBtn = event.target.closest(".manual-court__remove");
    if (removeBtn) {
      manualState.courts.splice(Number(removeBtn.dataset.courtIndex), 1);
      renderManualPool();
      renderManualCourts();
      return;
    }

    var slotBtn = event.target.closest(".manual-court__slot");
    if (slotBtn) {
      var courtIndex = Number(slotBtn.dataset.courtIndex);
      var slotIndex = Number(slotBtn.dataset.slotIndex);
      manualState.courts[courtIndex].slots[slotIndex] = null;
      renderManualPool();
      renderManualCourts();
      return;
    }
  });

  addCourtBtn.addEventListener("click", function () {
    manualState.courts.push({ slots: [null, null, null, null] });
    renderManualCourts();
  });

  manualSortToggle.addEventListener("click", function () {
    manualSortByGrade = !manualSortByGrade;
    manualSortToggle.classList.toggle("is-active", manualSortByGrade);
    manualSortToggle.textContent = manualSortByGrade ? "이름순 정렬" : "급수순 정렬";
    renderManualPool();
  });

  confirmManualBtn.addEventListener("click", function () {
    var completeCourts = manualState.courts.filter(function (court) {
      return court.slots.every(function (id) { return id !== null; });
    });
    var incompleteCount = manualState.courts.length - completeCourts.length;

    if (completeCourts.length === 0) {
      manualErrorEl.textContent = "완성된 코트가 없어요. 각 코트에 4명을 모두 배정한 뒤 확정해주세요.";
      manualErrorEl.hidden = false;
      return;
    }

    manualErrorEl.textContent = incompleteCount > 0
      ? incompleteCount + "개 코트는 슬롯이 다 채워지지 않아 이번 대진에서 제외됐어요."
      : "";
    manualErrorEl.hidden = incompleteCount === 0;

    var idCourts = completeCourts.map(function (court) {
      return { teamA: [court.slots[0], court.slots[1]], teamB: [court.slots[2], court.slots[3]] };
    });

    var assignedIds = [];
    idCourts.forEach(function (c) { assignedIds = assignedIds.concat(c.teamA, c.teamB); });
    var leftoverIds = participants
      .filter(function (p) { return assignedIds.indexOf(p.id) === -1; })
      .map(function (p) { return p.id; });

    currentSession = {
      groups: [{ label: null, rounds: [{ courts: idCourts, benchedIds: leftoverIds }] }],
      editable: false
    };
    resultsSection.hidden = false;
    renderBoard();
  });

  // ---- 이벤트 바인딩 ----

  addBtn.addEventListener("click", addParticipant);

  nameInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      addParticipant();
    }
  });

  listEl.addEventListener("click", function (event) {
    var removeTarget = event.target.closest(".participant-item__remove");
    if (removeTarget) {
      removeParticipant(Number(removeTarget.dataset.id));
      return;
    }
    var groupTarget = event.target.closest(".badge--group-toggle");
    if (groupTarget) {
      cycleGroup(Number(groupTarget.dataset.id));
      return;
    }
  });

  modeTabRandom.addEventListener("click", function () { switchMode("random"); });
  modeTabManual.addEventListener("click", function () { switchMode("manual"); });

  doublesTypeSelect.addEventListener("change", function () {
    if (mode === "manual") renderManualPool();
  });

  autoGroupSplitBtn.addEventListener("click", autoSplitGroups);

  function onGenerationModeChange() {
    var team = isTeamMode();
    genModeCards.forEach(function (card) {
      card.classList.toggle("is-selected", card.querySelector("input").checked);
    });
    groupSelect.hidden = !team;
    groupHintEl.hidden = !team;
    teamModePanel.hidden = !team;
    renderParticipants();
  }

  genModeNormalRadio.addEventListener("change", onGenerationModeChange);
  genModeTeamRadio.addEventListener("change", onGenerationModeChange);

  generateBtn.addEventListener("click", generateMatches);

  renderParticipants();
})();
