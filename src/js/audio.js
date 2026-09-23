/**
 * Web Audio API Sound Effects Engine
 * Generates custom retro-classic game show sounds completely offline.
 */

const gameAudio = {
  ctx: null,
  enabled: true,
  activeNodes: new Set(),

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  toggle(state) {
    this.enabled = state;
    if (!state) {
      this.stopAll();
    }
  },

  trackNode(osc, gain = null) {
    if (!this.activeNodes) {
      this.activeNodes = new Set();
    }
    const item = { osc, gain };
    this.activeNodes.add(item);
    osc.onended = () => {
      try {
        if (gain) gain.disconnect();
        osc.disconnect();
      } catch (e) {}
      if (this.activeNodes) {
        this.activeNodes.delete(item);
      }
    };
  },

  stopAll() {
    if (this.activeNodes) {
      this.activeNodes.forEach(item => {
        try {
          if (item.osc) {
            item.osc.stop();
            item.osc.disconnect();
          }
          if (item.gain) {
            item.gain.disconnect();
          }
        } catch (e) {
          // Ignore already stopped or unstarted nodes
        }
      });
      this.activeNodes.clear();
    }
  },

  playSelect() {
    if (!this.enabled) return;
    this.init();
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    this.trackNode(osc, gain);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.15); // A5
    
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  },

  playBuzzer() {
    if (!this.enabled) return;
    this.init();
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    this.trackNode(osc, gain);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.4);
    
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  },

  playCorrect() {
    if (!this.enabled) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const playNote = (freq, start, duration) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      this.trackNode(osc, gain);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + start);
      
      gain.gain.setValueAtTime(0.15, now + start);
      gain.gain.exponentialRampToValueAtTime(0.01, now + start + duration);
      
      osc.start(now + start);
      osc.stop(now + start + duration);
    };
    
    // Play upbeat major chord arpeggio
    playNote(523.25, 0, 0.25);    // C5
    playNote(659.25, 0.1, 0.25);  // E5
    playNote(783.99, 0.2, 0.25);  // G5
    playNote(1046.50, 0.3, 0.45); // C6
  },

  playIncorrect() {
    if (!this.enabled) return;
    this.init();
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    this.trackNode(osc, gain);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.setValueAtTime(110, this.ctx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  },

  playDailyDouble() {
    if (!this.enabled) return;
    this.init();
    
    const now = this.ctx.currentTime;
    // Dramatic synthesized laser slide sweep
    const sweep = (start, length, type = 'sawtooth') => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      this.trackNode(osc, gain);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = type;
      osc.frequency.setValueAtTime(100, now + start);
      osc.frequency.exponentialRampToValueAtTime(900, now + start + length);
      
      gain.gain.setValueAtTime(0.12, now + start);
      gain.gain.exponentialRampToValueAtTime(0.01, now + start + length);
      
      osc.start(now + start);
      osc.stop(now + start + length);
    };
    
    sweep(0, 0.35);
    sweep(0.15, 0.4, 'triangle');
    sweep(0.3, 0.5, 'sine');
  },

  playFinalJeopardy() {
    if (!this.enabled) return;
    this.init();
    
    const now = this.ctx.currentTime;
    let timeOffset = 0;
    
    // Play retro clock tick sequence
    const tickMelody = [
      440.00, 493.88, 523.25, 493.88, // A4, B4, C5, B4
      440.00, 392.00, 349.23, 392.00, // A4, G4, F4, G4
      440.00, 493.88, 523.25, 587.33, // A4, B4, C5, D5
      659.25, 587.33, 523.25, 440.00  // E5, D5, C5, A4
    ];
    
    // 30 seconds count ticking loops
    for (let loop = 0; loop < 7; loop++) {
      tickMelody.forEach((freq, index) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        this.trackNode(osc, gain);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + timeOffset);
        
        gain.gain.setValueAtTime(0.08, now + timeOffset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.22);
        
        osc.start(now + timeOffset);
        osc.stop(now + timeOffset + 0.25);
        
        timeOffset += 0.25;
      });
    }
    
    // Add dramatic final chime at 30 seconds
    const endOsc = this.ctx.createOscillator();
    const endGain = this.ctx.createGain();
    this.trackNode(endOsc, endGain);
    endOsc.connect(endGain);
    endGain.connect(this.ctx.destination);
    
    endOsc.type = 'triangle';
    endOsc.frequency.setValueAtTime(220, now + timeOffset);
    endOsc.frequency.exponentialRampToValueAtTime(880, now + timeOffset + 0.8);
    
    endGain.gain.setValueAtTime(0.2, now + timeOffset);
    endGain.gain.exponentialRampToValueAtTime(0.01, now + timeOffset + 0.8);
    
    endOsc.start(now + timeOffset);
    endOsc.stop(now + timeOffset + 0.8);
  },

  playVictoryFanfare() {
    if (!this.enabled) return;
    this.init();
    
    const now = this.ctx.currentTime;
    const playNote = (freq, start, duration, type = 'triangle', volume = 0.15) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      this.trackNode(osc, gain);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);
      
      gain.gain.setValueAtTime(volume, now + start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      
      osc.start(now + start);
      osc.stop(now + start + duration);
    };
    
    // Fast ascending triumphant major arpeggio sweep
    const notes = [
      261.63, // C4
      329.63, // E4
      392.00, // G4
      523.25, // C5
      659.25, // E5
      783.99, // G5
      1046.50 // C6
    ];
    
    notes.forEach((freq, idx) => {
      playNote(freq, idx * 0.08, 0.35, 'triangle', 0.12);
    });
    
    // Play a sustained rich C Major triad at the peak
    const chordStart = notes.length * 0.08;
    const chordDuration = 1.5;
    playNote(523.25, chordStart, chordDuration, 'sine', 0.1);             // C5
    playNote(659.25, chordStart + 0.04, chordDuration, 'triangle', 0.08);   // E5
    playNote(783.99, chordStart + 0.08, chordDuration, 'triangle', 0.08);   // G5
    playNote(1046.50, chordStart + 0.12, chordDuration, 'sine', 0.08);      // C6
  }
};
