// Pomodoro Focus Studio with Live PostgreSQL Time-Tracking
// SVG progress ring, audio cues, and background synchronization of actual_seconds_spent

import { playChime, playClick, playCelebration } from './audio.js';

class FocusStudio {
  constructor() {
    this.currentTask = null;
    this.totalSeconds = 25 * 60;
    this.remainingSeconds = 25 * 60;
    this.isRunning = false;
    this.timerId = null;
    this.syncIntervalId = null;
    this.elapsedInSession = 0;
    this.onSyncTimeCallback = null;
    this.onCompleteTaskCallback = null;
  }

  init({ onSyncTime, onCompleteTask }) {
    this.onSyncTimeCallback = onSyncTime;
    this.onCompleteTaskCallback = onCompleteTask;
    this.bindDom();
    this.render();
  }

  bindDom() {
    const playBtn = document.getElementById('focus-play-btn');
    const pauseBtn = document.getElementById('focus-pause-btn');
    const resetBtn = document.getElementById('focus-reset-btn');
    const completeBtn = document.getElementById('focus-complete-btn');
    const modeBtns = document.querySelectorAll('.focus-mode-btn');

    if (playBtn) playBtn.addEventListener('click', () => this.start());
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.pause());
    if (resetBtn) resetBtn.addEventListener('click', () => this.reset());
    if (completeBtn) completeBtn.addEventListener('click', () => this.complete());

    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.mins, 10) || 25;
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.setDuration(mins);
      });
    });
  }

  setTask(task) {
    if (!task) return;
    // If currently running on another task, flush seconds first
    if (this.currentTask && this.elapsedInSession > 0) {
      this.flushTime();
    }

    this.currentTask = task;
    const est = task.estimatedMinutes || 25;
    this.setDuration(est);

    const titleEl = document.getElementById('focus-task-title');
    const metaEl = document.getElementById('focus-task-meta');
    const widget = document.getElementById('focus-studio-widget');

    if (titleEl) titleEl.textContent = task.title;
    if (metaEl) {
      const actualMins = Math.round((task.actualSecondsSpent || 0) / 60);
      metaEl.textContent = `#${task.category || 'General'} · ⏱ ${actualMins}m logged of ${est}m estimated`;
    }
    if (widget) {
      widget.classList.add('has-task');
    }

    this.render();
  }

  setDuration(minutes) {
    this.pause();
    this.totalSeconds = minutes * 60;
    this.remainingSeconds = this.totalSeconds;
    this.render();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    playClick();

    this.timerId = setInterval(() => {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;
        this.elapsedInSession++;
        this.render();
      } else {
        this.timeUp();
      }
    }, 1000);

    // Sync to PostgreSQL every 30 seconds
    if (this.syncIntervalId) clearInterval(this.syncIntervalId);
    this.syncIntervalId = setInterval(() => {
      this.flushTime();
    }, 30_000);

    this.updateControls();
  }

  pause() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    playClick();
    this.flushTime();
    this.updateControls();
  }

  reset() {
    this.pause();
    this.remainingSeconds = this.totalSeconds;
    this.render();
  }

  complete() {
    this.pause();
    playCelebration();
    if (this.currentTask && this.onCompleteTaskCallback) {
      this.onCompleteTaskCallback(this.currentTask.id);
    }
  }

  timeUp() {
    this.pause();
    playChime();
    alert(
      `🎉 Focus Session Complete!\nGreat work on: ${this.currentTask ? this.currentTask.title : 'your session'}`
    );
  }

  flushTime() {
    if (!this.currentTask || this.elapsedInSession === 0) return;
    const secondsToAdd = this.elapsedInSession;
    this.elapsedInSession = 0;

    const newTotalSeconds = (this.currentTask.actualSecondsSpent || 0) + secondsToAdd;
    this.currentTask.actualSecondsSpent = newTotalSeconds;

    if (this.onSyncTimeCallback) {
      this.onSyncTimeCallback(this.currentTask.id, newTotalSeconds);
    }
  }

  updateControls() {
    const playBtn = document.getElementById('focus-play-btn');
    const pauseBtn = document.getElementById('focus-pause-btn');

    if (playBtn) playBtn.hidden = this.isRunning;
    if (pauseBtn) pauseBtn.hidden = !this.isRunning;
  }

  render() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const timeDisplay = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const timerText = document.getElementById('focus-timer-text');
    if (timerText) timerText.textContent = timeDisplay;

    // SVG Circular Progress Ring (circumference = 2 * PI * r = 2 * 3.14159 * 54 = ~339.29)
    const ring = document.getElementById('focus-progress-ring');
    if (ring) {
      const radius = 54;
      const circumference = 2 * Math.PI * radius;
      const percent = this.totalSeconds > 0 ? this.remainingSeconds / this.totalSeconds : 1;
      const offset = circumference * (1 - percent);
      ring.style.strokeDasharray = `${circumference} ${circumference}`;
      ring.style.strokeDashoffset = offset;
    }
  }
}

export const focusStudio = new FocusStudio();
