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
  let hasRenderedWinnerReveal = false;
  const preloadedImageUrls = new Set();
  let preloadKey = '', imageQueue = [], activeImageLoads = 0;

  loadStateFromStorage();
  let requestedSession = new URLSearchParams(window.location.search).get('session') || null;
  let lastRevision = -1, lastContact = 0, lastClueView = '', lastTimer = '', lastBuzz = null;
  const connection = document.getElementById('connection-status');
  applySyncSettings();
  preloadDeckImages();
  renderCompleteBoard();
  renderCategoryIntroductions();
  renderCurrentClue();

  function sendSyncRequest() {
    const message = { protocol: 1, role: 'board', action: 'SYNC_REQUEST', sessionId: requestedSession,
      deckId: gameState.deck.id, initial: lastRevision < 0 };
    if (window.opener && !window.opener.closed) {
      try { window.opener.postMessage(message, '*'); return; } catch {}
    }
    if (broadcastChannel) broadcastChannel.postMessage(message);
  }

  function renderCurrentClue() {
    const clue = gameState.currentClue;
    const categoryOnly = gameState.gamePhase === 'final_jeopardy' && gameState.finalStage === 'category';
    const key = JSON.stringify([clue?.id, gameState.clueStage, gameState.currentWager, categoryOnly, clue?.mediaUrl]);
    if (key !== lastClueView) {
      lastClueView = key;
      if (clue) showClueOverlay(clue, false);
      else if (categoryOnly) showClueOverlay({ question: `Category: ${gameState.deck.finalJeopardy?.category || ''}` }, false);
      else hideClueOverlay();
    }
    const answer = document.getElementById('clue-answer-text');
    if (answer) {
      answer.textContent = gameState.answerVisible && clue ? clue.answer : '';
      answer.style.display = gameState.answerVisible && clue ? 'inline-block' : 'none';
    }
    if (gameState.activeBuzzedTeamId !== lastBuzz) {
      lastBuzz = gameState.activeBuzzedTeamId;
      if (lastBuzz) triggerBuzzerClaim(lastBuzz, false);
      else buzzAlertEl.style.display = 'none';
    }
    const timerKey = JSON.stringify(gameState.timer);
    if (lastTimer !== timerKey) {
      lastTimer = timerKey;
      if (gameState.timer) startBuzzerCountdown(); else clearCountdown();
    }
  }

  function receiveHostMessage(message) {
    if (message?.protocol !== 1 || message.role !== 'host' || !message.state || !Array.isArray(message.state.teams)) return;
    if (requestedSession && message.sessionId !== requestedSession) return;
    if (!Number.isFinite(message.revision) || message.revision <= lastRevision) return;
    if (!message.state.deck && message.deckId !== gameState.deck.id) { sendSyncRequest(); return; }
    const previousTeams = JSON.stringify(gameState.teams), previousSpent = JSON.stringify(gameState.spentClues), previousSettings = JSON.stringify(gameState.settings);
    const prevPhase = gameState.gamePhase, prevIntro = gameState.categoryIntroIndex, prevDeck = gameState.deck.id;
    requestedSession = message.sessionId;
    lastRevision = message.revision;
    lastContact = Date.now();
    if (connection) connection.textContent = 'Connected';
    Object.assign(gameState, message.state);
    const teamsChanged = previousTeams !== JSON.stringify(gameState.teams);
    const spentChanged = previousSpent !== JSON.stringify(gameState.spentClues);
    if (previousSettings !== JSON.stringify(gameState.settings)) applySyncSettings();
    if (prevDeck !== gameState.deck.id || prevPhase !== gameState.gamePhase || spentChanged) preloadDeckImages();
    if (gameState.gamePhase === 'setup') { hasRenderedWinnerReveal = false; }
    if (prevPhase !== gameState.gamePhase || prevDeck !== gameState.deck.id || !gridEl.hasChildNodes() || (gameState.gamePhase === 'completed' && teamsChanged)) renderCompleteBoard();
    else { if (teamsChanged) renderScoreboard(); if (spentChanged) updateClueCardStates(); }
    if (prevIntro !== gameState.categoryIntroIndex || prevPhase !== gameState.gamePhase || prevDeck !== gameState.deck.id) renderCategoryIntroductions();
    renderCurrentClue();
    console.log(`Board received: ${message.action}`);
    switch (message.action) {
      case 'SET_PHASE': if (gameState.gamePhase === 'completed') gameAudio.playVictoryFanfare(); break;
      case 'SHOW_CLUE': gameState.currentClue?.isDailyDouble ? gameAudio.playDailyDouble() : gameAudio.playSelect(); break;
      case 'SHOW_FINAL_CLUE': gameAudio.playFinalJeopardy(timerRemaining() / 1000); break;
      case 'PAUSE_TIMER': gameAudio.stopAll(); break;
      case 'RESUME_TIMER': if (gameState.timer?.kind === 'final') gameAudio.playFinalJeopardy(timerRemaining() / 1000); break;
      case 'REVEAL_ANSWER': gameAudio.playSelect(); break;
      case 'SET_ACTIVE_TEAM': gameAudio.playBuzzer(); break;
      case 'RESOLVE_CLUE':
        if (gameState.gamePhase === 'final_jeopardy') gameAudio.stopAll();
        if (message.payload?.isCorrect) gameAudio.playCorrect();
        else if (message.payload?.isIncorrect) gameAudio.playIncorrect();
        break;
    }
  }

  if (broadcastChannel) broadcastChannel.onmessage = event => receiveHostMessage(event.data);
  window.addEventListener('message', event => {
    if (trustedWindowMessage(event) && (!window.opener || event.source === window.opener)) receiveHostMessage(event.data);
  });
  window.addEventListener('focus', sendSyncRequest);
  const heartbeat = setInterval(() => {
    if (connection && Date.now() - lastContact > 6000) connection.textContent = 'Reconnecting…';
    sendSyncRequest();
  }, 2000);
  window.addEventListener('pagehide', () => clearInterval(heartbeat), { once: true });
  sendSyncRequest();

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
    
    const categories = roundCategories();
      
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
    
    const categories = roundCategories();
      
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
  function showClueOverlay(clue, playSound = true) {
    clearCountdown();
    zoomOverlayEl.scrollTop = 0;
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
    if (clue.isDailyDouble && gameState.clueStage === 'wager') {
      if (playSound) gameAudio.playDailyDouble();
      
      // Render Daily Double wagering layout
      specialCardEl.style.display = 'block';
      specialTitleEl.textContent = 'Daily Double';
      specialPromptEl.textContent = 'Awaiting team wager...';
      specialWagerEl.style.display = 'none';
      clueTextEl.textContent = ''; // Hide question until wager set
      
      zoomOverlayEl.classList.add('active');
      zoomOverlayEl.setAttribute('aria-hidden', 'false');
      return;
    }
    
    zoomOverlayEl.classList.add('active');
    zoomOverlayEl.setAttribute('aria-hidden', 'false');
    if (playSound) gameAudio.playSelect();
    if (clue.isDailyDouble) {
      specialCardEl.style.display = 'block';
      specialTitleEl.textContent = 'Daily Double';
      specialPromptEl.textContent = 'Wager Placed:';
      specialWagerEl.textContent = `$${gameState.currentWager}`;
      specialWagerEl.style.display = 'block';
    }
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
        img.onload = () => { img.style.opacity = '1'; };
        img.onerror = () => {
          const error = document.createElement('p');
          error.textContent = 'Image unavailable. Check the media file or connection.';
          img.replaceWith(error);
        };
        img.src = clue.mediaUrl;
        img.style.opacity = img.complete && img.naturalWidth ? '1' : '0';
        mediaContainerEl.appendChild(img);
      }
    }
  }

  function hideClueOverlay() {
    zoomOverlayEl.classList.remove('active');
    zoomOverlayEl.setAttribute('aria-hidden', 'true');
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
  function triggerBuzzerClaim(teamId, playSound = true) {
    const team = gameState.teams.find(t => t.id === teamId);
    if (!team) return;
    
    // Play Buzzer Audio
    if (playSound) gameAudio.playBuzzer();
    
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
    const timer = gameState.timer;
    if (!timer) return;
    countdownDisplayEl.style.display = 'flex';
    function tick() {
      const remaining = timerRemaining(timer);
      const progress = remaining / timer.duration;
      timerFillEl.style.transform = `scaleX(${progress})`;
      timerFillEl.classList.toggle('warning', progress < 0.3);
      document.getElementById('timer-seconds').textContent = `${Math.ceil(remaining / 1000)}s${timer.paused ? ' · Paused' : ''}`;
      if (remaining > 0 && !timer.paused) countdownTimerId = requestAnimationFrame(tick);
    }
    tick();
  }

  function clearCountdown() {
    if (countdownTimerId) cancelAnimationFrame(countdownTimerId);
    countdownTimerId = null;
    countdownDisplayEl.style.display = 'none';
    timerFillEl.className = 'timer-bar-fill';
    timerFillEl.style.transform = 'scaleX(1)';
  }

  function renderCategoryIntroductions() {
    const overlay = document.getElementById('category-intro-overlay');
    const nameText = document.getElementById('intro-category-name');
    const countText = document.getElementById('intro-category-count');
    if (!overlay || !nameText || !countText) return;
    
    const isIntro = gameState.categoryIntroIndex !== null && gameState.categoryIntroIndex !== undefined;
    
    if (isIntro && (gameState.gamePhase === 'single_jeopardy' || gameState.gamePhase === 'double_jeopardy')) {
      const categories = roundCategories();
        
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
    const key = `${gameState.deck.id}:${gameState.gamePhase}:${gameState.spentClues.length}`;
    if (key === preloadKey) return;
    preloadKey = key;
    const round = gameState.gamePhase === 'double_jeopardy' ? gameState.deck.doubleJeopardy :
      gameState.gamePhase === 'single_jeopardy' ? gameState.deck.singleJeopardy : null;
    const clues = round ? round.categories.flatMap(c => c.clues).filter(c => !gameState.spentClues.includes(c.id)) :
      gameState.gamePhase === 'final_jeopardy' && gameState.deck.finalJeopardy ? [gameState.deck.finalJeopardy] : [];
    const urls = clues.filter(c => c.mediaType === 'image' && c.mediaUrl).sort((a, b) => a.value - b.value).map(c => c.mediaUrl);
    imageQueue = [...new Set(urls)].filter(url => !preloadedImageUrls.has(url)).slice(0, 6);
    drainImageQueue();
  }

  function drainImageQueue() {
    while (activeImageLoads < 2 && imageQueue.length) {
      const url = imageQueue.shift();
      if (preloadedImageUrls.has(url)) continue;
      preloadedImageUrls.add(url);
      activeImageLoads++;
      const img = new Image();
      img.decoding = 'async';
      const finish = () => { activeImageLoads--; drainImageQueue(); };
      img.onload = () => { if (img.decode) img.decode().catch(() => {}).finally(finish); else finish(); };
      img.onerror = () => { preloadedImageUrls.delete(url); finish(); };
      img.src = url;
    }
  }

  function applySyncSettings() {
    if (!gameState.settings) return;
    
    // 1. Inject CSS custom property for clue sizing
    document.documentElement.classList.toggle('effects-simple', Boolean(gameState.settings.lowEffects));
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
