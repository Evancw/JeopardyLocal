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
  let disabledBuzzers = [];

  function getMaxClueValueOfRound() {
    let maxVal = 0;
    try {
      const isDouble = gameState.gamePhase === 'double_jeopardy';
      const categories = isDouble ? 
        gameState.deck?.doubleJeopardy?.categories : gameState.deck?.singleJeopardy?.categories;
      
      if (categories && Array.isArray(categories)) {
        categories.forEach(cat => {
          if (cat && cat.clues && Array.isArray(cat.clues)) {
            cat.clues.forEach(clue => {
              if (clue && typeof clue.value === 'number') {
                if (clue.value > maxVal) {
                  maxVal = clue.value;
                }
              }
            });
          }
        });
      }
    } catch (e) {
      console.warn("Could not calculate max clue value from deck:", e);
    }
    
    // Fallback values if none loaded/found
    if (maxVal === 0) {
      maxVal = gameState.gamePhase === 'double_jeopardy' ? 2000 : 1000;
    }
    return maxVal;
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
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.gap = '6px';
      row.style.padding = '8px';
      row.style.borderRadius = '6px';
      row.style.background = 'rgba(255, 255, 255, 0.03)';
      row.style.border = '1px solid var(--border-glass)';
      
      row.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: bold; color: var(--color-accent);">Team ${index + 1}</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="text" class="team-name-edit-input input-field" data-id="${team.id}" value="${team.name}" style="--input-pad: 4px 8px; --input-font: 12px; border-radius: 4px; flex: 1;">
          <input type="color" class="team-color-edit-input input-field" data-id="${team.id}" value="${team.color}" style="--input-width: 32px; --input-pad: 0; border-radius: 4px; height: 26px; background: none; cursor: pointer;">
        </div>
      `;
      
      const nameInput = row.querySelector('.team-name-edit-input');
      const colorInput = row.querySelector('.team-color-edit-input');
      
      const updateTeam = () => {
        team.name = nameInput.value.trim() || `Team ${index + 1}`;
        team.color = colorInput.value;
        saveStateToStorage();
        broadcastState();
        renderSidebarScoreboards();
      };
      
      nameInput.addEventListener('input', updateTeam);
      colorInput.addEventListener('input', updateTeam);
      
      container.appendChild(row);
    });
  }

  // --- Broadcast Channel sync request listener ---
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      const { action, payload } = event.data;
      if (action === 'SYNC_REQUEST') {
        console.log("Sync requested by spectator screen via BroadcastChannel. Broadcasting state...");
        broadcastState();
      } else if (action === 'SYNC_STATE' && payload && payload.state) {
        // Bi-directional state sync (e.g. from spectator sound toggle)
        if (payload.state.settings) {
          Object.assign(gameState.settings, payload.state.settings);
          initSettingsUI();
        }
      }
    };
  }

  // Direct Window message listener for offline file:// fallback
  window.addEventListener('message', (event) => {
    const { action, payload } = event.data || {};
    if (action === 'SYNC_REQUEST') {
      console.log("Sync requested by spectator screen via window message. Registering window...");
      if (event.source) {
        directWindows.add(event.source);
      }
      broadcastState();
    } else if (action === 'SYNC_STATE' && payload && payload.state) {
      // Bi-directional state sync (e.g. from spectator sound toggle)
      if (payload.state.settings) {
        Object.assign(gameState.settings, payload.state.settings);
        initSettingsUI();
      }
    }
  });

  function broadcastState() {
    const syncPayload = { ...gameState };
    delete syncPayload.deck;
    broadcastAction('SYNC_STATE', { state: syncPayload });
  }

  // Wire settings element event listeners
  const hostSoundToggleBtn = document.getElementById('host-sound-toggle-btn');
  const hostFontScaleSlider = document.getElementById('host-font-scale-slider');
  const fontScaleDisplay = document.getElementById('font-scale-display');

  if (hostSoundToggleBtn) {
    hostSoundToggleBtn.addEventListener('click', () => {
      if (!gameState.settings) gameState.settings = {};
      gameState.settings.soundEnabled = !gameState.settings.soundEnabled;
      
      saveStateToStorage();
      broadcastState();
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
      
      saveStateToStorage();
      broadcastState();
    });
  }

  // Initialize Settings UI values
  initSettingsUI();

  // --- SETUP WORKFLOW ---

  // Trigger File Dialog on button click
  csvUploadTrigger.addEventListener('click', () => csvUploadInput.click());

  csvUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    uploadStatus.textContent = `Reading ${file.name}...`;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const deck = processCSVDeck(event.target.result);
        gameState.deck = deck;
        gameState.deckName = file.name;
        saveStateToStorage();
        uploadStatus.textContent = `Success! Loaded: ${file.name}`;
        uploadStatus.style.color = 'var(--color-correct)';
        startGameBtn.disabled = false;
      } catch (err) {
        console.error(err);
        uploadStatus.textContent = `Error: ${err.message}`;
        uploadStatus.style.color = 'var(--color-incorrect)';
        startGameBtn.disabled = true;
      }
    };
    reader.readAsText(file);
  });

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
        <input type="text" class="team-name-input" placeholder="Team ${i+1} Name" value="${nameVal}" style="flex-grow: 1;">
        <input type="color" class="team-color-input" value="${colorVal}" style="width: 50px; height: 42px; padding: 2px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-glass); border-radius: 8px; cursor: pointer;">
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

    gameState.gamePhase = 'single_jeopardy';
    gameState.categoryIntroIndex = 0;
    
    // Purge active session state for a pristine start
    gameState.spentClues = [];
    gameState.currentClue = null;
    gameState.currentWager = null;
    gameState.activeBuzzedTeamId = null;

    saveStateToStorage();
    broadcastState();
    
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
  }

  function renderSidebarScoreboards() {
    hostTeamList.innerHTML = '';
    
    gameState.teams.forEach(team => {
      const card = document.createElement('div');
      card.className = 'host-team-card';
      
      card.innerHTML = `
        <div class="host-team-card-header">
          <span style="font-weight: 700;">${team.name}</span>
          <span class="team-color-indicator" style="background-color: ${team.color};"></span>
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
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
          team.score = val;
          saveStateToStorage();
          broadcastState();
          renderSidebarScoreboards();
        }
      });

      hostTeamList.appendChild(card);
    });
  }

  function adjustTeamScore(teamId, delta) {
    const team = gameState.teams.find(t => t.id === teamId);
    if (team) {
      team.score += delta;
      saveStateToStorage();
      broadcastState();
      renderSidebarScoreboards();
    }
  }

  function renderRoundTransitions() {
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

    if (gameState.gamePhase === 'single_jeopardy') {
      btnGotoDouble.style.display = 'block';
    } else if (gameState.gamePhase === 'double_jeopardy') {
      btnGotoFinal.style.display = 'block';
    } else if (gameState.gamePhase === 'final_jeopardy') {
      btnGotoComplete.style.display = 'block';
    }
  }

  btnGotoDouble.addEventListener('click', () => advanceRound('double_jeopardy'));
  btnGotoFinal.addEventListener('click', () => advanceRound('final_jeopardy'));
  btnGotoComplete.addEventListener('click', () => advanceRound('completed'));

  function advanceRound(nextPhase) {
    gameState.gamePhase = nextPhase;
    gameState.currentClue = null;
    gameState.currentWager = null;
    gameState.activeBuzzedTeamId = null;
    
    if (nextPhase === 'single_jeopardy' || nextPhase === 'double_jeopardy') {
      gameState.categoryIntroIndex = 0;
    } else {
      gameState.categoryIntroIndex = null;
    }
    
    gameState.teams.forEach(t => {
      delete t.finalWager;
      delete t.finalResult;
    });
    
    saveStateToStorage();
    
    // Broadcast round advanced state
    broadcastAction('SET_PHASE', { gamePhase: nextPhase });
    
    hostClueController.style.display = 'none';
    renderActiveGameUI();
  }

  function renderActiveGameUI() {
    renderRoundTransitions();
    renderSidebarScoreboards();
    renderPresenterGrid();
  }

  function renderPresenterGrid() {
    hostClueGrid.innerHTML = '';
    
    // Category Introduction Step Reveal card
    if (gameState.categoryIntroIndex !== null && gameState.categoryIntroIndex !== undefined &&
        (gameState.gamePhase === 'single_jeopardy' || gameState.gamePhase === 'double_jeopardy')) {
      
      const categories = gameState.gamePhase === 'double_jeopardy' ? 
        gameState.deck.doubleJeopardy.categories : gameState.deck.singleJeopardy.categories;
        
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
              ${activeCategory.name}
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
        
        // Wire controls
        if (idx > 0) {
          document.getElementById('host-prev-category-btn').addEventListener('click', () => {
            gameState.categoryIntroIndex--;
            saveStateToStorage();
            broadcastState();
            renderActiveGameUI();
          });
        }
        
        document.getElementById('host-next-category-btn').addEventListener('click', () => {
          if (isLastCategory) {
            gameState.categoryIntroIndex = null;
          } else {
            gameState.categoryIntroIndex++;
          }
          saveStateToStorage();
          broadcastState();
          renderActiveGameUI();
        });
        
        document.getElementById('host-skip-categories-btn').addEventListener('click', () => {
          gameState.categoryIntroIndex = null;
          saveStateToStorage();
          broadcastState();
          renderActiveGameUI();
        });
        
        return;
      }
    }
    
    // Restore grid columns layout if standard clues grid rendering is active
    const activeCategories = gameState.gamePhase === 'double_jeopardy' ? 
      gameState.deck?.doubleJeopardy?.categories : gameState.deck?.singleJeopardy?.categories;
    const colCount = (activeCategories && activeCategories.length) || 5;
    hostClueGrid.style.gridTemplateColumns = `repeat(${colCount}, 1fr)`;

    if (gameState.gamePhase === 'final_jeopardy') {
      const eligibleTeams = gameState.teams.filter(t => t.score > 0);
      
      if (eligibleTeams.length === 0) {
        hostClueGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px;" class="glass">
            <h3 style="color: var(--color-incorrect); font-size: 24px; margin-bottom: 8px;">Final Jeopardy - No Eligible Teams</h3>
            <p style="color: var(--color-text-muted); margin-bottom: 20px;">All teams have $0 or negative scores. No one is eligible to participate.</p>
            <button class="btn btn-accent" id="host-goto-complete-btn">Advance to Game Completion</button>
          </div>
        `;
        document.getElementById('host-goto-complete-btn').addEventListener('click', () => {
          advanceRound('completed');
        });
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
                <span style="font-weight: 600; color: ${team.color}; font-size: 16px;">${team.name}</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="color: var(--color-text-muted);">Max: $${team.score}</span>
                  <input type="number" class="final-wager-input" data-team-id="${team.id}" min="0" max="${team.score}" placeholder="Wager" style="width: 120px; padding: 8px; background: #000; border: 1px solid var(--border-glass); border-radius: 6px; color:#fff; text-align: center;">
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

        const wagerInputs = hostClueGrid.querySelectorAll('.final-wager-input');
        wagerInputs.forEach((input, idx) => {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (idx < wagerInputs.length - 1) {
                wagerInputs[idx + 1].focus();
              } else {
                document.getElementById('host-reveal-clue-btn').click();
              }
            }
          });
        });
        
        document.getElementById('host-reveal-category-btn').addEventListener('click', () => {
          if (gameState.deck.finalJeopardy) {
            broadcastAction('SHOW_FINAL_CATEGORY', { category: gameState.deck.finalJeopardy.category });
          }
        });
        
        document.getElementById('host-reveal-clue-btn').addEventListener('click', () => {
          // Validate all wagers
          const inputs = hostClueGrid.querySelectorAll('.final-wager-input');
          let valid = true;
          const wagerData = [];
          
          inputs.forEach(input => {
            const teamId = parseInt(input.dataset.teamId, 10);
            const team = gameState.teams.find(t => t.id === teamId);
            const wager = parseInt(input.value, 10);
            const errorDiv = document.getElementById(`error-team-${teamId}`);
            
            if (isNaN(wager) || wager < 0 || wager > team.score) {
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
          
          // Save wagers to state
          wagerData.forEach(data => {
            const team = gameState.teams.find(t => t.id === data.teamId);
            team.finalWager = data.wager;
          });
          
          saveStateToStorage();
          
          // Broadcast reveal Final Jeopardy clue (which triggers music on spectator screen)
          if (gameState.deck.finalJeopardy) {
            broadcastAction('SHOW_FINAL_CLUE', { clue: gameState.deck.finalJeopardy });
          }
          
          // Redraw panel to Judging View
          renderActiveGameUI();
        });
        
      } else {
        // Judging View
        let scoringHtml = '';
        eligibleTeams.forEach(team => {
          const isCorrect = team.finalResult === 'correct';
          const isIncorrect = team.finalResult === 'incorrect';
          
          scoringHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: 8px; margin-bottom: 12px; gap: 15px;">
              <div>
                <span style="font-weight: 700; color: ${team.color}; font-size: 16px; display: block;">${team.name}</span>
                <span style="color: var(--color-text-muted); font-size: 13px;">Score: $${team.score} | Wager: $${team.finalWager}</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-correct final-correct-btn ${isCorrect ? 'active-grade' : ''}" data-team-id="${team.id}" style="padding: 6px 16px; min-width: 90px; opacity: ${team.finalResult && !isCorrect ? 0.3 : 1};">Correct</button>
                <button class="btn btn-incorrect final-incorrect-btn ${isIncorrect ? 'active-grade' : ''}" data-team-id="${team.id}" style="padding: 6px 16px; min-width: 90px; opacity: ${team.finalResult && !isIncorrect ? 0.3 : 1};">Incorrect</button>
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
              <p style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">${gameState.deck.finalJeopardy.question}</p>
              <p style="font-size: 15px; color: var(--color-correct); font-weight: 700; margin: 0;">Answer: ${gameState.deck.finalJeopardy.answer}</p>
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
        
        // Add listeners to grading buttons
        hostClueGrid.querySelectorAll('.final-correct-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const teamId = parseInt(btn.dataset.teamId, 10);
            const team = gameState.teams.find(t => t.id === teamId);
            
            // Revert previous scoring adjustments if any
            if (team.finalResult === 'correct') return; // already graded correct
            if (team.finalResult === 'incorrect') {
              team.score += team.finalWager * 2; // refund incorrect deduct + add correct
            } else {
              team.score += team.finalWager; // standard add
            }
            
            team.finalResult = 'correct';
            saveStateToStorage();
            
            // Sync scores to spectator board
            broadcastAction('RESOLVE_CLUE', {
              spentClues: gameState.spentClues,
              teams: gameState.teams,
              isCorrect: true,
              isIncorrect: false,
              keepOpen: true
            });
            
            renderActiveGameUI();
          });
        });
        
        hostClueGrid.querySelectorAll('.final-incorrect-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const teamId = parseInt(btn.dataset.teamId, 10);
            const team = gameState.teams.find(t => t.id === teamId);
            
            // Revert previous scoring adjustments if any
            if (team.finalResult === 'incorrect') return; // already graded incorrect
            if (team.finalResult === 'correct') {
              team.score -= team.finalWager * 2; // deduct correct add - deduct incorrect
            } else {
              team.score -= team.finalWager; // standard deduct
            }
            
            team.finalResult = 'incorrect';
            saveStateToStorage();
            
            // Sync scores to spectator board
            broadcastAction('RESOLVE_CLUE', {
              spentClues: gameState.spentClues,
              teams: gameState.teams,
              isCorrect: false,
              isIncorrect: true,
              keepOpen: true
            });
            
            renderActiveGameUI();
          });
        });
        
        document.getElementById('host-final-reveal-ans-btn').addEventListener('click', () => {
          if (gameState.deck.finalJeopardy) {
            broadcastAction('REVEAL_ANSWER', { answer: gameState.deck.finalJeopardy.answer });
          }
        });
        
        document.getElementById('host-final-complete-btn').addEventListener('click', () => {
          advanceRound('completed');
        });
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
              broadcastAction('SYNC_STATE', { state: gameState });
              setTimeout(() => {
                window.location.reload();
              }, 150);
            }
          });
        }
      }, 50);
      return;
    }

    const categories = gameState.gamePhase === 'double_jeopardy' ? 
      gameState.deck.doubleJeopardy.categories : gameState.deck.singleJeopardy.categories;
      
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
      card.innerHTML = `<span class="category-title" style="font-size: 14px;">${cat.name}</span>`;
      hostClueGrid.appendChild(card);
    });

    const maxCluesCount = Math.max(...categories.map(c => c.clues.length));
    
    for (let rowIndex = 0; rowIndex < maxCluesCount; rowIndex++) {
      categories.forEach(cat => {
        const clue = cat.clues[rowIndex];
        const card = document.createElement('div');
        
        if (clue) {
          const spentKey = `${gameState.gamePhase}-${cat.name}-${clue.value}`;
          const isSpent = gameState.spentClues.includes(spentKey);
          
          card.className = `host-clue-card ${isSpent ? 'spent' : ''} ${clue.isDailyDouble ? 'daily-double' : ''}`;
          
          card.dataset.catName = cat.name;
          card.dataset.rowIndex = rowIndex;
          
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="host-card-val">$${clue.value}</span>
              ${clue.isDailyDouble ? '<span style="font-size:10px; font-weight:700; color:var(--color-accent);">DD</span>' : ''}
            </div>
            <div class="host-card-category">${cat.name}</div>
            <div class="host-card-preview">${clue.question}</div>
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
  function activateClueControl(clue, categoryName) {
    clue.category = categoryName;
    gameState.currentClue = clue;
    gameState.currentWager = null;
    gameState.activeBuzzedTeamId = null;
    disabledBuzzers = [];
    
    saveStateToStorage();
    
    // Broadcast clue reveal to spectator board
    broadcastAction('SHOW_CLUE', { clue });
    
    controllerCategory.textContent = `${categoryName} - $${clue.value || 'Final'}`;
    controllerQuestion.textContent = clue.question;
    controllerAnswer.textContent = `Correct Answer: ${clue.answer}`;
    
    // Daily Double vs. Standard Clue check
    if (clue.isDailyDouble) {
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
      renderBuzzerClaimButtons();
      renderQuickScoreButtons();
      
      hostClueCorrectBtn.disabled = true;
      hostClueIncorrectBtn.disabled = true;
    }
    
    hostClueController.style.display = 'flex';
    hostClueController.scrollIntoView({ behavior: 'smooth' });
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
    const maxAllowed = Math.max(team.score, maxClueVal);
    const minWager = 5;
    
    // Strip dollar signs, commas, whitespace, and decimal points to allow formats like "$1,000" or " $ 500 "
    const rawVal = (ddWagerInput.value || "").replace(/[\$,\s]/g, '').split('.')[0];
    const wager = parseInt(rawVal, 10);
    
    if (isNaN(wager) || wager < minWager || wager > maxAllowed) {
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
    
    gameState.currentWager = wager;
    saveStateToStorage();
    
    // Broadcast wager to spectator board
    broadcastAction('SET_WAGER', { wager });
    
    // Assign wagering team as the "Active buzzed team" automatically
    gameState.activeBuzzedTeamId = teamId;
    saveStateToStorage();
    
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

    gameState.teams.forEach(team => {
      // Create quick score card/group
      const groupEl = document.createElement('div');
      groupEl.style.display = 'flex';
      groupEl.style.alignItems = 'center';
      groupEl.style.gap = '6px';
      groupEl.style.padding = '6px 12px';
      groupEl.style.background = 'rgba(255,255,255,0.02)';
      groupEl.style.border = '1px solid var(--border-glass)';
      groupEl.style.borderRadius = '8px';

      const nameEl = document.createElement('span');
      nameEl.style.fontWeight = '600';
      nameEl.style.fontSize = '14px';
      nameEl.style.marginRight = '6px';
      nameEl.style.color = team.color;
      nameEl.textContent = team.name;

      const plusBtn = document.createElement('button');
      plusBtn.className = 'btn btn-correct';
      plusBtn.style.padding = '4px 8px';
      plusBtn.style.fontSize = '12px';
      plusBtn.textContent = `+$${clueVal}`;
      plusBtn.addEventListener('click', () => {
        team.score += clueVal;
        resolveClueWithQuickScore(true);
      });

      const minusBtn = document.createElement('button');
      minusBtn.className = 'btn btn-incorrect';
      minusBtn.style.padding = '4px 8px';
      minusBtn.style.fontSize = '12px';
      minusBtn.textContent = `-$${clueVal}`;
      minusBtn.addEventListener('click', () => {
        team.score -= clueVal;
        resolveClueWithQuickScore(false);
      });

      groupEl.appendChild(nameEl);
      groupEl.appendChild(plusBtn);
      groupEl.appendChild(minusBtn);
      quickScoreTeamsRow.appendChild(groupEl);
    });
  }

  function resolveClueWithQuickScore(isCorrect) {
    if (!gameState.currentClue) return;

    // Mark clue as spent
    if (gameState.gamePhase !== 'final_jeopardy') {
      const categoryName = gameState.currentClue.category || controllerCategory.textContent.split(' - ')[0];
      const spentKey = `${gameState.gamePhase}-${categoryName}-${gameState.currentClue.value}`;
      if (!gameState.spentClues.includes(spentKey)) {
        gameState.spentClues.push(spentKey);
      }
    }

    gameState.currentClue = null;
    gameState.activeBuzzedTeamId = null;
    gameState.currentWager = null;

    saveStateToStorage();

    // Broadcast Resolve
    broadcastAction('RESOLVE_CLUE', {
      spentClues: gameState.spentClues,
      teams: gameState.teams,
      isCorrect: isCorrect,
      isIncorrect: !isCorrect
    });

    hostClueController.style.display = 'none';
    renderActiveGameUI();
  }

  function renderBuzzerClaimButtons() {
    buzzerTeamsRow.innerHTML = '';
    
    gameState.teams.forEach(team => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      
      const isDisabled = disabledBuzzers.includes(team.id);
      if (isDisabled) btn.disabled = true;
      
      btn.style.setProperty('--color-primary', team.color);
      btn.style.borderColor = team.color;
      btn.style.color = '#fff';
      btn.textContent = team.name;
      
      btn.addEventListener('click', () => assignActiveBuzzerTeam(team.id));
      buzzerTeamsRow.appendChild(btn);
    });
  }

  function assignActiveBuzzerTeam(teamId) {
    gameState.activeBuzzedTeamId = teamId;
    saveStateToStorage();
    
    // Broadcast buzzer claim to spectator board (triggers beep + 5s timer)
    broadcastAction('SET_ACTIVE_TEAM', { teamId });
    
    // Highlight buzzed team button
    const buttons = buzzerTeamsRow.querySelectorAll('button');
    buttons.forEach(btn => {
      const teamName = btn.textContent;
      const teamObj = gameState.teams.find(t => t.name === teamName);
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

  hostClueCorrectBtn.addEventListener('click', () => {
    if (!gameState.currentClue || !gameState.activeBuzzedTeamId) return;
    
    const team = gameState.teams.find(t => t.id === gameState.activeBuzzedTeamId);
    if (team) {
      const clueVal = gameState.currentClue.isDailyDouble ? 
        gameState.currentWager : (gameState.currentClue.value || 0);
        
      team.score += clueVal;
    }
    
    // Final Jeopardy doesn't have grid keys
    if (gameState.gamePhase !== 'final_jeopardy') {
      const categoryName = gameState.currentClue.category || controllerCategory.textContent.split(' - ')[0];
      const spentKey = `${gameState.gamePhase}-${categoryName}-${gameState.currentClue.value}`;
      if (!gameState.spentClues.includes(spentKey)) {
        gameState.spentClues.push(spentKey);
      }
    }
    
    gameState.currentClue = null;
    gameState.activeBuzzedTeamId = null;
    gameState.currentWager = null;
    
    saveStateToStorage();
    
    // Broadcast Resolve: Correct
    broadcastAction('RESOLVE_CLUE', {
      spentClues: gameState.spentClues,
      teams: gameState.teams,
      isCorrect: true,
      isIncorrect: false
    });
    
    hostClueController.style.display = 'none';
    renderActiveGameUI();
  });

  hostClueIncorrectBtn.addEventListener('click', () => {
    if (!gameState.currentClue || !gameState.activeBuzzedTeamId) return;
    
    const team = gameState.teams.find(t => t.id === gameState.activeBuzzedTeamId);
    if (team) {
      const clueVal = gameState.currentClue.isDailyDouble ? 
        gameState.currentWager : (gameState.currentClue.value || 0);
        
      team.score -= clueVal;
    }
    
    // Lock out this team from buzzing again for this clue
    disabledBuzzers.push(gameState.activeBuzzedTeamId);
    gameState.activeBuzzedTeamId = null;
    saveStateToStorage();
    
    // Check if Daily Double or Final Jeopardy or all teams locked out
    const isSpecialClue = gameState.currentClue.isDailyDouble || gameState.gamePhase === 'final_jeopardy';
    const allLockedOut = disabledBuzzers.length >= gameState.teams.length;
    const keepOpen = !isSpecialClue && !allLockedOut;

    // Broadcast Resolve: Incorrect (plays incorrect sound cue)
    broadcastAction('RESOLVE_CLUE', {
      spentClues: gameState.spentClues,
      teams: gameState.teams,
      isCorrect: false,
      isIncorrect: true,
      keepOpen: keepOpen
    });
    
    renderSidebarScoreboards();
    
    if (!keepOpen) {
      // Clue dead: Close clue and force spend
      if (gameState.gamePhase !== 'final_jeopardy') {
        const categoryName = gameState.currentClue.category || controllerCategory.textContent.split(' - ')[0];
        const spentKey = `${gameState.gamePhase}-${categoryName}-${gameState.currentClue.value}`;
        if (!gameState.spentClues.includes(spentKey)) {
          gameState.spentClues.push(spentKey);
        }
      }
      
      gameState.currentClue = null;
      gameState.currentWager = null;
      saveStateToStorage();
      
      setTimeout(() => {
        broadcastAction('RESOLVE_CLUE', {
          spentClues: gameState.spentClues,
          teams: gameState.teams,
          isCorrect: false,
          isIncorrect: false,
          keepOpen: false
        });
        hostClueController.style.display = 'none';
        renderActiveGameUI();
      }, 1000);
      
    } else {
      // Clue remains open: re-enable remaining buzzers
      hostClueCorrectBtn.disabled = true;
      hostClueIncorrectBtn.disabled = true;
      renderBuzzerClaimButtons();
    }
  });

  hostClueSkipBtn.addEventListener('click', () => {
    if (!gameState.currentClue) return;
    
    if (gameState.gamePhase !== 'final_jeopardy') {
      const categoryName = gameState.currentClue.category || controllerCategory.textContent.split(' - ')[0];
      const spentKey = `${gameState.gamePhase}-${categoryName}-${gameState.currentClue.value}`;
      if (!gameState.spentClues.includes(spentKey)) {
        gameState.spentClues.push(spentKey);
      }
    }
    
    gameState.currentClue = null;
    gameState.activeBuzzedTeamId = null;
    gameState.currentWager = null;
    saveStateToStorage();
    
    // Broadcast Resolve: No Answer (Closes overlay with no point change)
    broadcastAction('RESOLVE_CLUE', {
      spentClues: gameState.spentClues,
      teams: gameState.teams,
      isCorrect: false,
      isIncorrect: false
    });
    
    hostClueController.style.display = 'none';
    renderActiveGameUI();
  });

  hostRevealAnswerBtn.addEventListener('click', () => {
    if (gameState.currentClue) {
      broadcastAction('REVEAL_ANSWER', { answer: gameState.currentClue.answer });
    }
  });

  // --- SIDEBAR UTILITIES ---

  // Launch Spectator board in secondary window
  openBoardBtn.addEventListener('click', () => {
    // In single-file/inline mode, the page name can be index.html or anything else.
    // If the path does not end with 'host.html', we assume we are in unified/routed mode and open the current page with '?view=board'.
    const isHostFile = window.location.pathname.endsWith('host.html');
    const filename = window.location.pathname.substring(window.location.pathname.lastIndexOf('/') + 1);
    const targetUrl = isHostFile ? 'board.html' : `${filename || 'index.html'}?view=board`;
    
    const win = window.open(targetUrl, 'jeopardy_board_display', 'width=1200,height=800');
    if (win) {
      directWindows.add(win);
      // Wait a tiny bit and send sync state directly to the new window
      setTimeout(() => {
        try {
          if (win && !win.closed) {
            win.postMessage({ action: 'SYNC_STATE', payload: { state: gameState } }, '*');
          }
        } catch (e) {
          console.warn("Failed to send initial sync to newly opened window:", e);
        }
      }, 500); // 500ms delay to allow the window to load
    }
  });

  // Sidebar Reset Game Session click listener
  if (resetGameBtn) {
    resetGameBtn.addEventListener('click', () => {
      if (confirm("Are you sure you want to reset and start a new game? This clears current scores but preserves the loaded CSV game deck in memory.")) {
        resetGameState();
        broadcastAction('SYNC_STATE', { state: gameState });
        setTimeout(() => {
          window.location.reload();
        }, 150);
      }
    });
  }

  // Centralized Event Delegation for clue card grid clicks
  hostClueGrid.addEventListener('click', (e) => {
    // If the category introductions or final jeopardy captured are active, ignore
    if (gameState.categoryIntroIndex !== null && gameState.categoryIntroIndex !== undefined) return;
    if (gameState.gamePhase === 'final_jeopardy' || gameState.gamePhase === 'setup' || gameState.gamePhase === 'completed') return;
    
    const card = e.target.closest('.host-clue-card');
    if (!card || card.classList.contains('spent')) return;
    
    const catName = card.dataset.catName;
    const rowIndex = parseInt(card.dataset.rowIndex, 10);
    if (!catName || isNaN(rowIndex)) return;
    
    const categories = gameState.gamePhase === 'double_jeopardy' ? 
      gameState.deck.doubleJeopardy.categories : gameState.deck.singleJeopardy.categories;
      
    const cat = categories.find(c => c.name === catName);
    if (cat) {
      const clue = cat.clues[rowIndex];
      if (clue) {
        activateClueControl(clue, catName);
      }
    }
  });
});
