(function () {
  "use strict";

  var participants = [];

  var nameInput = document.getElementById("participant-name");
  var addBtn = document.getElementById("add-participant");
  var countEl = document.getElementById("participant-count");
  var listEl = document.getElementById("participant-list");
  var errorEl = document.getElementById("match-error");
  var generateBtn = document.getElementById("generate-match");
  var resultsSection = document.getElementById("match-results");
  var boardEl = document.getElementById("matchup-board");
  var waitingNoteEl = document.getElementById("waiting-note");

  var MIN_PARTICIPANTS = 4;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.textContent = "";
    errorEl.hidden = true;
  }

  function hideResults() {
    resultsSection.hidden = true;
    generateBtn.textContent = "매칭하기";
  }

  function renderParticipants() {
    countEl.textContent = String(participants.length);
    listEl.textContent = "";

    participants.forEach(function (name, index) {
      var item = document.createElement("li");
      item.className = "participant-item";

      var label = document.createElement("span");
      label.textContent = name;

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "participant-item__remove";
      removeBtn.dataset.index = String(index);
      removeBtn.textContent = "삭제";

      item.appendChild(label);
      item.appendChild(removeBtn);
      listEl.appendChild(item);
    });
  }

  function addParticipant() {
    var name = nameInput.value.trim();
    if (!name) {
      return;
    }
    participants.push(name);
    nameInput.value = "";
    nameInput.focus();
    clearError();
    hideResults();
    renderParticipants();
  }

  function removeParticipant(index) {
    participants.splice(index, 1);
    clearError();
    hideResults();
    renderParticipants();
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

  function buildTeams(names) {
    var teams = [];
    for (var i = 0; i < names.length; i += 2) {
      teams.push([names[i], names[i + 1]]);
    }
    return teams;
  }

  function buildCourts(teams) {
    var courts = [];
    var waitingTeam = null;
    for (var i = 0; i < teams.length; i += 2) {
      if (teams[i + 1]) {
        courts.push([teams[i], teams[i + 1]]);
      } else {
        waitingTeam = teams[i];
      }
    }
    return { courts: courts, waitingTeam: waitingTeam };
  }

  function renderMatchupCard(court, courtNumber) {
    var teamA = court[0];
    var teamB = court[1];

    var card = document.createElement("article");
    card.className = "matchup-card";

    var label = document.createElement("p");
    label.className = "matchup-card__court";
    label.textContent = "코트 ";

    var courtNumberEl = document.createElement("span");
    courtNumberEl.className = "font-emphasis";
    courtNumberEl.textContent = String(courtNumber);
    label.appendChild(courtNumberEl);

    var row = document.createElement("div");
    row.className = "matchup-card__row";

    var teamALabel = document.createElement("span");
    teamALabel.className = "team-label";
    teamALabel.textContent = teamA.join("/");

    var vs = document.createElement("span");
    vs.className = "matchup-card__vs";
    vs.textContent = "VS";

    var teamBLabel = document.createElement("span");
    teamBLabel.className = "team-label";
    teamBLabel.textContent = teamB.join("/");

    row.appendChild(teamALabel);
    row.appendChild(vs);
    row.appendChild(teamBLabel);

    card.appendChild(label);
    card.appendChild(row);

    return card;
  }

  function renderResults(courts, waitingTeam) {
    boardEl.textContent = "";
    courts.forEach(function (court, index) {
      boardEl.appendChild(renderMatchupCard(court, index + 1));
    });

    if (waitingTeam) {
      waitingNoteEl.textContent =
        "대기: " + waitingTeam.join(" · ") + " (짝을 이룰 상대가 없어 이번 대진에서 제외됐어요)";
      waitingNoteEl.hidden = false;
    } else {
      waitingNoteEl.hidden = true;
    }

    resultsSection.hidden = false;
    generateBtn.textContent = "다시 뽑기";
  }

  function generateMatches() {
    var count = participants.length;

    if (count < MIN_PARTICIPANTS) {
      showError("매칭을 하려면 참가자가 최소 " + MIN_PARTICIPANTS + "명 필요해요 (현재 " + count + "명)");
      return;
    }

    if (count % 2 !== 0) {
      showError("복식 매칭을 하려면 참가자 수가 짝수여야 해요 (현재 " + count + "명)");
      return;
    }

    clearError();
    var teams = buildTeams(shuffle(participants));
    var grouped = buildCourts(teams);
    renderResults(grouped.courts, grouped.waitingTeam);
  }

  addBtn.addEventListener("click", addParticipant);

  nameInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      addParticipant();
    }
  });

  listEl.addEventListener("click", function (event) {
    var target = event.target.closest(".participant-item__remove");
    if (!target) {
      return;
    }
    removeParticipant(Number(target.dataset.index));
  });

  generateBtn.addEventListener("click", generateMatches);
})();
