// Live Three-Tier Architecture & Telemetry Inspector
// Tracks Browser Client -> Express API -> PostgreSQL round trips and displays live network logs & SQL statements

import { onTelemetry, apiGet } from './api.js';

class TelemetryInspector {
  constructor() {
    this.logs = [];
    this.isOpen = false;
    this.currentSql = 'SELECT NOW() AS server_time, current_database() AS db_name FROM tasks;';
    this.currentLatency = 0;
    this.dbStatus = 'Connected';
    this.onStateChange = null;
  }

  init() {
    this.bindDom();
    onTelemetry(record => this.handleTelemetryRecord(record));
    this.pingHealth(); // initial ping
  }

  bindDom() {
    const dockBar = document.getElementById('telemetry-dock-bar');
    const closeBtn = document.getElementById('telemetry-drawer-close');
    const pingBtn = document.getElementById('ping-stack-btn');

    if (dockBar) {
      dockBar.addEventListener('click', e => {
        // Prevent toggle if clicking ping or a specific sub-button
        if (e.target.closest('#ping-stack-btn')) return;
        this.toggleDrawer();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeDrawer());
    }

    if (pingBtn) {
      pingBtn.addEventListener('click', e => {
        e.stopPropagation();
        this.pingHealth();
      });
    }
  }

  toggleDrawer() {
    this.isOpen = !this.isOpen;
    const drawer = document.getElementById('telemetry-drawer');
    const toggleIcon = document.getElementById('telemetry-toggle-icon');

    if (drawer) {
      drawer.hidden = !this.isOpen;
      if (this.isOpen) {
        drawer.classList.add('open');
      } else {
        drawer.classList.remove('open');
      }
    }
    if (toggleIcon) {
      toggleIcon.textContent = this.isOpen ? '▼' : '▲';
    }
  }

  closeDrawer() {
    this.isOpen = false;
    const drawer = document.getElementById('telemetry-drawer');
    const toggleIcon = document.getElementById('telemetry-toggle-icon');
    if (drawer) {
      drawer.hidden = true;
      drawer.classList.remove('open');
    }
    if (toggleIcon) {
      toggleIcon.textContent = '▲';
    }
  }

  handleTelemetryRecord(record) {
    this.currentLatency = record.latencyMs || 0;
    this.currentSql = record.sql || 'SELECT 1;';
    this.dbStatus = record.status || 'Connected';

    // Add to history
    this.logs.unshift({
      ...record,
      timeString: new Date().toLocaleTimeString(),
    });
    if (this.logs.length > 25) this.logs.pop();

    this.render();
  }

  async pingHealth() {
    const packet = document.getElementById('telemetry-packet');
    if (packet) {
      packet.classList.remove('traveling');
      void packet.offsetWidth; // retrigger animation
      packet.classList.add('traveling');
    }

    try {
      const data = await apiGet('/api/health');
      this.dbStatus = data.status === 'healthy' ? 'Connected' : 'Degraded';
      this.currentLatency = data.dbLatencyMs ? Math.round(data.dbLatencyMs * 10) / 10 : 12;

      // Update health stats display
      const statEl = document.getElementById('telemetry-health-stats');
      if (statEl) {
        statEl.innerHTML = `
          <span>DB Latency: <strong>${this.currentLatency}ms</strong></span>
          <span>Tasks in DB: <strong>${data.totalTasks ?? 0}</strong></span>
          <span>PostgreSQL: <strong>${data.tiers?.postgres || 'Connected'}</strong></span>
        `;
      }
    } catch (err) {
      this.dbStatus = 'Disconnected';
      console.warn('Health ping failed:', err);
    }

    this.render();
  }

  render() {
    // 1. Update Collapsed Dock Badges
    const latencyEl = document.getElementById('telemetry-dock-latency');
    const dbStatusEl = document.getElementById('telemetry-dock-db');
    const headerPill = document.getElementById('header-db-pill');

    if (latencyEl) {
      latencyEl.textContent = `${this.currentLatency}ms`;
    }

    if (dbStatusEl) {
      dbStatusEl.textContent = this.dbStatus;
      dbStatusEl.className = `status-badge ${this.dbStatus === 'Connected' ? 'status-ok' : 'status-err'}`;
    }

    if (headerPill) {
      headerPill.innerHTML = `
        <span class="dot-${this.dbStatus === 'Connected' ? 'green' : 'red'}">●</span>
        <span>PostgreSQL ${this.dbStatus} · ${this.currentLatency}ms</span>
      `;
    }

    // 2. Update SQL Inspector View
    const sqlEl = document.getElementById('telemetry-sql-code');
    if (sqlEl) {
      sqlEl.textContent = this.currentSql;
    }

    // 3. Update Request Log Table
    const logContainer = document.getElementById('telemetry-log-tbody');
    if (logContainer) {
      logContainer.innerHTML = this.logs
        .map(
          log => `
        <tr class="log-row">
          <td class="log-time">${log.timeString}</td>
          <td><span class="method-tag method-${log.method.toLowerCase()}">${log.method}</span></td>
          <td class="log-path"><code>${escapeHtml(log.path)}</code></td>
          <td><span class="status-code ${log.statusCode >= 200 && log.statusCode < 300 ? 'status-2xx' : 'status-err'}">${log.statusCode || 'ERR'}</span></td>
          <td class="log-latency">${log.latencyMs}ms</td>
        </tr>
      `
        )
        .join('');
    }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const telemetryInspector = new TelemetryInspector();
