/**
 * Presenter Console View Controller (host-ui.js)
 * Coordinates inputs, CSV loading, dual-screen window launching, judging, and synchronization.
 */

function onReady(fn) {
  if (document.readyState !== 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}

onReady(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const isHostFile = window.location.pathname.endsWith('host.html');
  const isBoardFile = window.location.pathname.endsWith('board.html');
  const activeView = urlParams.get('view') || (isHostFile ? 'host' : (isBoardFile ? 'board' : 'host'));
  if (activeView !== 'host') return;

  // Elements - Setup Screen
  const setupContainer = document.getElementById('setup-container');
  const csvUploadInput = document.getElementById('csv-upload');
  const csvUploadTrigger = document.getElementById('csv-upload-trigger');
  const uploadStatus = document.getElementById('upload-status');
  const teamsCountSelect = document.getElementById('teams-count');
  const teamSetupRows = document.getElementById('team-setup-rows');
  const startGameBtn = document.getElementById('start-game-btn');

  // Elements - Active Dashboard
  const activeGameContainer = document.getElementById('active-game-container');
  const hostSidebar = document.getElementById('host-sidebar');
  const hostTeamList = document.getElementById('host-team-list');
  const hostRoundTitle = document.getElementById('host-round-title');
  const hostClueGrid = document.getElementById('host-clue-grid');
  
  // Elements - Clue Controller Drawer
  const hostClueController = document.getElementById('host-clue-controller');
  const controllerCategory = document.getElementById('controller-category');
  const controllerQuestion = document.getElementById('controller-question');
  const controllerAnswer = document.getElementById('controller-answer');
  const buzzerTeamsRow = document.getElementById('buzzer-teams-row');
  const hostClueCorrectBtn = document.getElementById('host-clue-correct-btn');
  const hostClueIncorrectBtn = document.getElementById('host-clue-incorrect-btn');
  const hostClueSkipBtn = document.getElementById('host-clue-skip-btn');
  const hostRevealAnswerBtn = document.getElementById('host-reveal-answer-btn');
  const quickScoreTeamsRow = document.getElementById('quick-score-teams-row');
  const quickScorePanel = document.getElementById('quick-score-panel');
  const buzzerActionPanel = document.getElementById('buzzer-action-panel');
  
  // Elements - Daily Double Panel
  const ddWagerPanel = document.getElementById('dd-wager-panel');
  const ddTeamSelect = document.getElementById('dd-team-select');
  const ddWagerInput = document.getElementById('dd-wager-input');
  const ddSubmitWagerBtn = document.getElementById('dd-submit-wager-btn');
  const ddWagerError = document.getElementById('dd-wager-error');

  // Elements - Sidebar controls
  const openBoardBtn = document.getElementById('open-board-btn');
  const resetGameBtn = document.getElementById('reset-game-btn');
  
  // Round Action buttons
  const btnGotoDouble = document.getElementById('btn-goto-double');
  const btnGotoFinal = document.getElementById('btn-goto-final');
  const btnGotoComplete = document.getElementById('btn-goto-complete');

  // Active state tracks for multiple wrong answers


  function getMaxClueValueOfRound() {
    return maxRoundClueValue() || (gameState.gamePhase === 'double_jeopardy' ? 2000 : 1000);
  }

  // Check if session can be recovered from storage immediately
  const recovered = loadStateFromStorage();
  if (recovered && gameState.gamePhase !== 'setup') {
    launchActiveDashboard();
  } else {
    // Standard setup layout init
    renderTeamSetupInputs();
    if (gameState.deck && (gameState.deck.singleJeopardy?.categories?.length > 0 || gameState.deck.finalJeopardy)) {
      const displayLabel = gameState.deckName ? `Active deck: ${gameState.deckName}` : 'Active game deck loaded.';
      uploadStatus.textContent = displayLabel;
      uploadStatus.style.color = 'var(--color-correct)';
      startGameBtn.disabled = false;
    }
  }

  // --- Settings & Synchronization Helpers ---
  function initSettingsUI() {
    const soundBtn = document.getElementById('host-sound-toggle-btn');
    const fontSlider = document.getElementById('host-font-scale-slider');
    const fontDisplay = document.getElementById('font-scale-display');
    
    if (!gameState.settings) {
      gameState.settings = {
        clueFontSizeMultiplier: 1.0,
        soundEnabled: true
      };
    }
    
    const settings = gameState.settings;
    for (const [id, key] of [['response-seconds', 'responseSeconds'], ['final-seconds', 'finalSeconds']]) {
      const input = document.getElementById(id); if (input) input.value = settings[key];
    }
    const effects = document.getElementById('low-effects');
    if (effects) effects.checked = settings.lowEffects;
    document.documentElement.classList.toggle('effects-simple', Boolean(settings.lowEffects));
    
    if (soundBtn) {
      soundBtn.textContent = settings.soundEnabled ? '🔊 On' : '🔇 Off';
      if (settings.soundEnabled) {
        soundBtn.classList.add('btn-accent');
        soundBtn.style.background = '';
      } else {
        soundBtn.classList.remove('btn-accent');
        soundBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      }
    }
    
    if (fontSlider) {
      fontSlider.value = settings.clueFontSizeMultiplier || 1.0;
    }
    if (fontDisplay) {
      fontDisplay.textContent = Math.round((settings.clueFontSizeMultiplier || 1.0) * 100) + '%';
    }
  }

  function renderEditTeamsPanel() {
    const container = document.getElementById('host-edit-teams-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (gameState.teams.length === 0) {
      container.innerHTML = '<p style="color: var(--color-text-muted); font-style: italic;">Register teams to edit them here.</p>';
      return;
    }
    
    gameState.teams.forEach((team, index) => {
      const row = document.createElement('div');
      
      row.innerHTML = `
        <div class="host-team-card-header">
          <span style="font-weight: bold; color: var(--color-accent);">Team ${index + 1}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="text" class="team-name-edit-input input-field" data-id="${team.id}" value="${escapeHTML(team.name)}">
          <input type="color" class="team-color-edit-input input-field" data-id="${team.id}" value="${escapeHTML(team.color)}">
        </div>
      `;
      
      const nameInput = row.querySelector('.team-name-edit-input');
      const colorInput = row.querySelector('.team-color-edit-input');
      
      const updateTeam = () => {
        team.name = nameInput.value.trim() || `Team ${index + 1}`;
        team.color = colorInput.value;
        publishChange('SYNC_STATE', null, true);
        renderSidebarScoreboards();
      };
      
      nameInput.addEventListener('input', updateTeam);
      colorInput.addEventListener('input', updateTeam);
      
      container.appendChild(row);
    });
  }

  let lastBoardContact = 0;
  const connectionStatus = document.getElementById('host-connection-status');
  const healthTimer = setInterval(() => {
    if (connectionStatus && lastBoardContact && Date.now() - lastBoardContact > 6000) connectionStatus.textContent = 'Board disconnected · open board to reconnect';
  }, 3000);
  window.addEventListener('pagehide', () => clearInterval(healthTimer), { once: true });
  function receiveBoardRequest(message, source = null) {
    if (message?.protocol !== 1 || message.role !== 'board' || message.action !== 'SYNC_REQUEST') return;
    if (message.sessionId && message.sessionId !== gameState.sessionId) return;
    if (source) directWindows.add(source);
    lastBoardContact = Date.now();
    if (connectionStatus) connectionStatus.textContent = 'Board connected';
    broadcastState(message.initial || message.deckId !== gameState.deck.id);
  }
  if (broadcastChannel) broadcastChannel.onmessage = event => receiveBoardRequest(event.data);
  window.addEventListener('message', event => {
    if (trustedWindowMessage(event)) receiveBoardRequest(event.data, event.source);
  });
  function broadcastState(fullSnapshot = false) {
    broadcastAction('SYNC_STATE', { fullSnapshot });
  }

  function publishChange(action = 'SYNC_STATE', payload = null, delayed = false) {
    (delayed ? scheduleSettingsSave : saveStateToStorage)();
    broadcastAction(action, payload);
  }

  // Wire settings element event listeners
  const hostSoundToggleBtn = document.getElementById('host-sound-toggle-btn');
  const hostFontScaleSlider = document.getElementById('host-font-scale-slider');
  const fontScaleDisplay = document.getElementById('font-scale-display');

  if (hostSoundToggleBtn) {
    hostSoundToggleBtn.addEventListener('click', () => {
      if (!gameState.settings) gameState.settings = {};
      gameState.settings.soundEnabled = !gameState.settings.soundEnabled;
      
      publishChange();
      initSettingsUI();
    });
  }

  if (hostFontScaleSlider) {
    hostFontScaleSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!gameState.settings) gameState.settings = {};
      gameState.settings.clueFontSizeMultiplier = val;
      
      if (fontScaleDisplay) {
        fontScaleDisplay.textContent = Math.round(val * 100) + '%';
      }
      
      publishChange('SYNC_STATE', null, true);
    });
  }

  const lowEffects = document.getElementById('low-effects');
  if (lowEffects) {
    lowEffects.checked = gameState.settings.lowEffects;
    lowEffects.addEventListener('change', () => {
      gameState.settings.lowEffects = lowEffects.checked;
      document.documentElement.classList.toggle('effects-simple', lowEffects.checked);
      publishChange('SYNC_STATE', null, true);
    });
    document.documentElement.classList.toggle('effects-simple', lowEffects.checked);
  }
  ['responseSeconds', 'finalSeconds'].forEach(setting => {
    const input = document.getElementById(setting === 'responseSeconds' ? 'response-seconds' : 'final-seconds');
    if (!input) return;
    input.value = gameState.settings[setting];
    input.addEventListener('change', () => {
      const seconds = parsePoints(input.value);
      if (seconds === null || seconds > 120) {
        input.value = gameState.settings[setting];
        document.getElementById('host-timer-status').textContent = 'Choose 1–120 seconds.';
        return;
      }
      gameState.settings[setting] = seconds;
      publishChange();
    });
  });
  const timerToggle = document.getElementById('timer-toggle');
  timerToggle?.addEventListener('click', () => {
    if (!toggleGameTimer()) return;
    publishChange(gameState.timer.paused ? 'PAUSE_TIMER' : 'RESUME_TIMER');
  });
  const timerDisplayInterval = setInterval(() => {
    const timer = gameState.timer;
    const remaining = timerRemaining();
    const status = document.getElementById('host-timer-status');
    if (timerToggle) { timerToggle.disabled = !timer || !remaining; timerToggle.textContent = timer?.paused ? 'Resume timer' : 'Pause timer'; }
    if (status) status.textContent = timer ? `${timer.paused ? 'Paused · ' : ''}${Math.ceil(remaining / 1000)} seconds` : 'Timer ready';
  }, 250);
  window.addEventListener('pagehide', () => clearInterval(timerDisplayInterval), { once: true });

  // Initialize Settings UI values
  initSettingsUI();

  // --- SETUP WORKFLOW ---

  // Trigger File Dialog on button click
  csvUploadTrigger.addEventListener('click', () => csvUploadInput.click());

  let importSequence = 0;
  function readDeckFile() {
    const file = csvUploadInput.files[0];
    if (!file) return;
    const sequence = ++importSequence;
    startGameBtn.disabled = true;
    const details = document.getElementById('import-details');
    const report = document.getElementById('import-report');
    const fail = message => {
      uploadStatus.textContent = 'Import failed. Correct the issues below and try again.';
      uploadStatus.style.color = 'var(--color-incorrect)';
      if (details) details.textContent = message;
      if (report) { report.hidden = false; report.open = true; }
    };
    if (file.size > 2 * 1024 * 1024) { fail('File exceeds the 2 MB limit.'); return; }
    uploadStatus.textContent = `Reading ${file.name}...`;
    const reader = new FileReader();
    reader.onerror = () => { if (sequence === importSequence) fail('The file could not be read. Please choose it again.'); };
    reader.onload = event => {
      if (sequence !== importSequence) return;
      try {
        const separator = document.getElementById('csv-delimiter')?.value;
        const deck = processCSVDeck(event.target.result, { delimiter: separator === 'tab' ? '\t' : separator });
        gameState.deck = deck;
        gameState.deckName = file.name;
        saveStateToStorage();
        uploadStatus.textContent = `Success! Loaded ${deck.importSummary.count} clues: ${file.name}`;
        uploadStatus.style.color = 'var(--color-correct)';
        const lines = ['singleJeopardy', 'doubleJeopardy'].flatMap(round => deck[round].categories.map(cat =>
          `${round === 'singleJeopardy' ? 'Single' : 'Double'} · ${cat.name}: ${cat.clues.length} clues ($${cat.clues.map(c => c.value).join(', $')})`));
        if (deck.finalJeopardy) lines.push(`Final · ${deck.finalJeopardy.category}`);
        lines.push(...deck.importSummary.warnings);
        if (details) details.textContent = lines.join('\n');
        if (report) { report.hidden = false; report.open = deck.importSummary.warnings.length > 0; }
        startGameBtn.disabled = false;
        refreshEditorButtons();
      } catch (error) { fail(error.message); }
    };
    reader.readAsText(file, document.getElementById('csv-encoding')?.value || 'utf-8');
  }
  csvUploadInput.addEventListener('change', readDeckFile);
  document.getElementById('csv-encoding')?.addEventListener('change', readDeckFile);
  document.getElementById('csv-delimiter')?.addEventListener('change', readDeckFile);

  // Render dynamic team rows based on selection
  teamsCountSelect.addEventListener('change', renderTeamSetupInputs);

  function renderTeamSetupInputs() {
    let count = parseInt(teamsCountSelect.value, 10);
    
    // If we have teams already registered in state, pre-fill select count once on initial render
    if (gameState.teams && gameState.teams.length > 0 && !teamSetupRows.dataset.populated) {
      count = gameState.teams.length;
      teamsCountSelect.value = count.toString();
      teamSetupRows.dataset.populated = "true";
    }

    teamSetupRows.innerHTML = '';

    const defaultColors = [
      '#3b82f6', // Team 1: Electric Blue
      '#ef4444', // Team 2: Soft Red
      '#f59e0b', // Team 3: Amber Yellow
      '#10b981'  // Team 4: Emerald Green
    ];

    for (let i = 0; i < count; i++) {
      const existingTeam = gameState.teams && gameState.teams[i];
      const nameVal = existingTeam ? existingTeam.name : `Team ${i+1}`;
      const colorVal = existingTeam ? existingTeam.color : (defaultColors[i] || '#ffffff');

      const row = document.createElement('div');
      row.className = 'form-group';
      row.style.display = 'flex';
      row.style.gap = '10px';
      row.style.alignItems = 'center';

      row.innerHTML = `
        <span style="font-weight: 700; color: var(--color-text-muted); font-size: 14px;">T${i+1}:</span>
        <input type="text" class="team-name-input" placeholder="Team ${i+1} Name" value="${escapeHTML(nameVal)}" style="flex-grow: 1;">
        <input type="color" class="team-color-input" value="${escapeHTML(colorVal)}" style="width: 50px; height: 42px; padding: 2px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-glass); border-radius: 8px; cursor: pointer;">
      `;
      teamSetupRows.appendChild(row);
    }
  }

  // Handle game kickoff
  startGameBtn.addEventListener('click', () => {
    const names = Array.from(teamSetupRows.querySelectorAll('.team-name-input')).map(input => input.value.trim());
    const colors = Array.from(teamSetupRows.querySelectorAll('.team-color-input')).map(input => input.value);
    
    gameState.teams = names.map((name, index) => ({
      id: index + 1,
      name: name || `Team ${index + 1}`,
      score: 0,
      color: colors[index]
    }));

    beginRound(availablePhases()[0]);
    
    // Purge active session state for a pristine start
    gameState.spentClues = [];
    gameState.currentClue = null;
    gameState.currentWager = null;
    gameState.activeBuzzedTeamId = null;

    publishChange();
    
    launchActiveDashboard();
  });

  // --- DASHBOARD WORKFLOWS ---

  function launchActiveDashboard() {
    setupContainer.style.display = 'none';
    activeGameContainer.style.display = 'grid';
    
    renderSidebarScoreboards();
    renderPresenterGrid();
    renderRoundTransitions();
    renderEditTeamsPanel(); // Initialize dynamic edit rows mid-game
    renderClueController();
  }

  function renderSidebarScoreboards() {
    renderHistoryControls();
    hostTeamList.innerHTML = '';
    
    gameState.teams.forEach(team => {
      const card = document.createElement('div');
      card.className = 'host-team-card';
      
      card.innerHTML = `
        <div class="host-team-card-header">
          <span style="font-weight: 700;">${escapeHTML(team.name)}</span>
          <span class="team-color-indicator" style="background-color: ${escapeHTML(team.color)};"></span>
        </div>
        <div class="score-adjuster">
          <button class="score-minus-btn" data-id="${team.id}">-</button>
          <input type="text" class="score-display-input" data-id="${team.id}" value="${team.score}">
          <button class="score-plus-btn" data-id="${team.id}">+</button>
        </div>
      `;
      
      // Hook up incremental/decremental controls
      card.querySelector('.score-minus-btn').addEventListener('click', () => adjustTeamScore(team.id, -100));
      card.querySelector('.score-plus-btn').addEventListener('click', () => adjustTeamScore(team.id, 100));
      
      const input = card.querySelector('.score-display-input');
      input.addEventListener('change', (e) => {
        const text = e.target.value.trim();
        const val = /^-?\d+$/.test(text) ? Number(text) : NaN;
        if (Number.isSafeInteger(val)) {
          recordGameChange(`Set ${team.name}'s score`, () => { team.score = val; return true; });
          publishChange();
          renderSidebarScoreboards();
        }
      });

      hostTeamList.appendChild(card);
    });
  }

  function adjustTeamScore(teamId, delta) {
    const team = gameState.teams.find(t => t.id === teamId);
    if (team) {
      if (!Number.isSafeInteger(team.score + delta)) return;
      recordGameChange(`Adjust ${team.name}'s score`, () => { team.score += delta; return true; });
      publishChange();
      renderSidebarScoreboards();
    }
  }

  function renderRoundTransitions() {
    refreshEditorButtons();
    const titles = {
      'single_jeopardy': 'Single Jeopardy',
      'double_jeopardy': 'Double Jeopardy',
      'final_jeopardy': 'Final Jeopardy',
      'completed': 'Completed'
    };
    hostRoundTitle.textContent = titles[gameState.gamePhase] || 'Jeopardy Console';

    btnGotoDouble.style.display = 'none';
    btnGotoFinal.style.display = 'none';
    btnGotoComplete.style.display = 'none';

    const next = nextGamePhase();
    const button = next === 'double_jeopardy' ? btnGotoDouble : next === 'final_jeopardy' ? btnGotoFinal : btnGotoComplete;
    button.style.display = 'block';
    button.disabled = Boolean(gameState.currentClue && gameState.gamePhase !== 'final_jeopardy') ||
      (gameState.gamePhase === 'final_jeopardy' && !finalJudgingComplete());
    if (gameState.gamePhase === 'completed') button.style.display = 'none';
  }

  btnGotoDouble.addEventListener('click', () => advanceRound('double_jeopardy'));
  btnGotoFinal.addEventListener('click', () => advanceRound('final_jeopardy'));
  btnGotoComplete.addEventListener('click', () => advanceRound('completed'));

  function advanceRound(nextPhase) {
    if (!beginRound(nextPhase)) return;
    publishChange('SET_PHASE', { gamePhase: nextPhase });
    hostClueController.style.display = 'none';
    renderActiveGameUI();
  }

  function renderActiveGameUI() {
    renderRoundTransitions();
    renderSidebarScoreboards();
    renderPresenterGrid();
    renderClueController();
  }

  function changeCategory(direction) {
    const categories = roundCategories();
    const next = gameState.categoryIntroIndex + direction;
    gameState.categoryIntroIndex = direction === 0 || next >= categories.length ? null : next;
    publishChange(); renderActiveGameUI();
  }
  function revealFinalClue() {
    // Validate all wagers
    const inputs = hostClueGrid.querySelectorAll('.final-wager-input');
    let valid = true;
    const wagerData = [];

    inputs.forEach(input => {
      const teamId = parseInt(input.dataset.teamId, 10);
      const team = gameState.teams.find(t => t.id === teamId);
      const wager = parsePoints(input.value, true);
      const errorDiv = document.getElementById(`error-team-${teamId}`);

      if (wager === null || wager > gameState.finalParticipants.find(p => p.teamId === teamId).startingScore) {
        if (errorDiv) {
          errorDiv.textContent = `Wager must be between $0 and $${team.score}.`;
          errorDiv.style.display = 'block';
        }
        valid = false;
        input.style.borderColor = 'var(--color-incorrect)';
      } else {
        if (errorDiv) {
          errorDiv.style.display = 'none';
        }
        input.style.borderColor = 'var(--border-glass)';
        wagerData.push({ teamId, wager });
      }
    });

    if (!valid) return;

    if (!gameState.deck.finalJeopardy) return;
    gameState.currentClue = gameState.deck.finalJeopardy;
    gameState.clueStage = 'answering';
    gameState.finalStage = 'judging';
    startGameTimer('final');
    // Save wagers to state
    wagerData.forEach(data => {
      const team = gameState.teams.find(t => t.id === data.teamId);
      team.finalWager = data.wager;
    });

    publishChange('SHOW_FINAL_CLUE', { clue: gameState.deck.finalJeopardy });

    // Redraw panel to Judging View
    renderActiveGameUI();
  }
  const gridActions = {
    'host-prev-category-btn': () => changeCategory(-1),
    'host-next-category-btn': () => changeCategory(1),
    'host-skip-categories-btn': () => changeCategory(0),
    'host-goto-complete-btn': () => advanceRound('completed'),
    'host-final-complete-btn': () => advanceRound('completed'),
    'host-reveal-clue-btn': revealFinalClue,
    'host-reveal-category-btn': () => {
      if (gameState.deck.finalJeopardy) {
        gameState.finalStage = 'category';
        publishChange('SHOW_FINAL_CATEGORY', { category: gameState.deck.finalJeopardy.category });
    }
    },
    'host-final-reveal-ans-btn': () => {
      if (gameState.deck.finalJeopardy) {
        gameState.answerVisible = true;
        publishChange('REVEAL_ANSWER', { answer: gameState.deck.finalJeopardy.answer });
    }
    }
  };


  function renderPresenterGrid() {
    hostClueGrid.innerHTML = '';
    
    // Category Introduction Step Reveal card
    if (gameState.categoryIntroIndex !== null && gameState.categoryIntroIndex !== undefined &&
        (gameState.gamePhase === 'single_jeopardy' || gameState.gamePhase === 'double_jeopardy')) {
      
      const categories = roundCategories();
        
      const idx = gameState.categoryIntroIndex;
      const activeCategory = categories[idx];
      
      if (activeCategory) {
        const isLastCategory = idx === categories.length - 1;
        
        hostClueGrid.style.gridTemplateColumns = '1fr'; // single full-width card
        
        const card = document.createElement('div');
        card.style.textAlign = 'center';
        card.style.padding = '40px';
        card.className = 'glass';
        
        card.innerHTML = `
          <h3 style="font-size: 20px; text-transform: uppercase; color: var(--color-accent); margin-bottom: 12px;">
            Category Introduction Phase
          </h3>
          <p style="font-size: 14px; color: var(--color-text-muted); margin-bottom: 24px;">
            Introduce each category to the audience. The spectator display is showing this category title in full screen.
          </p>
          <div class="glass" style="padding: 24px; display: inline-block; margin-bottom: 30px; border-color: var(--color-accent);">
            <h1 style="font-size: 32px; font-weight: 800; color: var(--color-text); text-transform: uppercase;">
              ${escapeHTML(activeCategory.name)}
            </h1>
            <div style="font-size: 14px; color: var(--color-text-muted); margin-top: 10px;">
              Category ${idx + 1} of ${categories.length}
            </div>
          </div>
          <div style="display: flex; justify-content: center; gap: 16px; align-items: center;">
            <button class="btn" id="host-prev-category-btn" style="padding: 12px 24px; font-size: 16px; background: rgba(255,255,255,0.05);" ${idx === 0 ? 'disabled' : ''}>
              ⬅️ Back
            </button>
            <button class="btn btn-accent" id="host-next-category-btn" style="padding: 12px 24px; font-size: 16px;">
              ${isLastCategory ? '🏁 Show Full Board' : '➡️ Next Category'}
            </button>
            <button class="btn" id="host-skip-categories-btn" style="padding: 12px 24px; font-size: 16px; background: rgba(255,255,255,0.05);">
              ⏭️ Skip All Introductions
            </button>
          </div>
        `;
        
        card.style.gridColumn = '1 / -1'; // Spans full width of the host clues layout
        hostClueGrid.appendChild(card);
        
        return;
      }
    }
    
    // Restore grid columns layout if standard clues grid rendering is active
    const activeCategories = roundCategories();
    const colCount = (activeCategories && activeCategories.length) || 5;
    hostClueGrid.style.gridTemplateColumns = `repeat(${colCount}, 1fr)`;

    if (gameState.gamePhase === 'final_jeopardy') {
      const eligibleTeams = gameState.finalParticipants.map(p => gameState.teams.find(t => t.id === p.teamId)).filter(Boolean);
      
      if (eligibleTeams.length === 0) {
        hostClueGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px;" class="glass">
            <h3 style="color: var(--color-incorrect); font-size: 24px; margin-bottom: 8px;">Final Jeopardy - No Eligible Teams</h3>
            <p style="color: var(--color-text-muted); margin-bottom: 20px;">All teams have $0 or negative scores. No one is eligible to participate.</p>
            <button class="btn btn-accent" id="host-goto-complete-btn">Advance to Game Completion</button>
          </div>
        `;

        return;
      }
      
      // If we are in the wager capture phase
      const wagersComplete = eligibleTeams.every(t => typeof t.finalWager === 'number');
      
      if (!wagersComplete) {
        // Capture Wagers View
        let rowsHtml = '';
        eligibleTeams.forEach(team => {
          rowsHtml += `
            <div style="display: flex; flex-direction: column; margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                <span style="font-weight: 600; color: ${escapeHTML(team.color)}; font-size: 16px;">${escapeHTML(team.name)}</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="color: var(--color-text-muted);">Max: $${gameState.finalParticipants.find(p => p.teamId === team.id).startingScore}</span>
                  <input type="number" class="final-wager-input" data-team-id="${team.id}" min="0" max="${gameState.finalParticipants.find(p => p.teamId === team.id).startingScore}" placeholder="Wager" style="width: 120px; padding: 8px; background: #000; border: 1px solid var(--border-glass); border-radius: 6px; color:#fff; text-align: center;">
                </div>
              </div>
              <div class="inline-error" id="error-team-${team.id}" style="color: var(--color-incorrect); font-size: 12px; margin-top: 6px; text-align: right; display: none;"></div>
            </div>
          `;
        });
        
        hostClueGrid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 30px; display: flex; flex-direction: column; gap: 20px;" class="glass">
            <div>
              <h3 style="color: var(--color-accent); font-size: 24px; margin-bottom: 4px;">Final Jeopardy - Wager Capture</h3>
              <p style="color: var(--color-text-muted); font-size: 14px;">Enter the secret wagers submitted by each team ($0 to their current score).</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 8px; max-width: 600px; width: 100%; margin: 0 auto;">
              ${rowsHtml}
            </div>
            
            <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
              <button class="btn btn-accent" id="host-reveal-category-btn">Reveal Category on Board</button>
              <button class="btn btn-correct" id="host-reveal-clue-btn">Reveal Clue & Start Countdown Music</button>
            </div>
          </div>
        `;


      } else {
        // Judging View
        let scoringHtml = '';
        eligibleTeams.forEach(team => {
          scoringHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: 8px; margin-bottom: 12px; gap: 15px;">
              <div>
                <span style="font-weight: 700; color: ${escapeHTML(team.color)}; font-size: 16px; display: block;">${escapeHTML(team.name)}</span>
                <span style="color: var(--color-text-muted); font-size: 13px;">Score: $${team.score} | Wager: $${team.finalWager}</span>
              </div>
              <div style="display: flex; gap: 8px;">
                ${gradingButtons(team)}
              </div>
            </div>
          `;
        });
        
        const allScored = eligibleTeams.every(t => typeof t.finalResult === 'string');
        
        hostClueGrid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 30px; display: flex; flex-direction: column; gap: 20px;" class="glass">
            <div>
              <h3 style="color: var(--color-accent); font-size: 24px; margin-bottom: 4px;">Final Jeopardy - Judging Panel</h3>
              <p style="color: var(--color-text-muted); font-size: 14px;">Reference the clue below and judge each team's final answer verbally or written.</p>
            </div>
            
            <div style="padding: 16px; background: rgba(0,0,0,0.2); border: 1px solid var(--border-glass); border-radius: 8px; margin-bottom: 10px;">
              <h4 style="text-transform: uppercase; font-size: 12px; color: var(--color-accent); margin-bottom: 6px;">Clue & Reference Answer</h4>
              <p style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">${escapeHTML(gameState.deck.finalJeopardy.question)}</p>
              <p style="font-size: 15px; color: var(--color-correct); font-weight: 700; margin: 0;">Answer: ${escapeHTML(gameState.deck.finalJeopardy.answer)}</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 8px; max-width: 700px; width: 100%; margin: 0 auto;">
              ${scoringHtml}
            </div>
            
            <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
              <button class="btn btn-accent" id="host-final-reveal-ans-btn">Reveal Answer on Board</button>
              <button class="btn btn-correct" id="host-final-complete-btn" ${!allScored ? 'disabled' : ''}>Complete Game Session</button>
            </div>
          </div>
        `;
        


        

      }
      return;
    }
    
    if (gameState.gamePhase === 'completed') {
      const sortedTeams = [...gameState.teams].sort((a, b) => b.score - a.score);
      const highestScore = sortedTeams[0] ? sortedTeams[0].score : 0;
      const champions = sortedTeams.filter(t => t.score === highestScore);
      const champNames = champions.map(c => c.name).join(' & ');
      
      hostClueGrid.style.gridTemplateColumns = '1fr';
      hostClueGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px;" class="glass">
          <h3 style="color: var(--color-correct); font-size: 32px; font-weight: 800; margin-bottom: 8px;">🏆 Match Completed!</h3>
          
          <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-glass); border-radius: 12px; padding: 24px 40px; max-width: 500px; width: 100%;">
            <span style="font-size: 14px; text-transform: uppercase; color: var(--color-text-muted); font-weight: 700; letter-spacing: 0.1em; display: block; margin-bottom: 8px;">Champion</span>
            <h4 style="font-size: 28px; font-weight: 800; color: #fff; margin-bottom: 8px;">${champNames || 'No Teams'}</h4>
            <span style="font-size: 24px; font-weight: 800; color: var(--color-correct);">$${highestScore}</span>
          </div>

          <p style="color: var(--color-text-muted); font-size: 14px; max-width: 400px; line-height: 1.5;">The spectator board has been updated with the Victory Podium and rankings.</p>
          
          <button id="host-reset-game-btn" class="btn btn-accent" style="padding: 12px 28px; font-size: 16px; margin-top: 10px;">
            Reset and Setup New Game
          </button>
        </div>
      `;
      
      // Bind reset click listener securely
      setTimeout(() => {
        const resetBtn = document.getElementById('host-reset-game-btn');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            if (confirm("Are you sure you want to reset and start a new game? This clears current scores but preserves the loaded CSV game deck in memory.")) {
              resetGameState();
              broadcastState(true);
              setTimeout(() => {
                window.location.reload();
              }, 150);
            }
          });
        }
      }, 50);
      return;
    }

    const categories = roundCategories();
      
    if (categories.length === 0) {
      hostClueGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">No categories available.</p>';
      return;
    }
    
    hostClueGrid.style.gridTemplateColumns = `repeat(${categories.length}, 1fr)`;

    // Draw header row titles
    categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'category-card';
      card.style.padding = '8px';
      card.style.borderStyle = 'dashed';
      card.innerHTML = `<span class="category-title" style="font-size: 14px;">${escapeHTML(cat.name)}</span>`;
      hostClueGrid.appendChild(card);
    });

    const maxCluesCount = Math.max(...categories.map(c => c.clues.length));
    
    for (let rowIndex = 0; rowIndex < maxCluesCount; rowIndex++) {
      categories.forEach(cat => {
        const clue = cat.clues[rowIndex];
        const card = document.createElement('div');
        
        if (clue) {
          const spentKey = clue.id;
          const isSpent = gameState.spentClues.includes(spentKey);
          
          card.className = `host-clue-card ${isSpent ? 'spent' : ''} ${clue.isDailyDouble ? 'daily-double' : ''}`;
          
          card.tabIndex = isSpent ? -1 : 0;
          card.setAttribute('role', 'button');
          card.setAttribute('aria-label', `${cat.name}, $${clue.value}`);
          card.setAttribute('aria-disabled', String(isSpent));
          card.dataset.catName = cat.name;
          card.dataset.rowIndex = rowIndex;
          
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="host-card-val">$${clue.value}</span>
              ${clue.isDailyDouble ? '<span style="font-size:10px; font-weight:700; color:var(--color-accent);">DD</span>' : ''}
            </div>
            <div class="host-card-category">${escapeHTML(cat.name)}</div>
            <div class="host-card-preview">${escapeHTML(clue.question)}</div>
          `;
        } else {
          card.className = 'host-clue-card spent';
        }
        
        hostClueGrid.appendChild(card);
      });
    }
  }

  /**
   * ACTIVATE CLUE CONTROL PANEL (JUDGING)
   */
  function activateClueControl(clue) {
    if (!openGameClue(clue)) return;
    publishChange('SHOW_CLUE', { clue });
    renderRoundTransitions();
    renderClueController();
    hostClueController.tabIndex = -1;
    hostClueController.focus({ preventScroll: true });
    hostClueController.scrollIntoView({ behavior: 'smooth' });
  }

  function renderClueController() {
    const clue = gameState.currentClue;
    if (!clue || gameState.gamePhase === 'final_jeopardy') { hostClueController.style.display = 'none'; return; }
    const categoryName = clue.category;
    controllerCategory.textContent = `${categoryName} - $${clue.value || 'Final'}`;
    controllerQuestion.textContent = clue.question;
    controllerAnswer.textContent = `Correct Answer: ${clue.answer}`;
    
    // Daily Double vs. Standard Clue check
    if (clue.isDailyDouble && gameState.clueStage === 'wager') {
      // Reveal Daily Double wagering panel
      ddWagerPanel.style.display = 'block';
      if (ddWagerError) {
        ddWagerError.style.display = 'none';
      }
      ddWagerInput.style.borderColor = 'var(--border-glass)';
      buzzerActionPanel.style.display = 'none';
      quickScorePanel.style.display = 'none';
      
      hostClueCorrectBtn.disabled = true;
      hostClueIncorrectBtn.disabled = true;
      
      // Populate wagering team selector
      ddTeamSelect.innerHTML = '';
      gameState.teams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        ddTeamSelect.appendChild(opt);
      });
      
    } else {
      ddWagerPanel.style.display = 'none';
      buzzerActionPanel.style.display = 'block';
      quickScorePanel.style.display = 'block';
      if (clue.isDailyDouble) renderDailyDoubleBuzzerButton(gameState.wageringTeamId);
      else renderBuzzerClaimButtons();
      renderQuickScoreButtons();
      hostClueCorrectBtn.disabled = !gameState.activeBuzzedTeamId;
      hostClueIncorrectBtn.disabled = !gameState.activeBuzzedTeamId;
    }
    
    hostClueController.style.display = 'flex';
  }

  if (ddWagerInput) {
    ddWagerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ddSubmitWagerBtn.click();
      }
    });
  }

  ddSubmitWagerBtn.addEventListener('click', () => {
    const teamId = parseInt(ddTeamSelect.value, 10);
    const team = gameState.teams.find(t => t.id === teamId);
    if (!team) {
      if (ddWagerError) {
        ddWagerError.textContent = "Please select a valid wagering team.";
        ddWagerError.style.display = 'block';
      }
      ddWagerInput.style.borderColor = 'var(--color-incorrect)';
      return;
    }
    
    const maxClueVal = getMaxClueValueOfRound();
    const maxAllowed = dailyDoubleLimit(team, maxClueVal);
    const minWager = 5;
    
    // Strip dollar signs, commas, whitespace, and decimal points to allow formats like "$1,000" or " $ 500 "

    const wager = parsePoints(ddWagerInput.value);
    
    if (wager === null || wager < minWager || wager > maxAllowed) {
      if (ddWagerError) {
        ddWagerError.textContent = `Invalid wager size. Daily Double wagers must be a minimum of $${minWager} and a maximum of $${maxAllowed} (which is the greater of the team's current score $${team.score} or the maximum clue value of this round $${maxClueVal}).`;
        ddWagerError.style.display = 'block';
      }
      ddWagerInput.style.borderColor = 'var(--color-incorrect)';
      return;
    }
    
    if (ddWagerError) {
      ddWagerError.style.display = 'none';
    }
    ddWagerInput.style.borderColor = 'var(--border-glass)';
    
    if (!setDailyDoubleWager(teamId, wager)) return;
    publishChange('SET_WAGER', { wager });
    
    ddWagerPanel.style.display = 'none';
    
    // Draw Buzzer buttons for the single wagering team
    buzzerActionPanel.style.display = 'block';
    quickScorePanel.style.display = 'block';
    renderDailyDoubleBuzzerButton(teamId);
    
    // Trigger the active buzzer state
    assignActiveBuzzerTeam(teamId);
    
    // Render the quick score buttons for the wagering team
    renderQuickScoreButtons();
  });

  function renderDailyDoubleBuzzerButton(teamId) {
    buzzerTeamsRow.innerHTML = '';
    const team = gameState.teams.find(t => t.id === teamId);
    if (team) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.setProperty('--color-primary', team.color);
      btn.style.borderColor = team.color;
      btn.style.color = '#fff';
      btn.textContent = `${team.name} is Answering`;
      buzzerTeamsRow.appendChild(btn);
    }
  }

  function renderQuickScoreButtons() {
    quickScoreTeamsRow.innerHTML = '';
    if (!gameState.currentClue) return;

    // Get the point value: either the wager amount or the clue's standard point value
    const clueVal = gameState.currentClue.isDailyDouble ? 
      gameState.currentWager : (gameState.currentClue.value || 0);

    if (gameState.gamePhase === 'final_jeopardy' || clueVal === 0) {
      quickScorePanel.style.display = 'none';
      return;
    }

    quickScoreTeamsRow.innerHTML = gameState.teams
      .filter(team => !gameState.currentClue.isDailyDouble || team.id === gameState.wageringTeamId)
      .map(team => `<div><span style="color: ${escapeHTML(team.color)};">${escapeHTML(team.name)}</span>${gradingButtons(team, clueVal)}</div>`).join('');
  }

  function gradingButtons(team, points = null) {
    const final = points === null;
    return ['correct', 'incorrect'].map((result, index) => {
      const active = final && team.finalResult === result;
      const classes = final ? `final-${result}-btn ${active ? 'active-grade' : ''}` : '';
      const style = final ? ` style="padding: 6px 16px; min-width: 90px; opacity: ${team.finalResult && !active ? 0.3 : 1};"` : '';
      const disabled = !final && gameState.lockedOutTeamIds.includes(team.id) ? ' disabled' : '';
      const label = final ? (index ? 'Incorrect' : 'Correct') : `${index ? '-' : '+'}$${points}`;
      return `<button class="btn btn-${result} ${classes}" data-team-id="${team.id}"${style}${disabled}>${label}</button>`;
    }).join('');
  }

  function judgeFinal(teamId, result) {
    if (!gradeFinal(teamId, result)) return;
    publishChange('RESOLVE_CLUE', { teams: gameState.teams, spentClues: gameState.spentClues,
      isCorrect: result === 'correct', isIncorrect: result === 'incorrect', keepOpen: true });
    renderActiveGameUI();
  }
  quickScoreTeamsRow.addEventListener('click', event => {
    const button = event.target.closest('button[data-team-id]');
    if (!button || button.disabled) return;
    submitGrade(Number(button.dataset.teamId), button.classList.contains('btn-correct') ? 'correct' : 'incorrect');
  });

  function submitGrade(teamId, result) {
    const resolution = gradeClue(teamId, result);
    if (!resolution) return;
    publishChange('RESOLVE_CLUE', { ...resolution, teams: gameState.teams, spentClues: gameState.spentClues });
    if (resolution.keepOpen) {
      hostClueCorrectBtn.disabled = true;
      hostClueIncorrectBtn.disabled = true;
      renderBuzzerClaimButtons();
      renderQuickScoreButtons();
      renderSidebarScoreboards();
    } else {
      hostClueController.style.display = 'none';
      renderActiveGameUI();
      hostClueGrid.querySelector('.host-clue-card:not(.spent)')?.focus();
    }
  }

  function renderBuzzerClaimButtons() {
    buzzerTeamsRow.innerHTML = '';
    
    gameState.teams.forEach(team => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      
      const isDisabled = gameState.lockedOutTeamIds.includes(team.id);
      if (isDisabled) btn.disabled = true;
      
      btn.style.setProperty('--color-primary', team.color);
      btn.style.borderColor = team.color;
      btn.style.color = '#fff';
      btn.textContent = team.name;
      btn.dataset.teamId = team.id;
      
      btn.addEventListener('click', () => assignActiveBuzzerTeam(team.id));
      buzzerTeamsRow.appendChild(btn);
    });
  }

  function assignActiveBuzzerTeam(teamId) {
    if (!gameState.currentClue || gameState.clueStage !== 'answering' || gameState.lockedOutTeamIds.includes(teamId)) return;
    if (gameState.currentClue.isDailyDouble && gameState.wageringTeamId !== teamId) return;
    gameState.activeBuzzedTeamId = teamId;
    startGameTimer('response');
    publishChange('SET_ACTIVE_TEAM', { teamId });
    
    // Highlight buzzed team button
    const buttons = buzzerTeamsRow.querySelectorAll('button');
    buttons.forEach(btn => {
      const teamObj = gameState.teams.find(t => t.id === Number(btn.dataset.teamId));
      if (teamObj && teamObj.id === teamId) {
        btn.style.backgroundColor = teamObj.color;
      } else {
        btn.style.backgroundColor = 'transparent';
      }
    });

    hostClueCorrectBtn.disabled = false;
    hostClueIncorrectBtn.disabled = false;
  }

  // --- JUDGING ACTIONS ---

  hostClueCorrectBtn.addEventListener('click', () => submitGrade(gameState.activeBuzzedTeamId, 'correct'));
  hostClueIncorrectBtn.addEventListener('click', () => submitGrade(gameState.activeBuzzedTeamId, 'incorrect'));
  hostClueSkipBtn.addEventListener('click', () => submitGrade(null, 'skip'));

  hostRevealAnswerBtn.addEventListener('click', () => {
    if (gameState.currentClue) {
      gameState.answerVisible = true;
      publishChange('REVEAL_ANSWER', { answer: gameState.currentClue.answer });
    }
  });

  function renderHistoryControls() {
    const undo = document.getElementById('undo-score'), redo = document.getElementById('redo-score');
    if (undo) undo.disabled = !gameState.undoStack.length;
    if (redo) redo.disabled = !gameState.redoStack.length;
    const status = document.getElementById('history-status');
    if (status) status.textContent = gameState.undoStack.at(-1)?.label || 'No scoring changes yet';
  }
  function restoreHistory(redo) {
    if (!(redo ? redoGameChange() : undoGameChange())) return;
    publishChange('RESTORE_GAME'); renderActiveGameUI();
  }
  document.getElementById('undo-score')?.addEventListener('click', () => restoreHistory(false));
  document.getElementById('redo-score')?.addEventListener('click', () => restoreHistory(true));
  document.getElementById('export-session')?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([exportSessionBackup()], { type: 'application/json' }));
    link.download = 'jeopardy-session.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  const sessionInput = document.getElementById('session-upload');
  ['restore-session', 'restore-session-setup'].forEach(id => document.getElementById(id)?.addEventListener('click', () => sessionInput.click()));
  sessionInput?.addEventListener('change', async () => {
    const file = sessionInput.files[0];
    const setStatus = text => ['session-status', 'setup-session-status'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = text; });
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Backup exceeds 5 MB.');
      const restored = parseSessionBackup(await file.text());
      if (restored.timer) { restored.timer.remaining = timerRemaining(restored.timer); restored.timer.paused = true; }
      Object.assign(gameState, restored);
      historyGeneration++;
      publishChange('SYNC_STATE', { fullSnapshot: true });
      if (gameState.gamePhase === 'setup') { activeGameContainer.style.display = 'none'; setupContainer.style.display = 'block'; renderTeamSetupInputs(); startGameBtn.disabled = false; }
      else { launchActiveDashboard(); initSettingsUI(); }
      setStatus('Session restored. Any active timer is paused.');
    } catch (error) { setStatus(error.message); }
    sessionInput.value = '';
  });

  // --- SIDEBAR UTILITIES ---

  // Launch Spectator board in secondary window
  openBoardBtn.addEventListener('click', () => {
    // In single-file/inline mode, the page name can be index.html or anything else.
    // If the path does not end with 'host.html', we assume we are in unified/routed mode and open the current page with '?view=board'.
    const target = window.location.pathname.endsWith('host.html') ? new URL('board.html', window.location.href) : new URL(window.location.href);
    target.searchParams.set('view', 'board');
    target.searchParams.set('session', gameState.sessionId);
    const win = window.open(target.href, 'jeopardy_board_display', 'width=1200,height=800');
    if (win) directWindows.add(win);
    else if (connectionStatus) connectionStatus.textContent = 'Popup blocked · allow popups and try again';
  });

  // Sidebar Reset Game Session click listener
  if (resetGameBtn) {
    resetGameBtn.addEventListener('click', () => {
      if (confirm("Are you sure you want to reset and start a new game? This clears current scores but preserves the loaded CSV game deck in memory.")) {
        resetGameState();
        broadcastState(true);
        setTimeout(() => {
          window.location.reload();
        }, 150);
      }
    });
  }

  initDeckEditor(() => {
    publishChange('SYNC_STATE', { fullSnapshot: true });
    if (gameState.gamePhase !== 'setup') renderActiveGameUI();
    else {
      uploadStatus.textContent = `Edited deck: ${gameState.deckName || 'game board'}`;
      document.getElementById('import-details').textContent = deckClues().map(({ clue }) => `${clue.category} · $${clue.value} · ${clue.question}`).join('\n');
      startGameBtn.disabled = false;
    }
  });
  hostClueGrid.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('.final-wager-input')) {
      event.preventDefault();
      const inputs = [...hostClueGrid.querySelectorAll('.final-wager-input')];
      const next = inputs[inputs.indexOf(event.target) + 1];
      if (next) next.focus(); else revealFinalClue();
    }
    if (['Enter', ' '].includes(event.key) && event.target.classList.contains('host-clue-card')) { event.preventDefault(); event.target.click(); }
  });
  document.addEventListener('keydown', event => {
    if (event.target.closest('input, textarea, select, [contenteditable="true"]') || document.getElementById('deck-editor').open) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); restoreHistory(event.shiftKey); return; }
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    const key = event.key.toLowerCase();
    if (/^[1-4]$/.test(key)) { const team = gameState.teams[Number(key) - 1]; if (team) assignActiveBuzzerTeam(team.id); }
    else if (key === 'c') hostClueCorrectBtn.click();
    else if (key === 'i') hostClueIncorrectBtn.click();
    else if (key === 'r') hostRevealAnswerBtn.click();
    else if (key === 's') hostClueSkipBtn.click();
    else if (key === 'p') timerToggle?.click();
  });

  // Centralized Event Delegation for clue card grid clicks
  hostClueGrid.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (button) {
      if (button.disabled) return;
      if (button.dataset.teamId) judgeFinal(Number(button.dataset.teamId), button.classList.contains('btn-correct') ? 'correct' : 'incorrect');
      else gridActions[button.id]?.();
      return;
    }
    // If the category introductions or final jeopardy captured are active, ignore
    if (gameState.categoryIntroIndex !== null && gameState.categoryIntroIndex !== undefined) return;
    if (gameState.gamePhase === 'final_jeopardy' || gameState.gamePhase === 'setup' || gameState.gamePhase === 'completed') return;
    
    const card = e.target.closest('.host-clue-card');
    if (!card || card.classList.contains('spent')) return;
    
    const catName = card.dataset.catName;
    const rowIndex = parseInt(card.dataset.rowIndex, 10);
    if (!catName || isNaN(rowIndex)) return;
    
    const categories = roundCategories();
      
    const cat = categories.find(c => c.name === catName);
    if (cat) {
      const clue = cat.clues[rowIndex];
      if (clue) {
        activateClueControl(clue, catName);
      }
    }
  });
});
