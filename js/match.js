(function () {
  "use strict";

  var GRADE_ORDER = ["S", "A", "B", "C", "D", "E", "F"];
  var GROUP_CYCLE = ["", "A", "B"];
  var GRADE_MODE_LABELS = { ignore: "급수 무시", same: "동일 급수끼리", mix: "급수 섞어서" };
  var DOUBLES_TYPE_LABELS = { all: "전체(성별 무관)", samegender: "성별별 복식", mixed: "혼합복식" };
  var MIN_PARTICIPANTS = 4;
  var ARRANGEMENT_ATTEMPTS = 30;
  var MAX_ROUNDS_PER_GROUP = 40;

  var participants = [];
  var nextId = 1;
  var mode = "random"; // 'random' | 'manual'
  var manualSortByGrade = false;
  var fixedPartners = []; // [[id, id], ...] — 매 라운드 같은 팀으로 묶을 참가자 쌍
  var fixedPartnerPending = null; // 고정 파트너 지정 중 먼저 클릭한 참가자 id

  var sessionState = { pairHistory: null, opponentHistory: null, benchCounts: null };
  var manualState = { courts: [] }; // { slots: [id|null, id|null, id|null, id|null] } (0-1: 팀A, 2-3: 팀B)

  // currentSession.groups: [{ label: 'A팀'|null, rounds: [{courts:[{teamA:[id,id],teamB:[id,id]}], benchedIds:[id...]}] }]
  var currentSession = null;
  var uiState = { editingKey: null, editingSlotKey: null, editingScoreKey: null, editingParticipantId: null, collapsedRounds: new Set() };

  resetSessionHistory();

  // DOM
  var nameInput = document.getElementById("participant-name");
  var gradeSelect = document.getElementById("participant-grade");
  var genderSelect = document.getElementById("participant-gender");
  var ageSelect = document.getElementById("participant-age");
  var groupSelect = document.getElementById("participant-group");
  var addBtn = document.getElementById("add-participant");
  var statsEl = document.getElementById("participant-stats");
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

  var fixedPartnerPanel = document.getElementById("fixed-partner-panel");
  var fixedPartnerHintEl = document.getElementById("fixed-partner-hint");
  var fixedPartnerPoolEl = document.getElementById("fixed-partner-pool");
  var fixedPartnerListEl = document.getElementById("fixed-partner-list");
  var fixedPartnerTagsEl = document.getElementById("fixed-partner-tags");

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

  function gradeBadgeClass(grade) {
    return grade ? "badge--grade-" + grade.toLowerCase() : "badge--grade";
  }

  function ageBadgeClass(age) {
    return age ? "badge--age-" + age : "badge--age";
  }

  function ageGradeLabel(p) {
    return (p.age || "") + (p.grade || "");
  }

  function ageGradeBadgeClass(p) {
    if (p.grade) return gradeBadgeClass(p.grade);
    if (p.age) return ageBadgeClass(p.age);
    return "badge--grade";
  }

  function groupLabel(group) {
    return group === "A" ? "A팀" : group === "B" ? "B팀" : "";
  }

  function isTeamMode() {
    return genModeTeamRadio.checked;
  }

  // 같은 급수 표기라도 성별·연령대에 따라 실제 체감 실력이 다르다는 피드백을 반영한 보정치.
  // 여성은 한 단계, 40대부터는 10살마다 한 단계씩 실력을 더 낮게(=S 쪽으로 가깝게) 본다.
  // 예: 남C=여D, 2030A=40B=50(A-2단계) — S보다 더 좋을 수는 없으니 0에서 멈춘다(clamp)
  function gradeAgeGenderStep(p) {
    var step = 0;
    if (p.gender === "F") step += 1;
    if (p.age) {
      step += Math.max(0, Math.floor((Number(p.age) - 30) / 10));
    }
    return step;
  }

  function effectiveGradeRank(p) {
    var rank = GRADE_ORDER.indexOf(p.grade) - gradeAgeGenderStep(p);
    return Math.max(0, rank);
  }

  function gradeRankForMix(p) {
    if (!p.grade) return 3.5;
    return effectiveGradeRank(p);
  }

  // 급수순 "정렬 표시" 전용 — 미설정은 섞어서 매칭(중간 취급)과 달리 항상 맨 뒤로 보낸다
  function gradeRankForSort(p) {
    if (!p.grade) return GRADE_ORDER.length;
    return GRADE_ORDER.indexOf(p.grade);
  }

  // "동일 급수" 매칭이 실제 표기가 아니라 보정된 실력 등급 기준으로 묶이도록 그룹 키도 보정치를 반영한다
  function gradeGroupKey(p) {
    if (!p.grade) return "__none__";
    return GRADE_ORDER[effectiveGradeRank(p)];
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
    uiState.editingScoreKey = null;
    generateBtn.textContent = "매칭하기";
    resetSessionHistory();
    manualState.courts = [];
    if (mode === "manual") {
      renderManualPool();
      renderManualCourts();
    }
  }

  // ---- 참가자 입력 ----

  function renderParticipantStats() {
    if (participants.length === 0) {
      statsEl.hidden = true;
      statsEl.textContent = "";
      return;
    }

    var chips = [{ text: "전체 " + participants.length + "명", className: "badge--total" }];

    var maleCount = participants.filter(function (p) { return p.gender === "M"; }).length;
    var femaleCount = participants.filter(function (p) { return p.gender === "F"; }).length;
    if (maleCount > 0) chips.push({ text: "남 " + maleCount + "명", className: "badge--gender-m" });
    if (femaleCount > 0) chips.push({ text: "여 " + femaleCount + "명", className: "badge--gender-f" });

    GRADE_ORDER.forEach(function (grade) {
      var count = participants.filter(function (p) { return p.grade === grade; }).length;
      if (count > 0) chips.push({ text: grade + "급 " + count + "명", className: gradeBadgeClass(grade) });
    });

    statsEl.textContent = "";
    chips.forEach(function (chip) {
      var chipEl = document.createElement("span");
      chipEl.className = "badge " + chip.className;
      chipEl.textContent = chip.text;
      statsEl.appendChild(chipEl);
    });
    statsEl.hidden = false;
  }

  function isInFixedPair(id) {
    return fixedPartners.some(function (pair) { return pair[0] === id || pair[1] === id; });
  }

  function renderFixedPartnerPanel() {
    fixedPartnerPoolEl.textContent = "";
    participants.forEach(function (p) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "fixed-partner__chip" + (fixedPartnerPending === p.id ? " is-picked" : "");
      chip.dataset.id = String(p.id);
      chip.textContent = p.name;
      if (isInFixedPair(p.id)) chip.disabled = true;
      fixedPartnerPoolEl.appendChild(chip);
    });

    fixedPartnerHintEl.textContent = fixedPartnerPending === null
      ? "매 라운드 같은 팀으로 묶을 첫 번째 참가자를 클릭하세요."
      : "파트너로 묶을 두 번째 참가자를 클릭하세요.";

    fixedPartnerTagsEl.textContent = "";
    fixedPartners.forEach(function (pair, index) {
      var a = byId(pair[0]);
      var b = byId(pair[1]);
      if (!a || !b) return;

      var tag = document.createElement("span");
      tag.className = "fixed-partner__tag";

      var label = document.createElement("span");
      label.textContent = a.name + " & " + b.name;
      tag.appendChild(label);

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "fixed-partner__tag-remove";
      removeBtn.dataset.index = String(index);
      removeBtn.setAttribute("aria-label", "고정 파트너 해제");
      removeBtn.textContent = "×";
      tag.appendChild(removeBtn);

      fixedPartnerTagsEl.appendChild(tag);
    });
    fixedPartnerListEl.hidden = fixedPartners.length === 0;
  }

  function renderParticipants() {
    renderParticipantStats();
    renderFixedPartnerPanel();
    listEl.textContent = "";

    if (participants.length === 0) {
      var empty = document.createElement("li");
      empty.className = "participant-list__empty";
      empty.textContent = "아직 참가자가 없어요. 위에서 이름을 입력하고 추가해보세요.";
      listEl.appendChild(empty);
      return;
    }

    participants.forEach(function (p) {
      if (uiState.editingParticipantId === p.id) {
        listEl.appendChild(renderParticipantEditItem(p));
        return;
      }

      var item = document.createElement("li");
      item.className = "participant-item";

      var main = document.createElement("div");
      main.className = "participant-item__main";

      var label = document.createElement("span");
      label.textContent = p.name;
      main.appendChild(label);

      if (p.grade) {
        var gradeBadge = document.createElement("span");
        gradeBadge.className = "badge " + gradeBadgeClass(p.grade);
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
        ageBadge.className = "badge " + ageBadgeClass(p.age);
        ageBadge.textContent = ageLabel(p.age);
        main.appendChild(ageBadge);
      }

      if (isTeamMode()) {
        var groupBadge = document.createElement("button");
        groupBadge.type = "button";
        groupBadge.className = "badge badge--group-toggle " + (p.group === "A" ? "badge--group-a" : p.group === "B" ? "badge--group-b" : "badge--group-unassigned");
        groupBadge.dataset.id = String(p.id);
        groupBadge.title = "클릭하면 그룹이 바뀌어요 (미배정→A팀→B팀)";
        groupBadge.textContent = p.group ? groupLabel(p.group) : "그룹 미배정";
        main.appendChild(groupBadge);
      }

      var actions = document.createElement("div");
      actions.className = "participant-item__actions";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "participant-item__edit";
      editBtn.dataset.id = String(p.id);
      editBtn.textContent = "수정";

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "participant-item__remove";
      removeBtn.dataset.id = String(p.id);
      removeBtn.textContent = "삭제";

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      item.appendChild(main);
      item.appendChild(actions);
      listEl.appendChild(item);
    });
  }

  function renderParticipantEditItem(p) {
    var item = document.createElement("li");
    item.className = "participant-item participant-item--editing";
    item.dataset.id = String(p.id);

    var fields = document.createElement("div");
    fields.className = "participant-item__edit-row";

    var nameField = document.createElement("input");
    nameField.type = "text";
    nameField.className = "text-input participant-item__edit-name";
    nameField.maxLength = 20;
    nameField.value = p.name;

    var ageField = ageSelect.cloneNode(true);
    ageField.removeAttribute("id");
    ageField.className = "select-input participant-item__edit-age";
    ageField.value = p.age || "";

    var gradeField = gradeSelect.cloneNode(true);
    gradeField.removeAttribute("id");
    gradeField.className = "select-input participant-item__edit-grade";
    gradeField.value = p.grade || "";

    var genderField = genderSelect.cloneNode(true);
    genderField.removeAttribute("id");
    genderField.className = "select-input participant-item__edit-gender";
    genderField.value = p.gender || "";

    fields.appendChild(nameField);
    fields.appendChild(ageField);
    fields.appendChild(gradeField);
    fields.appendChild(genderField);

    if (isTeamMode()) {
      var groupField = groupSelect.cloneNode(true);
      groupField.removeAttribute("id");
      groupField.removeAttribute("hidden");
      groupField.className = "select-input participant-item__edit-group";
      groupField.value = p.group || "";
      fields.appendChild(groupField);
    }

    var actions = document.createElement("div");
    actions.className = "participant-item__edit-actions";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-secondary btn-secondary--sm participant-item__save";
    saveBtn.dataset.id = String(p.id);
    saveBtn.textContent = "저장";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-secondary btn-secondary--sm participant-item__cancel";
    cancelBtn.textContent = "취소";

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    item.appendChild(fields);
    item.appendChild(actions);

    nameField.addEventListener("keydown", function (event) {
      if (event.key === "Enter") saveEditParticipant(p.id, item);
    });

    return item;
  }

  function startEditParticipant(id) {
    uiState.editingParticipantId = id;
    renderParticipants();
  }

  function cancelEditParticipant() {
    uiState.editingParticipantId = null;
    renderParticipants();
  }

  function saveEditParticipant(id, item) {
    var p = byId(id);
    if (!p) return;

    var name = item.querySelector(".participant-item__edit-name").value.trim();
    if (!name) return;

    p.name = name;
    p.age = item.querySelector(".participant-item__edit-age").value || null;
    p.grade = item.querySelector(".participant-item__edit-grade").value || null;
    p.gender = item.querySelector(".participant-item__edit-gender").value || null;
    var groupField = item.querySelector(".participant-item__edit-group");
    if (groupField) p.group = groupField.value || null;

    uiState.editingParticipantId = null;
    clearError();
    clearNote();
    hideResults();
    renderParticipants();
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
    fixedPartners = fixedPartners.filter(function (pair) { return pair[0] !== id && pair[1] !== id; });
    if (fixedPartnerPending === id) fixedPartnerPending = null;
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
    fixedPartnerPanel.hidden = mode !== "random";
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

  // 이번 라운드 풀 안에 고정 파트너 쌍이 둘 다 있으면 팀으로 확정하고, 나머지 인원만 반환한다
  function extractFixedTeams(pool) {
    var byIdMap = {};
    pool.forEach(function (p) { byIdMap[p.id] = p; });

    var forced = [];
    var used = {};
    fixedPartners.forEach(function (pair) {
      var a = byIdMap[pair[0]];
      var b = byIdMap[pair[1]];
      if (a && b && !used[a.id] && !used[b.id]) {
        forced.push([a, b]);
        used[a.id] = true;
        used[b.id] = true;
      }
    });

    var remainder = pool.filter(function (p) { return !used[p.id]; });
    return { forced: forced, remainder: remainder };
  }

  function formTeams(activePool, gradeMode) {
    if (activePool.length === 0) return [];

    var extracted = extractFixedTeams(activePool);
    var remainderTeams = [];
    if (extracted.remainder.length > 0) {
      if (gradeMode === "ignore") {
        remainderTeams = generateArrangement(extracted.remainder);
      } else {
        var ordered = gradeMode === "same" ? groupByGradeConcat(extracted.remainder) : orderForMixedGrade(extracted.remainder);
        remainderTeams = buildTeams(ordered);
      }
    }
    return arrangeCourts(extracted.forced.concat(remainderTeams));
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

  // 혼합복식 풀에서 고정 파트너 쌍(남1+여1) 확정 후 나머지 남/여만 반환한다
  function extractFixedTeamsMixed(males, females) {
    var maleById = {};
    males.forEach(function (p) { maleById[p.id] = p; });
    var femaleById = {};
    females.forEach(function (p) { femaleById[p.id] = p; });

    var forced = [];
    var usedM = {};
    var usedF = {};
    fixedPartners.forEach(function (pair) {
      var mId = maleById[pair[0]] ? pair[0] : (maleById[pair[1]] ? pair[1] : null);
      var fId = femaleById[pair[0]] ? pair[0] : (femaleById[pair[1]] ? pair[1] : null);
      if (mId !== null && fId !== null && mId !== fId && !usedM[mId] && !usedF[fId]) {
        forced.push([maleById[mId], femaleById[fId]]);
        usedM[mId] = true;
        usedF[fId] = true;
      }
    });

    var remainderM = males.filter(function (p) { return !usedM[p.id]; });
    var remainderF = females.filter(function (p) { return !usedF[p.id]; });
    return { forced: forced, remainderM: remainderM, remainderF: remainderF };
  }

  function formTeamsMixed(activeM, activeF, gradeMode) {
    if (activeM.length === 0) return [];

    var extracted = extractFixedTeamsMixed(activeM, activeF);
    var remainderTeams = [];
    if (extracted.remainderM.length > 0) {
      if (gradeMode === "ignore") {
        remainderTeams = generateArrangementMixed(extracted.remainderM, extracted.remainderF);
      } else {
        var orderedM, orderedF;
        if (gradeMode === "same") {
          orderedM = groupByGradeConcat(extracted.remainderM);
          orderedF = groupByGradeConcat(extracted.remainderF);
        } else {
          orderedM = orderByGrade(extracted.remainderM, false);
          orderedF = orderByGrade(extracted.remainderF, true);
        }
        for (var i = 0; i < orderedM.length; i++) remainderTeams.push([orderedM[i], orderedF[i]]);
      }
    }
    return arrangeCourts(extracted.forced.concat(remainderTeams));
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
      return {
        teamA: [court[0][0].id, court[0][1].id],
        teamB: [court[1][0].id, court[1][1].id],
        score: { a: null, b: null }
      };
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

    var resolveType = doublesType;
    if (doublesType === "samegender") {
      var splitGroups = [];
      for (var s = 0; s < groupsToRun.length; s++) {
        var base = groupsToRun[s];
        var prefix = base.label ? base.label + ": " : "";
        var malePool = base.pool.filter(function (p) { return p.gender === "M"; });
        var femalePool = base.pool.filter(function (p) { return p.gender === "F"; });
        var unsetCount = base.pool.filter(function (p) { return !p.gender; }).length;
        var maleOk = malePool.length >= MIN_PARTICIPANTS;
        var femaleOk = femalePool.length >= MIN_PARTICIPANTS;

        if (!maleOk && !femaleOk) {
          showError(prefix + "성별별 복식을 하려면 남자와 여자가 각각 최소 " + MIN_PARTICIPANTS + "명씩 있어야 해요 (현재 남 " + malePool.length + "명 / 여 " + femalePool.length + "명)");
          return;
        }
        if (!maleOk) {
          showNote(prefix + "남자 참가자가 " + malePool.length + "명이라 최소 " + MIN_PARTICIPANTS + "명에 못 미쳐요. 이번엔 남자복식을 진행하지 않아요.");
        }
        if (!femaleOk) {
          showNote(prefix + "여자 참가자가 " + femalePool.length + "명이라 최소 " + MIN_PARTICIPANTS + "명에 못 미쳐요. 이번엔 여자복식을 진행하지 않아요.");
        }
        if (unsetCount > 0) {
          showNote(prefix + "성별 미설정 참가자 " + unsetCount + "명은 이번 성별별 복식 매칭 대상에서 제외됐어요.");
        }

        var subPrefix = base.label ? base.label + " · " : "";
        if (maleOk) splitGroups.push({ label: subPrefix + "남자부", pool: malePool });
        if (femaleOk) splitGroups.push({ label: subPrefix + "여자부", pool: femalePool });
      }
      groupsToRun = splitGroups;
      resolveType = "all";
    }

    var sessionGroups = [];
    for (var i = 0; i < groupsToRun.length; i++) {
      var g = groupsToRun[i];
      var resolved = resolveDoublesPools(resolveType, g.pool, g.label);
      if (!resolved) return;
      var rounds = generateSessionForPool(resolved, gradeMode, gamesPerPerson, g.pool.map(function (p) { return p.id; }), courtLimit);
      sessionGroups.push({ label: g.label, rounds: rounds });
    }

    currentSession = {
      groups: sessionGroups,
      editable: true,
      settings: { gradeMode: gradeMode, doublesType: doublesType, gamesPerPerson: gamesPerPerson, courtLimit: courtLimit, grouped: grouped, fixedPartnerCount: fixedPartners.length }
    };
    uiState.collapsedRounds = new Set();
    sessionGroups.forEach(function (g, groupIndex) {
      for (var r = 1; r < g.rounds.length; r++) {
        uiState.collapsedRounds.add(groupIndex + "-" + r);
      }
    });
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
        var roundKey = groupIndex + "-" + roundIndex;
        var collapsed = uiState.collapsedRounds.has(roundKey);

        var roundBlock = document.createElement("div");
        roundBlock.className = "session-round";

        var roundHeader = document.createElement("button");
        roundHeader.type = "button";
        roundHeader.className = "session-round__header" + (collapsed ? " is-collapsed" : "");
        roundHeader.dataset.roundKey = roundKey;

        var roundTitle = document.createElement("span");
        roundTitle.className = "session-round__title";
        roundTitle.textContent = (roundIndex + 1) + "라운드";
        roundHeader.appendChild(roundTitle);

        var roundHeaderRight = document.createElement("span");
        roundHeaderRight.className = "session-round__header-right";

        var roundCount = document.createElement("span");
        roundCount.className = "session-round__count";
        roundCount.textContent = round.courts.length + "경기";
        roundHeaderRight.appendChild(roundCount);

        var roundChevron = document.createElement("span");
        roundChevron.className = "session-round__chevron";
        roundChevron.textContent = "▾";
        roundChevron.setAttribute("aria-hidden", "true");
        roundHeaderRight.appendChild(roundChevron);

        roundHeader.appendChild(roundHeaderRight);
        roundBlock.appendChild(roundHeader);

        var body = document.createElement("div");
        body.className = "session-round__body";
        body.hidden = collapsed;

        var grid = document.createElement("div");
        grid.className = "matchup-board";
        round.courts.forEach(function (court, courtIndex) {
          grid.appendChild(renderMatchupCard(court, courtIndex + 1, groupIndex, roundIndex, courtIndex));
        });
        body.appendChild(grid);

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
          body.appendChild(note);
        }

        roundBlock.appendChild(body);
        boardEl.appendChild(roundBlock);
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
      settings.grouped ? "A/B 그룹 나누기" : null,
      settings.fixedPartnerCount ? "고정 파트너 " + settings.fixedPartnerCount + "쌍" : null
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

  function isFixedPair(idA, idB) {
    return fixedPartners.some(function (pair) {
      return (pair[0] === idA && pair[1] === idB) || (pair[0] === idB && pair[1] === idA);
    });
  }

  // teamKey/court가 있으면(=수정 가능한 랜덤 매칭 결과) 참가자 한 명 한 명이 클릭 가능한 슬롯이 된다.
  // 같은 코트 안의 다른 참가자를 클릭하면 바로 자리를 맞바꾸고, 선택된 참가자는 다른 색으로 표시한다.
  function renderTeamBlock(players, isTeamB, isWinner, key, teamKey, isFixed) {
    var team = document.createElement("div");
    team.className = "matchup-card__team"
      + (isTeamB ? " matchup-card__team--b" : "")
      + (isWinner ? " matchup-card__team--winner" : "");

    if (isFixed) {
      var fixedBadge = document.createElement("span");
      fixedBadge.className = "matchup-card__fixed-badge";
      fixedBadge.textContent = "고정 파트너";
      team.appendChild(fixedBadge);
    }

    players.forEach(function (p, index) {
      var slotKey = teamKey + "-" + index;
      var playerRow = document.createElement("div");
      playerRow.className = "matchup-card__player";

      if (currentSession.editable) {
        playerRow.classList.add("matchup-card__player--clickable");
        playerRow.dataset.key = key;
        playerRow.dataset.slotKey = slotKey;
        if (uiState.editingKey === key && uiState.editingSlotKey === slotKey) {
          playerRow.classList.add("matchup-card__player--selected");
        }
      }

      var nameEl = document.createElement("span");
      nameEl.textContent = p.name;
      playerRow.appendChild(nameEl);

      if (p.grade || p.age) {
        var gradeBadge = document.createElement("span");
        gradeBadge.className = "badge " + ageGradeBadgeClass(p);
        gradeBadge.textContent = ageGradeLabel(p);
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
    card.appendChild(header);

    if (!court.score) court.score = { a: null, b: null };
    var hasScore = court.score.a !== null && court.score.b !== null;
    var aWins = hasScore && court.score.a > court.score.b;
    var bWins = hasScore && court.score.b > court.score.a;

    var row = document.createElement("div");
    row.className = "matchup-card__row";

    var vsBadge = document.createElement("span");
    vsBadge.className = "matchup-card__vs-badge";
    vsBadge.textContent = "VS";

    var teamAFixed = teamA.length === 2 && isFixedPair(teamA[0].id, teamA[1].id);
    var teamBFixed = teamB.length === 2 && isFixedPair(teamB[0].id, teamB[1].id);

    row.appendChild(renderTeamBlock(teamA, false, aWins, key, "teamA", teamAFixed));
    row.appendChild(vsBadge);
    row.appendChild(renderTeamBlock(teamB, true, bWins, key, "teamB", teamBFixed));
    card.appendChild(row);

    card.appendChild(renderScoreArea(court, key));

    if (currentSession.editable && uiState.editingKey === key && uiState.editingSlotKey) {
      card.appendChild(renderSwapPanel(key, getRoundData(groupIndex, roundIndex)));
    }

    return card;
  }

  // 스코어는 서버에 저장하지 않는 로컬 상태다 (court 객체에 직접 보관, 새로고침 시 초기화)
  // "점수" 버튼/텍스트를 누르면 입력 칸으로 바뀌고, 저장하면 다시 텍스트로 바뀌는 토글형 UI
  function renderScoreArea(court, key) {
    var wrap = document.createElement("div");
    wrap.className = "matchup-card__score-row";

    if (uiState.editingScoreKey === key) {
      var inputA = document.createElement("input");
      inputA.type = "text";
      inputA.inputMode = "numeric";
      inputA.className = "matchup-card__score-input";
      inputA.placeholder = "0";
      inputA.dataset.team = "a";
      inputA.setAttribute("aria-label", "팀 A 점수");
      if (court.score.a !== null) inputA.value = String(court.score.a);

      var sep = document.createElement("span");
      sep.className = "matchup-card__score-sep";
      sep.textContent = ":";

      var inputB = document.createElement("input");
      inputB.type = "text";
      inputB.inputMode = "numeric";
      inputB.className = "matchup-card__score-input";
      inputB.placeholder = "0";
      inputB.dataset.team = "b";
      inputB.setAttribute("aria-label", "팀 B 점수");
      if (court.score.b !== null) inputB.value = String(court.score.b);

      var saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "matchup-card__score-save";
      saveBtn.dataset.key = key;
      saveBtn.textContent = "저장";

      var cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "matchup-card__score-cancel";
      cancelBtn.dataset.key = key;
      cancelBtn.textContent = "취소";

      wrap.appendChild(inputA);
      wrap.appendChild(sep);
      wrap.appendChild(inputB);
      wrap.appendChild(saveBtn);
      wrap.appendChild(cancelBtn);
    } else {
      var hasScore = court.score.a !== null && court.score.b !== null;
      var toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "matchup-card__score-toggle" + (hasScore ? " matchup-card__score-toggle--filled" : "");
      toggleBtn.dataset.key = key;
      toggleBtn.textContent = hasScore ? "점수 " + court.score.a + " : " + court.score.b : "점수";
      wrap.appendChild(toggleBtn);
    }

    return wrap;
  }

  function getRoundData(groupIndex, roundIndex) {
    return currentSession.groups[groupIndex].rounds[roundIndex];
  }

  function getCourtByKey(key) {
    var parts = key.split("-");
    return getRoundData(Number(parts[0]), Number(parts[1])).courts[Number(parts[2])];
  }

  // 참가자를 클릭해 슬롯 하나를 선택한 상태에서 카드 아래에 노출되는 패널.
  // 휴식 인원과 교체하거나(기존과 동일), 위쪽에서 같은 코트의 다른 참가자를 클릭해 자리를 맞바꿀 수 있다.
  function renderSwapPanel(key, roundData) {
    var wrap = document.createElement("div");
    wrap.className = "matchup-card__slots";

    var hint = document.createElement("p");
    hint.className = "matchup-card__slot-hint";
    hint.textContent = roundData.benchedIds.length > 0
      ? "휴식 인원과 교체하거나, 위에서 같은 코트의 다른 참가자를 클릭해 자리를 바꾸세요."
      : "교체 가능한 휴식 인원은 없어요. 위에서 같은 코트의 다른 참가자를 클릭하면 자리를 바꿀 수 있어요.";
    wrap.appendChild(hint);

    if (roundData.benchedIds.length > 0) {
      wrap.appendChild(renderBenchPicker(key, uiState.editingSlotKey, roundData));
    }

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

  // 같은 코트 안에서 이미 배정된 두 참가자끼리 자리를 맞바꾼다 (휴식 인원 경유 없이 직접 교환)
  function swapWithinCourt(key, slotKeyA, slotKeyB) {
    var court = getCourtByKey(key);

    var a = slotKeyA.split("-");
    var b = slotKeyB.split("-");
    var teamAKey = a[0], idxA = Number(a[1]);
    var teamBKey = b[0], idxB = Number(b[1]);

    var temp = court[teamAKey][idxA];
    court[teamAKey][idxA] = court[teamBKey][idxB];
    court[teamBKey][idxB] = temp;

    recordHistoryForCourt(court);

    uiState.editingKey = null;
    uiState.editingSlotKey = null;
    renderBoard();
  }

  boardEl.addEventListener("click", function (event) {
    var roundHeaderBtn = event.target.closest(".session-round__header");
    if (roundHeaderBtn) {
      var roundKey = roundHeaderBtn.dataset.roundKey;
      if (uiState.collapsedRounds.has(roundKey)) {
        uiState.collapsedRounds.delete(roundKey);
      } else {
        uiState.collapsedRounds.add(roundKey);
      }
      renderBoard();
      return;
    }

    var playerTarget = event.target.closest(".matchup-card__player--clickable");
    if (playerTarget) {
      var pKey = playerTarget.dataset.key;
      var pSlotKey = playerTarget.dataset.slotKey;
      if (uiState.editingKey === pKey && uiState.editingSlotKey === pSlotKey) {
        uiState.editingKey = null;
        uiState.editingSlotKey = null;
      } else if (uiState.editingKey === pKey && uiState.editingSlotKey) {
        swapWithinCourt(pKey, uiState.editingSlotKey, pSlotKey);
        return;
      } else {
        uiState.editingKey = pKey;
        uiState.editingSlotKey = pSlotKey;
      }
      renderBoard();
      return;
    }

    var benchOption = event.target.closest(".bench-picker__option");
    if (benchOption) {
      swapSlot(benchOption.dataset.key, benchOption.dataset.slotKey, Number(benchOption.dataset.benchId));
      return;
    }

    var scoreToggle = event.target.closest(".matchup-card__score-toggle");
    if (scoreToggle) {
      uiState.editingScoreKey = scoreToggle.dataset.key;
      renderBoard();
      return;
    }

    var scoreCancel = event.target.closest(".matchup-card__score-cancel");
    if (scoreCancel) {
      uiState.editingScoreKey = null;
      renderBoard();
      return;
    }

    var scoreSave = event.target.closest(".matchup-card__score-save");
    if (scoreSave) {
      var scoreKey = scoreSave.dataset.key;
      var scoreRow = scoreSave.closest(".matchup-card__score-row");
      var inputA = scoreRow.querySelector('[data-team="a"]');
      var inputB = scoreRow.querySelector('[data-team="b"]');
      var numA = inputA.value === "" ? null : Number(inputA.value);
      var numB = inputB.value === "" ? null : Number(inputB.value);
      getCourtByKey(scoreKey).score = {
        a: numA !== null && !isNaN(numA) ? numA : null,
        b: numB !== null && !isNaN(numB) ? numB : null
      };
      uiState.editingScoreKey = null;
      renderBoard();
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
      return {
        teamA: [court.slots[0], court.slots[1]],
        teamB: [court.slots[2], court.slots[3]],
        score: { a: null, b: null }
      };
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
    uiState.collapsedRounds = new Set();
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
    var editTarget = event.target.closest(".participant-item__edit");
    if (editTarget) {
      startEditParticipant(Number(editTarget.dataset.id));
      return;
    }
    var saveTarget = event.target.closest(".participant-item__save");
    if (saveTarget) {
      saveEditParticipant(Number(saveTarget.dataset.id), saveTarget.closest(".participant-item"));
      return;
    }
    var cancelTarget = event.target.closest(".participant-item__cancel");
    if (cancelTarget) {
      cancelEditParticipant();
      return;
    }
  });

  modeTabRandom.addEventListener("click", function () { switchMode("random"); });
  modeTabManual.addEventListener("click", function () { switchMode("manual"); });

  doublesTypeSelect.addEventListener("change", function () {
    if (mode === "manual") renderManualPool();
  });

  autoGroupSplitBtn.addEventListener("click", autoSplitGroups);

  fixedPartnerPoolEl.addEventListener("click", function (event) {
    var chip = event.target.closest(".fixed-partner__chip");
    if (!chip || chip.disabled) return;
    var id = Number(chip.dataset.id);

    if (fixedPartnerPending === null) {
      fixedPartnerPending = id;
    } else if (fixedPartnerPending === id) {
      fixedPartnerPending = null;
    } else {
      fixedPartners.push([fixedPartnerPending, id]);
      fixedPartnerPending = null;
      hideResults();
    }
    renderFixedPartnerPanel();
  });

  fixedPartnerTagsEl.addEventListener("click", function (event) {
    var removeBtn = event.target.closest(".fixed-partner__tag-remove");
    if (!removeBtn) return;
    fixedPartners.splice(Number(removeBtn.dataset.index), 1);
    hideResults();
    renderFixedPartnerPanel();
  });

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

  // ---- 테스트 편의용 붙여넣기 일괄 추가 (여기서 })(); 직전까지 통째로 지우면 제거됨, match.html의 같은 주석 구간도 함께 지울 것) ----
  var AGE_VALUES = ["10", "20", "30", "40", "45", "50", "55", "60"];
  var pasteToggleBtn = document.getElementById("paste-import-toggle");
  var pastePanel = document.getElementById("paste-import-panel");
  var pasteInputEl = document.getElementById("paste-import-input");
  var pasteRunBtn = document.getElementById("paste-import-run");

  function normalizeGenderPaste(raw) {
    var v = (raw || "").trim();
    if (v === "남" || v === "남자" || v.toUpperCase() === "M") return "M";
    if (v === "여" || v === "여자" || v.toUpperCase() === "F") return "F";
    return null;
  }

  function normalizeGradePaste(raw) {
    var v = (raw || "").trim().toUpperCase().replace(/급$/, "");
    return GRADE_ORDER.indexOf(v) !== -1 ? v : null;
  }

  function normalizeAgePaste(raw) {
    var v = (raw || "").trim().replace(/\s*이상$/, "").replace(/(대|세)$/, "");
    return AGE_VALUES.indexOf(v) !== -1 ? v : null;
  }

  function runPasteImport() {
    var lines = pasteInputEl.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var added = 0;
    var skipped = 0;

    lines.forEach(function (line) {
      var cols = line.split("\t");
      var name = (cols[0] || "").trim();
      if (!name) { skipped++; return; }

      participants.push({
        id: nextId++,
        name: name,
        age: normalizeAgePaste(cols[1]),
        grade: normalizeGradePaste(cols[2]),
        gender: normalizeGenderPaste(cols[3]),
        group: null
      });
      added++;
    });

    pasteInputEl.value = "";
    clearError();
    clearNote();
    hideResults();
    renderParticipants();

    if (added > 0) {
      showNote(added + "명을 붙여넣기로 추가했어요." + (skipped > 0 ? " (" + skipped + "줄은 이름이 없어 건너뜀)" : ""));
    } else {
      showError("추가된 참가자가 없어요. 각 줄 첫 번째 칸에 이름이 있는지 확인해주세요.");
    }
  }

  pasteToggleBtn.addEventListener("click", function () {
    pastePanel.hidden = !pastePanel.hidden;
  });
  pasteRunBtn.addEventListener("click", runPasteImport);
  // ---- 붙여넣기 일괄 추가 끝 ----

  renderParticipants();
})();
