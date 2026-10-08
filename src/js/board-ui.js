/**
 * Spectator Display View Controller (board-ui.js)
 * Manages grids, layouts, animations, and sound triggers in response to Broadcast messages.
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
  const isBoardFile = window.location.pathname.endsWith('board.html');
  const activeView = urlParams.get('view') || (isBoardFile ? 'board' : 'host');
  if (activeView !== 'board') return;

  const roundTitleEl = document.getElementById('round-title');
  const gridEl = document.getElementById('jeopardy-grid');
  const scoreboardEl = document.getElementById('board-scoreboard');
  
  // Overlay Elements
  const zoomOverlayEl = document.getElementById('clue-zoom-overlay');
  const clueTextEl = document.getElementById('clue-display-text');
  const mediaContainerEl = document.getElementById('clue-media');
  const buzzAlertEl = document.getElementById('buzz-alert');
  const buzzTeamNameEl = document.getElementById('buzz-team-name');
  const buzzTeamColorEl = document.getElementById('buzz-team-color');
  
  // Special Screen Elements (Daily Double / Final Jeopardy)
  const specialCardEl = document.getElementById('special-card');
  const specialTitleEl = document.getElementById('special-title');
  const specialPromptEl = document.getElementById('special-prompt');
  const specialWagerEl = document.getElementById('special-wager-display');
  
  // Countdown Timer Elements
  const countdownDisplayEl = document.getElementById('countdown-display');
  const timerFillEl = document.getElementById('timer-fill');
  let countdownTimerId = null;
  let hasPlayedVictoryFanfare = false;
  let hasRenderedWinnerReveal = false;
  const preloadedImageUrls = new Set();

  // Initialize and request initial sync from Host Console
  loadStateFromStorage();
  applySyncSettings(); // Sync dynamic styling variables and sound states
  preloadDeckImages(); // Preload recovered images immediately!
  renderCompleteBoard();
  renderCategoryIntroductions();
  
  // 1. Initial handshake with Host Console (bounded retry to eliminate 2s infinite polling)
  let initialSyncReceived = false;
  let syncRetryCount = 0;
  const maxSyncRetries = 5;

  function sendSyncRequest() {
    if (initialSyncReceived) return;
    broadcastAction('SYNC_REQUEST');
    if (window.opener) {
      try {
        window.opener.postMessage({ action: 'SYNC_REQUEST' }, '*');
      } catch (e) {
        console.warn("Failed to send SYNC_REQUEST to opener window:", e);
      }
    }
  }

  sendSyncRequest();

  const syncRetryInterval = setInterval(() => {
    if (initialSyncReceived || ++syncRetryCount >= maxSyncRetries) {
      clearInterval(syncRetryInterval);
      return;
    }
    sendSyncRequest();
  }, 1000);

  // Recovery ping when spectator window regains focus
  window.addEventListener('focus', () => {
    if (!initialSyncReceived) sendSyncRequest();
  });

  // Action dispatcher
  function handleIncomingAction(action, payload) {
    console.log(`Board received: ${action}`, payload);
    
    switch (action) {
      case 'SYNC_STATE':
        initialSyncReceived = true;
        const prevPhase = gameState.gamePhase;
        const prevIntro = gameState.categoryIntroIndex;
        const savedDeck = gameState.deck;
        Object.assign(gameState, payload.state);
        if (!gameState.deck || !gameState.deck.singleJeopardy?.categories?.length) {
          gameState.deck = savedDeck;
        }
        preloadDeckImages(); // Preload newly synced images immediately!
        applySyncSettings(); // Apply settings dynamically on sync!
        if (gameState.gamePhase === 'setup') {
          hasPlayedVictoryFanfare = false;
          hasRenderedWinnerReveal = false;
          gameAudio.stopAll(); // Stop all audio immediately on reset!
          // Pristine local state wipe
          gameState.spentClues = [];
          gameState.currentClue = null;
          gameState.currentWager = null;
          gameState.activeBuzzedTeamId = null;
          if (gameState.teams) {
            gameState.teams.forEach(t => {
              t.score = 0;
              delete t.finalWager;
              delete t.finalResult;
            });
          }
          saveStateToStorage();
          renderCompleteBoard();
          renderCategoryIntroductions();
        } else {
          saveStateToStorage();
          // Avoid tearing down the entire DOM if phase hasn't changed and grid already exists
          const needsFullRedraw = prevPhase !== gameState.gamePhase || !gridEl.hasChildNodes();
          if (needsFullRedraw) {
            renderCompleteBoard();
          } else {
            renderRoundTitle();
            renderScoreboard();
            updateClueCardStates();
          }
          if (prevIntro !== gameState.categoryIntroIndex || prevPhase !== gameState.gamePhase) {
            renderCategoryIntroductions();
          }
        }
        break;
      case 'SHOW_CLUE':
        gameState.currentClue = payload.clue;
        showClueOverlay(payload.clue);
        break;
      case 'SHOW_FINAL_CATEGORY':
        showClueOverlay({
          category: "Final Jeopardy Category",
          question: `Category: ${payload.category}`,
          answer: "",
          isDailyDouble: false
        });
        break;
      case 'SHOW_FINAL_CLUE':
        gameState.currentClue = payload.clue;
        showClueOverlay(payload.clue);
        // Play final jeopardy ticking theme music
        gameAudio.playFinalJeopardy();
        break;
      case 'REVEAL_ANSWER':
        revealCorrectAnswer(payload.answer);
        break;
      case 'SET_WAGER':
        gameState.currentWager = payload.wager;
        revealWager(payload.wager);
        break;
      case 'SET_ACTIVE_TEAM':
        gameState.activeBuzzedTeamId = payload.teamId;
        triggerBuzzerClaim(payload.teamId);
        break;
      case 'RESOLVE_CLUE':
        // Resolve clue (awards scores, clears active buzzer, and updates grid spent array)
        clearCountdown();
        
        // Hide buzzer alert banner in case of retry
        buzzAlertEl.style.display = 'none';

        if (payload.keepOpen) {
          gameState.teams = payload.teams;
          gameState.activeBuzzedTeamId = null;
          saveStateToStorage();
          
          if (payload.isIncorrect) {
            gameAudio.playIncorrect();
          }
          
          renderScoreboard();
        } else {
          gameState.spentClues = payload.spentClues;
          gameState.teams = payload.teams;
          gameState.activeBuzzedTeamId = null;
          gameState.currentClue = null;
          gameState.currentWager = null;
          
          saveStateToStorage();
          
          // Audio Polish
          if (payload.isCorrect) {
            gameAudio.playCorrect();
          } else if (payload.isIncorrect) {
            gameAudio.playIncorrect();
          }
          
          hideClueOverlay();
          renderScoreboard();
          updateClueCardStates();
        }
        break;
      case 'SET_PHASE':
        clearCountdown();
        gameState.gamePhase = payload.gamePhase;
        if (payload.gamePhase === 'setup') {
          hasPlayedVictoryFanfare = false;
          gameAudio.stopAll(); // Stop all audio immediately on reset!
          // Pristine local state wipe
          gameState.spentClues = [];
          gameState.currentClue = null;
          gameState.currentWager = null;
          gameState.activeBuzzedTeamId = null;
          if (gameState.teams) {
            gameState.teams.forEach(t => {
              t.score = 0;
              delete t.finalWager;
              delete t.finalResult;
            });
          }
        }
        gameState.activeBuzzedTeamId = null;
        gameState.currentClue = null;
        gameState.currentWager = null;
        saveStateToStorage();
        
        hideClueOverlay();
        renderCompleteBoard();
        break;
      case 'SYNC_REQUEST':
        // Presenter page handles this, but ignore if received
        break;
    }
  }

  // 1. Broadcast Message Event Listener
  if (broadcastChannel) {
    broadcastChannel.onmessage = (event) => {
      const { action, payload } = event.data;
      handleIncomingAction(action, payload);
    };
  }

  // 2. Direct Window Message Event Listener (offline file:// fallback)
  window.addEventListener('message', (event) => {
    const { action, payload } = event.data || {};
    if (action && action !== 'SYNC_REQUEST') {
      handleIncomingAction(action, payload);
    }
  });

  /**
   * Complete Grid and Scoreboard Redraw
   */
  function renderCompleteBoard() {
    renderRoundTitle();
    renderScoreboard();
    
    if (gameState.gamePhase === 'setup') {
      gridEl.style.gridTemplateColumns = ''; // Reset layout columns to default grid
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px;">
          <h2 style="font-size: 32px; color: var(--color-text-muted); text-transform: uppercase; margin-bottom: 12px;">Waiting for Game Deck...</h2>
          <p style="font-size: 16px; color: var(--color-text-muted);">Please upload your game board CSV on the Host Console to begin.</p>
        </div>
      `;
      return;
    }
    
    if (gameState.gamePhase === 'completed') {
      renderWinnerRevealBoard();
      return;
    }
    
    if (gameState.gamePhase === 'final_jeopardy') {
      renderFinalJeopardyBoard();
      return;
    }
    
    renderStandardJeopardyGrid();
  }

  function renderWinnerRevealBoard() {
    // Play arpeggio sweep once
    if (!hasPlayedVictoryFanfare) {
      gameAudio.playVictoryFanfare();
      hasPlayedVictoryFanfare = true;
    }

    gridEl.innerHTML = '';
    // Single column for centered glassmorphic podium cards
    gridEl.style.gridTemplateColumns = '1fr';
    
    // Sort by score descending
    const sortedTeams = [...gameState.teams].sort((a, b) => b.score - a.score);
    if (sortedTeams.length === 0) {
      gridEl.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--color-text-muted);">No teams registered to display results.</div>';
      return;
    }

    // Capture highest score and filter tie champions
    const highestScore = sortedTeams[0].score;
    const champions = sortedTeams.filter(t => t.score === highestScore);
    const runnersUp = sortedTeams.filter(t => t.score !== highestScore);

    const champColor = champions[0].color;
    const champNames = champions.map(c => c.name).join(' & ');
    const champTitle = champions.length > 1 ? '🏆 JOINT CHAMPIONS 🏆' : '🏆 CHAMPION 🏆';

    let runnersUpHTML = '';
    if (runnersUp.length > 0) {
      runnersUpHTML = `
        <div style="margin-top: 32px; width: 100%; max-width: 600px; z-index: 1;">
          <h3 style="font-size: 18px; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 16px; text-align: center; letter-spacing: 0.1em;">Final Standings</h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${runnersUp.map((team, idx) => {
              const rank = idx + champions.length + 1;
              return `
                <div class="glass" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; border-radius: 12px; border-left: 4px solid ${escapeHTML(team.color)};">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-weight: 800; color: var(--color-text-muted); font-size: 16px;">#${rank}</span>
                    <span style="font-weight: 600; font-size: 18px;">${escapeHTML(team.name)}</span>
                  </div>
                  <span style="font-weight: 700; font-size: 20px; font-family: var(--font-family-header); color: ${team.score < 0 ? 'var(--color-incorrect)' : 'var(--color-text)'}">$${team.score}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    const animStyle = hasRenderedWinnerReveal ? '' : 'animation: zoomFadeIn 0.8s cubic-bezier(0.25, 0.8, 0.25, 1);';
    hasRenderedWinnerReveal = true;

    gridEl.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; min-height: 400px; padding: 20px; ${animStyle}">
        
        <!-- Champion Card -->
        <div class="glass" style="
          width: 100%; 
          max-width: 700px; 
          padding: 40px; 
          text-align: center; 
          border: 2px solid ${champColor}; 
          box-shadow: 0 0 45px ${champColor}66; 
          position: relative;
          background: linear-gradient(135deg, hsla(223, 47%, 14%, 0.8) 0%, hsla(223, 47%, 8%, 0.9) 100%);
          border-radius: 24px;
        ">
          <!-- Glow layer -->
          <div style="
            position: absolute; 
            top: -10%; 
            left: -10%; 
            width: 120%; 
            height: 120%; 
            background: radial-gradient(circle, ${champColor}20 0%, transparent 70%); 
            pointer-events: none; 
            z-index: 0;
          "></div>
          
          <div style="position: relative; z-index: 1;">
            <span style="
              font-family: var(--font-family-header); 
              font-weight: 800; 
              font-size: 20px; 
              color: var(--color-accent); 
              text-transform: uppercase; 
              letter-spacing: 0.2em;
              display: block;
              margin-bottom: 16px;
              text-shadow: 0 0 10px var(--color-accent-glow);
            ">${champTitle}</span>
            
            <h1 style="
              font-size: 56px; 
              font-weight: 800; 
              color: #fff; 
              margin-bottom: 20px; 
              line-height: 1.1;
              text-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
              font-family: var(--font-family-header);
            ">${escapeHTML(champNames)}</h1>
            
            <div style="
              display: inline-block;
              font-family: var(--font-family-header); 
              font-size: 48px; 
              font-weight: 800; 
              color: ${highestScore < 0 ? 'var(--color-incorrect)' : 'var(--color-correct)'};
              background: rgba(0, 0, 0, 0.45);
              padding: 10px 36px;
              border-radius: 50px;
              border: 1px solid var(--border-glass);
              box-shadow: inset 0 0 20px rgba(0,0,0,0.6);
            ">$${highestScore}</div>
          </div>
        </div>

        <!-- Standings -->
        ${runnersUpHTML}

      </div>
    `;
  }

  function renderRoundTitle() {
    const titles = {
      'setup': 'Trivia setup',
      'single_jeopardy': 'Single Jeopardy',
      'double_jeopardy': 'Double Jeopardy',
      'final_jeopardy': 'Final Jeopardy',
      'completed': 'Game Completed'
    };
    roundTitleEl.textContent = titles[gameState.gamePhase] || 'Trivia Board';
  }

  function renderScoreboard() {
    scoreboardEl.innerHTML = '';
    
    if (gameState.teams.length === 0) {
      scoreboardEl.innerHTML = '<p style="color: var(--color-text-muted);">No teams registered</p>';
      return;
    }
    
    gameState.teams.forEach(team => {
      const activeBuzz = gameState.activeBuzzedTeamId === team.id;
      const isNegative = team.score < 0;
      
      const card = document.createElement('div');
      card.className = `team-score-card glass ${activeBuzz ? 'active-buzz' : ''}`;
      card.style.setProperty('--team-color', team.color);
      
      card.innerHTML = `
        <div class="score-team-name">${escapeHTML(team.name)}</div>
        <div class="score-amount ${isNegative ? 'negative' : ''}">$${team.score}</div>
      `;
      
      scoreboardEl.appendChild(card);
    });
  }

  function renderStandardJeopardyGrid() {
    gridEl.innerHTML = '';
    
    const categories = gameState.gamePhase === 'double_jeopardy' ? 
      gameState.deck.doubleJeopardy.categories : gameState.deck.singleJeopardy.categories;
      
    if (categories.length === 0) {
      gridEl.innerHTML = '<p style="grid-column: 1 / -1; text-align: center;">No categories available.</p>';
      return;
    }
    
    // Set grid columns count dynamically based on category sizes (traditionally 5)
    gridEl.style.gridTemplateColumns = `repeat(${categories.length}, 1fr)`;
    
    // 1. Draw Category Header Cards
    categories.forEach(cat => {
      const catCard = document.createElement('div');
      catCard.className = 'category-card';
      catCard.innerHTML = `<span class="category-title">${escapeHTML(cat.name)}</span>`;
      gridEl.appendChild(catCard);
    });
    
    // 2. Draw Clue Cards orderly (row by row)
    const maxCluesCount = Math.max(...categories.map(c => c.clues.length));
    
    for (let rowIndex = 0; rowIndex < maxCluesCount; rowIndex++) {
      categories.forEach(cat => {
        const clue = cat.clues[rowIndex];
        const clueCard = document.createElement('div');
        
        if (clue) {
          const spentKey = clue.id;
          const isSpent = gameState.spentClues.includes(spentKey);
          
          clueCard.className = `clue-card glass ${isSpent ? 'spent' : ''}`;
          clueCard.textContent = `$${clue.value}`;
          
          // Store parameters for reference on clicks if debugging
          clueCard.dataset.category = cat.name;
          clueCard.dataset.value = clue.value;
        } else {
          clueCard.className = 'clue-card spent';
        }
        
        gridEl.appendChild(clueCard);
      });
    }
  }

  function updateClueCardStates() {
    if (gameState.gamePhase === 'final_jeopardy' || gameState.gamePhase === 'setup') return;
    
    const categories = gameState.gamePhase === 'double_jeopardy' ? 
      gameState.deck.doubleJeopardy.categories : gameState.deck.singleJeopardy.categories;
      
    const cards = gridEl.querySelectorAll('.clue-card:not(.category-card)');
    let index = 0;
    
    const maxCluesCount = Math.max(...categories.map(c => c.clues.length));
    
    for (let rowIndex = 0; rowIndex < maxCluesCount; rowIndex++) {
      categories.forEach(cat => {
        const clue = cat.clues[rowIndex];
        const card = cards[index++];
        if (clue && card) {
          const spentKey = clue.id;
          if (gameState.spentClues.includes(spentKey)) {
            card.classList.add('spent');
          } else {
            card.classList.remove('spent');
          }
        }
      });
    }
  }

  function renderFinalJeopardyBoard() {
    gridEl.innerHTML = `
      <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 350px;" class="glass daily-double-card">
        <h1 class="dd-title" style="font-size: 56px;">Final Jeopardy</h1>
        <p style="font-size: 24px; color: var(--color-text-muted); margin-bottom: 8px;">Prepare your secret wagers!</p>
        <p style="font-size: 16px; color: var(--color-accent); font-weight: 500;">Host console will activate the screen</p>
      </div>
    `;
  }

  /**
   * Interactive Clue Display Modal
   */
  function showClueOverlay(clue) {
    clearCountdown();
    buzzAlertEl.style.display = 'none';
    specialCardEl.style.display = 'none';
    mediaContainerEl.style.display = 'none';
    mediaContainerEl.innerHTML = '';
    
    const clueAnswerEl = document.getElementById('clue-answer-text');
    if (clueAnswerEl) {
      clueAnswerEl.style.display = 'none';
      clueAnswerEl.textContent = '';
    }
    
    // Play sound cues
    if (clue.isDailyDouble) {
      gameAudio.playDailyDouble();
      
      // Render Daily Double wagering layout
      specialCardEl.style.display = 'block';
      specialTitleEl.textContent = 'Daily Double';
      specialPromptEl.textContent = 'Awaiting team wager...';
      specialWagerEl.style.display = 'none';
      clueTextEl.textContent = ''; // Hide question until wager set
      
      zoomOverlayEl.classList.add('active');
      return;
    }
    
    zoomOverlayEl.classList.add('active');
    gameAudio.playSelect();
    
    // Render Clue Text
    clueTextEl.textContent = clue.question;
    
    // Render embedded media clues
    if (clue.mediaType && clue.mediaType !== 'none' && clue.mediaUrl) {
      mediaContainerEl.style.display = 'flex';
      
      if (clue.mediaType === 'image') {
        const img = document.createElement('img');
        img.alt = "Clue Asset";
        img.decoding = "async";
        img.style.transition = 'opacity 0.3s ease';
        img.src = clue.mediaUrl;
        if (img.complete) {
          img.style.opacity = '1';
        } else {
          img.style.opacity = '0';
          img.onload = () => { img.style.opacity = '1'; };
          img.onerror = () => { img.style.opacity = '1'; };
        }
        mediaContainerEl.appendChild(img);
      }
    }
  }

  function revealWager(wager) {
    specialPromptEl.textContent = 'Wager Placed:';
    specialWagerEl.textContent = `$${wager}`;
    specialWagerEl.style.display = 'block';
    
    // Reveal Daily Double clue after short visual reveal
    setTimeout(() => {
      if (gameState.currentClue) {
        clueTextEl.textContent = gameState.currentClue.question;
        
        // Handle media inside Daily Double
        if (gameState.currentClue.mediaType && gameState.currentClue.mediaType !== 'none' && gameState.currentClue.mediaUrl) {
          mediaContainerEl.style.display = 'flex';
          mediaContainerEl.innerHTML = '';
          
          if (gameState.currentClue.mediaType === 'image') {
            const img = document.createElement('img');
            img.alt = "Clue Asset";
            img.decoding = "async";
            img.style.transition = 'opacity 0.3s ease';
            img.src = gameState.currentClue.mediaUrl;
            if (img.complete) {
              img.style.opacity = '1';
            } else {
              img.style.opacity = '0';
              img.onload = () => { img.style.opacity = '1'; };
              img.onerror = () => { img.style.opacity = '1'; };
            }
            mediaContainerEl.appendChild(img);
          }
        }
      }
    }, 2000);
  }

  function revealCorrectAnswer(answerText) {
    const clueAnswerEl = document.getElementById('clue-answer-text');
    if (clueAnswerEl) {
      clueAnswerEl.textContent = answerText;
      clueAnswerEl.style.display = 'inline-block';
      gameAudio.playSelect();
    }
  }

  function hideClueOverlay() {
    zoomOverlayEl.classList.remove('active');
    buzzAlertEl.style.display = 'none';
    clearCountdown();
    gameAudio.stopAll(); // Stop active ticking clock or final jeopardy themes immediately!
    
    const clueAnswerEl = document.getElementById('clue-answer-text');
    if (clueAnswerEl) {
      clueAnswerEl.style.display = 'none';
      clueAnswerEl.textContent = '';
    }
  }

  /**
   * Host Manual Buzzer Claims & Countdowns
   */
  function triggerBuzzerClaim(teamId) {
    const team = gameState.teams.find(t => t.id === teamId);
    if (!team) return;
    
    // Play Buzzer Audio
    gameAudio.playBuzzer();
    
    // Open Alert Banner
    buzzTeamNameEl.textContent = team.name;
    buzzTeamColorEl.style.backgroundColor = team.color;
    buzzAlertEl.style.backgroundColor = 'hsla(223, 47%, 12%, 0.9)';
    buzzAlertEl.style.borderColor = team.color;
    buzzAlertEl.style.borderWidth = '1px';
    buzzAlertEl.style.borderStyle = 'solid';
    buzzAlertEl.style.display = 'flex';
    
    // Redraw scoreboard to trigger buzzer glowing border
    renderScoreboard();
    
    // Trigger countdown visual (5-second responder timer)
    startBuzzerCountdown();
  }

  function startBuzzerCountdown() {
    clearCountdown();
    countdownDisplayEl.style.display = 'flex';
    
    const duration = 5000; // 5-second limit
    const start = performance.now();
    
    timerFillEl.className = 'timer-bar-fill';
    
    function tick(timestamp) {
      const elapsed = timestamp - start;
      const progress = Math.max(0, 1 - (elapsed / duration));
      
      timerFillEl.style.width = `${progress * 100}%`;
      
      if (progress < 0.3) {
        timerFillEl.classList.add('warning');
      }
      
      if (elapsed < duration) {
        countdownTimerId = requestAnimationFrame(tick);
      } else {
        // Timer Expired: clear buzzer visual
        timerFillEl.style.width = '0%';
        gameAudio.playIncorrect();
      }
    }
    
    countdownTimerId = requestAnimationFrame(tick);
  }

  function clearCountdown() {
    if (countdownTimerId) {
      cancelAnimationFrame(countdownTimerId);
      countdownTimerId = null;
    }
    countdownDisplayEl.style.display = 'none';
    timerFillEl.className = 'timer-bar-fill';
    timerFillEl.style.width = '100%';
  }

  function renderCategoryIntroductions() {
    const overlay = document.getElementById('category-intro-overlay');
    const nameText = document.getElementById('intro-category-name');
    const countText = document.getElementById('intro-category-count');
    if (!overlay || !nameText || !countText) return;
    
    const isIntro = gameState.categoryIntroIndex !== null && gameState.categoryIntroIndex !== undefined;
    
    if (isIntro && (gameState.gamePhase === 'single_jeopardy' || gameState.gamePhase === 'double_jeopardy')) {
      const categories = gameState.gamePhase === 'double_jeopardy' ? 
        gameState.deck.doubleJeopardy.categories : gameState.deck.singleJeopardy.categories;
        
      const idx = gameState.categoryIntroIndex;
      if (categories && categories[idx]) {
        const prevName = nameText.textContent;
        const newName = categories[idx].name;
        
        nameText.textContent = newName;
        countText.textContent = `${idx + 1} of ${categories.length}`;
        
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('active'), 50);
        
        // Play a brief select sound chime if category slides transition
        if (prevName !== newName && prevName !== 'CATEGORY NAME') {
          gameAudio.playSelect();
        }
      }
    } else {
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 400); // Wait for transition fade out
    }
  }

  function preloadDeckImages() {
    if (!gameState.deck) return;
    
    const imageUrls = [];
    
    // 1. Gather Single Jeopardy image URLs
    if (gameState.deck.singleJeopardy && gameState.deck.singleJeopardy.categories) {
      gameState.deck.singleJeopardy.categories.forEach(cat => {
        if (cat.clues) {
          cat.clues.forEach(clue => {
            if (clue && clue.mediaType === 'image' && clue.mediaUrl) {
              imageUrls.push(clue.mediaUrl);
            }
          });
        }
      });
    }
    
    // 2. Gather Double Jeopardy image URLs
    if (gameState.deck.doubleJeopardy && gameState.deck.doubleJeopardy.categories) {
      gameState.deck.doubleJeopardy.categories.forEach(cat => {
        if (cat.clues) {
          cat.clues.forEach(clue => {
            if (clue && clue.mediaType === 'image' && clue.mediaUrl) {
              imageUrls.push(clue.mediaUrl);
            }
          });
        }
      });
    }
    
    // 3. Gather Final Jeopardy image URL
    if (gameState.deck.finalJeopardy && 
        gameState.deck.finalJeopardy.mediaType === 'image' && 
        gameState.deck.finalJeopardy.mediaUrl) {
      imageUrls.push(gameState.deck.finalJeopardy.mediaUrl);
    }
    
    // 4. Preload each new unique image URL in the background
    imageUrls.forEach(url => {
      if (!preloadedImageUrls.has(url)) {
        preloadedImageUrls.add(url);
        console.log(`📡 Background preloading clue image: ${url}`);
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        if (img.decode) {
          img.decode().catch(() => {});
        }
      }
    });
  }

  function applySyncSettings() {
    if (!gameState.settings) return;
    
    // 1. Inject CSS custom property for clue sizing
    const scale = gameState.settings.clueFontSizeMultiplier || 1.0;
    document.documentElement.style.setProperty('--clue-font-size-multiplier', scale);
    
    // 2. Toggle Audio Context Engine
    gameAudio.toggle(gameState.settings.soundEnabled);
  }

  // Unblock browser AudioContext on first interaction with the spectator page
  document.addEventListener('click', () => {
    gameAudio.init();
    console.log("Web Audio API unblocked via spectator page gesture.");
  }, { once: true });
});
