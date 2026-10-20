// Multi-Channel Notification & Reminder Engine
// Browser Notification API + Web Audio synthesized chime + Floating Banner + 5s Demo Mode

import { playChime } from './audio.js';

class ReminderEngine {
  constructor() {
    this.intervalId = null;
    this.tasks = [];
    this.notifiedTaskIds = new Set();
    this.activeAlerts = [];
    this.onTaskActionCallback = null;
    this.originalDocumentTitle = document.title || 'TaskFlow Studio';
    this.demoTimer = null;
  }

  init({ onTaskAction }) {
    this.onTaskActionCallback = onTaskAction;
    this.startPolling();
    this.updateNotificationPill();

    // Re-check permissions if changed
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        this.updateNotificationPill();
      }
    }
  }

  setTasks(tasks) {
    this.tasks = tasks || [];
    this.checkReminders();
    this.updateDocumentTitle();
  }

  startPolling() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      this.checkReminders();
      this.updateDocumentTitle();
    }, 10_000); // 10s check
  }

  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  checkReminders() {
    const now = Date.now();

    for (const task of this.tasks) {
      if (task.completed) continue;

      const reminderTime = task.reminderAt ? new Date(task.reminderAt).getTime() : null;
      const dueTime = task.dueAt ? new Date(task.dueAt).getTime() : null;

      // Trigger if reminder or due is reached (within a reasonable window of 1 hour ago to right now)
      const targetTime = reminderTime || dueTime;
      if (!targetTime) continue;

      const isDueNow = targetTime <= now && now - targetTime < 3600_000 * 24; // within last 24h
      if (isDueNow && !this.notifiedTaskIds.has(task.id) && !task.reminderSent) {
        this.triggerNotification(task);
      }
    }
  }

  triggerNotification(task) {
    this.notifiedTaskIds.add(task.id);

    // 1. Web Audio Synthesized Chime
    playChime();

    // 2. Browser Native Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification(`⏰ Task Reminder: ${task.title}`, {
          body: `Priority: ${task.priority.toUpperCase()} | Category: ${task.category}\nDue: ${task.dueAt ? new Date(task.dueAt).toLocaleTimeString() : 'Now'}`,
          icon: '/favicon.ico',
          tag: `task-${task.id}`,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch (e) {
        console.warn('Native notification failed:', e);
      }
    }

    // 3. In-App Floating Banner Alert
    this.showInAppBanner(task);

    // 4. Update Tab Title
    this.updateDocumentTitle();
  }

  showInAppBanner(task) {
    const container = document.getElementById('reminder-banner-container');
    if (!container) return;

    // Remove existing banner for same task if any
    const existing = container.querySelector(`[data-task-id="${task.id}"]`);
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'reminder-banner';
    banner.dataset.taskId = task.id;
    banner.setAttribute('role', 'alert');

    banner.innerHTML = `
      <div class="reminder-banner-content">
        <div class="reminder-banner-badge priority-${task.priority || 'medium'}">
          <span class="bell-icon">🔔</span>
          <strong>REMINDER</strong>
        </div>
        <div class="reminder-banner-text">
          <h4 class="reminder-banner-title">${escapeHtml(task.title)}</h4>
          <p class="reminder-banner-meta">Category: #${escapeHtml(task.category || 'General')} · Priority: ${task.priority || 'medium'}</p>
        </div>
      </div>
      <div class="reminder-banner-actions">
        <button type="button" class="btn btn-sm btn-primary btn-complete-alert">
          ✅ Complete
        </button>
        <button type="button" class="btn btn-sm btn-secondary btn-snooze-5">
          💤 +5m
        </button>
        <button type="button" class="btn btn-sm btn-secondary btn-snooze-15">
          💤 +15m
        </button>
        <button type="button" class="btn btn-sm btn-accent btn-focus-alert">
          🎯 Focus
        </button>
        <button type="button" class="btn btn-icon btn-dismiss-alert" aria-label="Dismiss alert">
          ✕
        </button>
      </div>
    `;

    // Wire action buttons
    banner.querySelector('.btn-complete-alert').onclick = () => {
      banner.remove();
      this.updateDocumentTitle();
      if (this.onTaskActionCallback) {
        this.onTaskActionCallback('complete', task.id);
      }
    };

    banner.querySelector('.btn-snooze-5').onclick = () => {
      banner.remove();
      this.updateDocumentTitle();
      if (this.onTaskActionCallback) {
        this.onTaskActionCallback('snooze', task.id, 5);
      }
    };

    banner.querySelector('.btn-snooze-15').onclick = () => {
      banner.remove();
      this.updateDocumentTitle();
      if (this.onTaskActionCallback) {
        this.onTaskActionCallback('snooze', task.id, 15);
      }
    };

    banner.querySelector('.btn-focus-alert').onclick = () => {
      banner.remove();
      this.updateDocumentTitle();
      if (this.onTaskActionCallback) {
        this.onTaskActionCallback('focus', task.id);
      }
    };

    banner.querySelector('.btn-dismiss-alert').onclick = () => {
      banner.remove();
      this.updateDocumentTitle();
    };

    container.appendChild(banner);
  }

  updateDocumentTitle() {
    const overdueCount = this.tasks.filter(
      t => !t.completed && t.dueAt && new Date(t.dueAt).getTime() < Date.now()
    ).length;

    const bannerCount = document.querySelectorAll('.reminder-banner').length;
    const totalAlerts = overdueCount + bannerCount;

    if (totalAlerts > 0) {
      document.title = `(${totalAlerts} ⏰) TaskFlow Studio`;
    } else {
      document.title = this.originalDocumentTitle;
    }
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return false;
    }
    const permission = await Notification.requestPermission();
    this.updateNotificationPill();
    return permission === 'granted';
  }

  updateNotificationPill() {
    const pill = document.getElementById('notification-status-pill');
    if (!pill) return;

    if (!('Notification' in window)) {
      pill.innerHTML = `<span>🔕 Alerts Unsupported</span>`;
      pill.classList.remove('active');
      return;
    }

    if (Notification.permission === 'granted') {
      pill.innerHTML = `<span class="dot-green">●</span> <span>🔔 Alerts Active</span>`;
      pill.classList.add('active');
      pill.title = 'Desktop notifications are enabled. Click to test.';
    } else if (Notification.permission === 'denied') {
      pill.innerHTML = `<span class="dot-red">●</span> <span>🔕 Alerts Blocked</span>`;
      pill.classList.remove('active');
      pill.title = 'Notifications are blocked in your browser settings.';
    } else {
      pill.innerHTML = `<span class="dot-amber">●</span> <span>🔔 Enable Alerts</span>`;
      pill.classList.remove('active');
      pill.title = 'Click to enable native browser notifications';
    }
  }

  /**
   * 1-Click 5-Second Live Demo for Professor Presentation
   */
  triggerDemo5s() {
    if (this.demoTimer) clearTimeout(this.demoTimer);

    // Create a temporary live demo mock task
    const demoTask = {
      id: 'demo-reminder-' + Date.now(),
      title: 'Prepare Final System Architecture Demo for Professor',
      category: 'Academic',
      priority: 'urgent',
      dueAt: new Date(Date.now() + 5000).toISOString(),
      reminderAt: new Date(Date.now() + 5000).toISOString(),
      completed: false,
      reminderSent: false,
    };

    // Show instant countdown indicator
    const container = document.getElementById('reminder-banner-container');
    if (!container) return;

    const countdownBanner = document.createElement('div');
    countdownBanner.className = 'reminder-banner countdown-demo-banner';
    countdownBanner.innerHTML = `
      <div class="reminder-banner-content">
        <span class="spin-icon">⏳</span>
        <div>
          <strong>Live Reminder Demo Running...</strong>
          <p>Chime, OS alert & banner triggering in <span id="demo-seconds-left">5</span>s!</p>
        </div>
      </div>
    `;
    container.appendChild(countdownBanner);

    let seconds = 5;
    const ticker = setInterval(() => {
      seconds--;
      const el = document.getElementById('demo-seconds-left');
      if (el) el.textContent = seconds;
      if (seconds <= 0) {
        clearInterval(ticker);
        countdownBanner.remove();
        this.triggerNotification(demoTask);
      }
    }, 1000);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const reminderEngine = new ReminderEngine();
