/**
 * Jeopardy Game Core Engine & Synchronization Broker
 * BMAD Phase 4 - Streamlined Vanilla JS Architecture
 */

// Shared Broadcast Channel for instant dual-screen sync
const CHANNEL_NAME = 'jeopardy_game_channel';
let broadcastChannel = null;
try {
  broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
} catch (e) {
  console.warn("BroadcastChannel not supported or blocked in this environment:", e);
}

// Global list of active direct window references for fallback offline sync
const directWindows = new Set();

// Central State Structure
const gameState = {
  teams: [], // Dynamic array of 2 to 4 teams
  deck: {
    singleJeopardy: { categories: [] },
    doubleJeopardy: { categories: [] },
    finalJeopardy: null
  },
  currentClue: null, // Active Clue object
  currentWager: null, // Active Daily Double / Final Jeopardy wager
  activeBuzzedTeamId: null, // Buzzed team ID allowed to answer
  spentClues: [], // Array of "round-category-value" spent strings
  deckName: null, // Filename of the loaded game board CSV
  gamePhase: 'setup', // 'setup' | 'single_jeopardy' | 'double_jeopardy' | 'final_jeopardy' | 'completed'
  categoryIntroIndex: null, // null | number (0-4) during active round category reveals
  settings: {
    clueFontSizeMultiplier: 1.0,
    soundEnabled: true
  }
};

// State Helpers
const STORAGE_KEY = 'jeopardy_local_state';

function saveStateToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  } catch (e) {
    console.warn("localStorage save failed (blocked or disabled):", e);
  }
}

function loadStateFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      Object.assign(gameState, parsed);
      return true;
    }
  } catch (e) {
    console.warn("localStorage load failed (blocked or disabled):", e);
  }
  return false;
}

function resetGameState() {
  if (gameState.teams) {
    gameState.teams.forEach(t => {
      t.score = 0;
      delete t.finalWager;
      delete t.finalResult;
    });
  }
  gameState.currentClue = null;
  gameState.currentWager = null;
  gameState.activeBuzzedTeamId = null;
  gameState.spentClues = [];
  gameState.categoryIntroIndex = null;
  gameState.gamePhase = 'setup';
  saveStateToStorage();
}

/**
 * Robust Client-Side CSV Parser
 * Handles commas, double quotes, and simple escapes offline with zero dependencies.
 */
function parseCSVText(text) {
  const rows = [];
  let row = [""];
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Handle escaped double quote ""
        row[row.length - 1] += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // Handle CRLF
      }
      rows.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  
  // Push final residual row
  if (row.length > 1 || row[0] !== '') {
    rows.push(row);
  }
  
  return rows;
}

/**
 * Transforms flat CSV rows into the structured Jeopardy rounds deck.
 */
function processCSVDeck(csvText) {
  const rawRows = parseCSVText(csvText);
  if (rawRows.length < 2) throw new Error("CSV file is empty or invalid.");
  
  // Detect headers
  const headers = rawRows[0].map(h => h.trim().toLowerCase());
  const colIndex = {
    round: headers.indexOf("round"),
    category: headers.indexOf("category"),
    value: headers.indexOf("value"),
    question: headers.indexOf("question"),
    answer: headers.indexOf("answer"),
    isDailyDouble: headers.indexOf("isdailydouble"),
    mediaType: headers.indexOf("mediatype"),
    mediaUrl: headers.indexOf("mediaurl")
  };
  
  if (colIndex.round === -1 || colIndex.category === -1 || colIndex.question === -1 || colIndex.answer === -1) {
    throw new Error("Missing required columns. Header row must contain: Round, Category, Question, Answer.");
  }
  
  const deck = {
    singleJeopardy: { categories: [] },
    doubleJeopardy: { categories: [] },
    finalJeopardy: null
  };
  
  // Helper to map and get index of dynamic categories
  const getCategory = (roundList, name) => {
    let cat = roundList.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!cat) {
      cat = { name, clues: [] };
      roundList.push(cat);
    }
    return cat;
  };
  
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (row.length <= 1 && row[0] === '') continue; // Skip empty rows
    
    const roundVal = (row[colIndex.round] || "").trim().toLowerCase();
    const categoryVal = (row[colIndex.category] || "").trim();
    const valueStr = colIndex.value !== -1 ? (row[colIndex.value] || "").trim() : "";
    const questionVal = (row[colIndex.question] || "").trim();
    const answerVal = (row[colIndex.answer] || "").trim();
    
    const isDD = colIndex.isDailyDouble !== -1 ? 
      (row[colIndex.isDailyDouble] || "").trim().toUpperCase() === "TRUE" : false;
      
    const mediaTypeVal = colIndex.mediaType !== -1 ? 
      (row[colIndex.mediaType] || "none").trim().toLowerCase() : "none";
      
    const mediaUrlVal = colIndex.mediaUrl !== -1 ? 
      (row[colIndex.mediaUrl] || "").trim() : "";
      
    if (!roundVal || !categoryVal || !questionVal || !answerVal) continue;
    
    const clueObj = {
      category: categoryVal,
      value: valueStr ? parseInt(valueStr, 10) : 0,
      question: questionVal,
      answer: answerVal,
      isDailyDouble: isDD,
      mediaType: mediaTypeVal,
      mediaUrl: mediaUrlVal
    };
    
    if (roundVal === 'single') {
      const cat = getCategory(deck.singleJeopardy.categories, categoryVal);
      cat.clues.push(clueObj);
    } else if (roundVal === 'double') {
      const cat = getCategory(deck.doubleJeopardy.categories, categoryVal);
      cat.clues.push(clueObj);
    } else if (roundVal === 'final') {
      deck.finalJeopardy = {
        category: categoryVal,
        question: questionVal,
        answer: answerVal,
        mediaType: mediaTypeVal,
        mediaUrl: mediaUrlVal
      };
    }
  }
  
  // Sort clues inside categories by value to ensure orderly boards
  const sortByValue = (a, b) => a.value - b.value;
  deck.singleJeopardy.categories.forEach(cat => cat.clues.sort(sortByValue));
  deck.doubleJeopardy.categories.forEach(cat => cat.clues.sort(sortByValue));
  
  return deck;
}

// Sync command emitter
function broadcastAction(action, payload = null) {
  // 1. BroadcastChannel (modern samedomain tab sync)
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ action, payload });
    } catch (e) {
      console.warn("BroadcastChannel postMessage failed:", e);
    }
  }
  
  // 2. Direct Window Messaging (Offline file:// protocol fallback)
  directWindows.forEach(win => {
    try {
      if (win && !win.closed) {
        win.postMessage({ action, payload }, '*');
      } else {
        directWindows.delete(win);
      }
    } catch (e) {
      console.warn("Failed to direct postMessage to child window:", e);
      directWindows.delete(win);
    }
  });
}
