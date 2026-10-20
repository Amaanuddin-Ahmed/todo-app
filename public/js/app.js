// TaskFlow Studio - Main Application Controller
// Modular, XSS-safe, Three-Tier Architecture (Browser -> Express API -> PostgreSQL)

import { apiGet, apiPost, apiPatch, apiPut, apiDelete, ApiError } from './api.js';
import { parseNaturalLanguageTask } from './parser.js';
import { reminderEngine } from './reminders.js';
import { telemetryInspector } from './telemetry.js';
import { focusStudio } from './focus.js';
import { playClick, playCelebration } from './audio.js';

// ---- Application State ----
let tasks = [];
let isInitialLoading = true;
let currentView = 'list'; // 'list' | 'eisenhower' | 'focus'
let currentStatusFilter = 'all'; // 'all' | 'active' | 'today' | 'overdue' | 'completed'
let currentCategoryFilter = 'all';
let currentSort = 'smartPriority';
let searchQuery = '';
let smartParseEnabled = true;
let lastDeletedTask = null;
let undoTimeoutId = null;

// ---- DOM Elements ----
const taskForm = document.getElementById('task-form');
const titleInput = document.getElementById('task-title');
const submitBtn = document.getElementById('submit-btn');
const titleError = document.getElementById('title-error');
const tokenPreviewStrip = document.getElementById('token-preview-strip');
const smartParseChip = document.getElementById('smart-parse-chip');
const composerExpandToggle = document.getElementById('composer-expand-toggle');
const composerDrawer = document.getElementById('composer-drawer');
const composerPriority = document.getElementById('composer-priority');
const composerCategory = document.getElementById('composer-category');
const composerEffort = document.getElementById('composer-effort');
const composerDue = document.getElementById('composer-due');
const composerNotes = document.getElementById('composer-notes');

const taskList = document.getElementById('task-list');
const skeletonLoader = document.getElementById('skeleton-loader');
const emptyState = document.getElementById('empty-state');
const emptyStateDesc = document.getElementById('empty-state-desc');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');
const seedDemoTasksBtn = document.getElementById('seed-demo-tasks-btn');

const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const categoryPillsContainer = document.getElementById('category-pills');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const exportBtn = document.getElementById('export-btn');
const autoPickFrogBtn = document.getElementById('auto-pick-frog-btn');

const undoToast = document.getElementById('undo-toast');
const undoToastText = document.getElementById('undo-toast-text');
const undoActionBtn = document.getElementById('undo-action-btn');
const undoDismissBtn = document.getElementById('undo-dismiss-btn');

const themeToggleBtn = document.getElementById('theme-toggle-btn');
const shortcutsBtn = document.getElementById('shortcuts-btn');
const shortcutsModal = document.getElementById('shortcuts-modal');
const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');
const testDemoBtn = document.getElementById('test-demo-5s-btn');
const notificationPill = document.getElementById('notification-status-pill');

// ---- Initialization ----
function init() {
  initTheme();
  bindGlobalEvents();
  bindComposerEvents();
  bindFilterEvents();
  bindViewEvents();

  // Initialize sub-modules
  telemetryInspector.init();
  reminderEngine.init({
    onTaskAction: handleReminderAction,
  });
  focusStudio.init({
    onSyncTime: handleFocusTimeSync,
    onCompleteTask: handleFocusComplete,
  });

  // Initial cold load
  loadTasks({ isInitial: true });

  // Quiet background revalidation on tab focus
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadTasks({ isInitial: false });
    }
  });
}

// ---- Theme Handling ----
function initTheme() {
  const savedTheme = localStorage.getItem('taskflow_theme') || 'dark';
  setTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('taskflow_theme', theme);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
  }
}

// ---- Data Fetching ----
async function loadTasks({ isInitial = false } = {}) {
  if (isInitial) {
    isInitialLoading = true;
    if (skeletonLoader) skeletonLoader.hidden = false;
    if (taskList) taskList.hidden = true;
    if (emptyState) emptyState.hidden = true;
    if (errorState) errorState.hidden = true;
  }

  try {
    const data = await apiGet('/api/todos');
    tasks = data.tasks || [];
    errorState.hidden = true;
    renderAll();
    reminderEngine.setTasks(tasks);
  } catch (err) {
    console.error('Failed to load tasks:', err);
    if (tasks.length === 0) {
      if (errorState) {
        errorState.hidden = false;
        if (errorMessage) errorMessage.textContent = err.message || 'Failed to connect to PostgreSQL';
      }
      if (taskList) taskList.hidden = true;
      if (emptyState) emptyState.hidden = true;
    }
  } finally {
    if (isInitial) {
      isInitialLoading = false;
      if (skeletonLoader) skeletonLoader.hidden = true;
    }
  }
}

// ---- Rendering Master ----
function renderAll() {
  renderKpiStrip();
  renderCategoryPills();
  renderTaskList();
  renderEisenhowerMatrix();
}

// 1. KPI Summary Strip
function renderKpiStrip() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const rateEl = document.getElementById('kpi-completion-rate');
  const ratioEl = document.getElementById('kpi-completed-ratio');
  const fillEl = document.getElementById('kpi-progress-fill');
  if (rateEl) rateEl.textContent = `${rate}%`;
  if (ratioEl) ratioEl.textContent = `${completed} of ${total} tasks done`;
  if (fillEl) fillEl.style.width = `${rate}%`;

  // Due / Overdue
  const now = Date.now();
  const overdueTasks = tasks.filter(
    t => !t.completed && t.dueAt && new Date(t.dueAt).getTime() < now
  );
  const dueTodayTasks = tasks.filter(t => {
    if (t.completed || !t.dueAt) return false;
    const dueTime = new Date(t.dueAt).getTime();
    return dueTime >= now && dueTime <= now + 86400_000;
  });

  const dueCountEl = document.getElementById('kpi-due-count');
  const overdueTextEl = document.getElementById('kpi-overdue-text');
  if (dueCountEl) dueCountEl.textContent = `${overdueTasks.length + dueTodayTasks.length}`;
  if (overdueTextEl) {
    if (overdueTasks.length > 0) {
      overdueTextEl.textContent = `⚠️ ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}!`;
      overdueTextEl.style.color = 'var(--priority-urgent)';
    } else {
      overdueTextEl.textContent = 'All deadlines on track';
      overdueTextEl.style.color = 'var(--text-secondary)';
    }
  }

  // Overdue tab highlight
  const overdueTab = document.getElementById('tab-filter-overdue');
  if (overdueTab) {
    if (overdueTasks.length > 0) {
      overdueTab.classList.add('overdue-alert');
    } else {
      overdueTab.classList.remove('overdue-alert');
    }
  }

  // Cognitive load (budget: 180m default)
  const activeTodayTasks = tasks.filter(t => !t.completed);
  const totalEstimatedMins = activeTodayTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 25), 0);
  const cognitiveTimeEl = document.getElementById('kpi-cognitive-time');
  const loadBadge = document.getElementById('cognitive-load-badge');

  if (cognitiveTimeEl) {
    const hours = Math.floor(totalEstimatedMins / 60);
    const mins = totalEstimatedMins % 60;
    cognitiveTimeEl.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }
  if (loadBadge) {
    if (totalEstimatedMins <= 180) {
      loadBadge.className = 'load-indicator load-optimal';
      loadBadge.textContent = 'Optimal';
    } else if (totalEstimatedMins <= 300) {
      loadBadge.className = 'load-indicator load-heavy';
      loadBadge.textContent = 'Heavy';
    } else {
      loadBadge.className = 'load-indicator load-overloaded';
      loadBadge.textContent = 'Overloaded';
    }
  }

  // Total Focus Time Logged
  const totalSecondsLogged = tasks.reduce((sum, t) => sum + (t.actualSecondsSpent || 0), 0);
  const focusLoggedEl = document.getElementById('kpi-focus-logged');
  if (focusLoggedEl) {
    const focusMins = Math.round(totalSecondsLogged / 60);
    const h = Math.floor(focusMins / 60);
    const m = focusMins % 60;
    focusLoggedEl.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // Counts on Filter Tabs
  const countAll = document.getElementById('badge-count-all');
  const countActive = document.getElementById('badge-count-active');
  const countToday = document.getElementById('badge-count-today');
  const countOverdue = document.getElementById('badge-count-overdue');
  const countCompleted = document.getElementById('badge-count-completed');

  if (countAll) countAll.textContent = tasks.length;
  if (countActive) countActive.textContent = tasks.filter(t => !t.completed).length;
  if (countToday) countToday.textContent = dueTodayTasks.length;
  if (countOverdue) countOverdue.textContent = overdueTasks.length;
  if (countCompleted) countCompleted.textContent = completed;
}

// 2. Category Pills
function renderCategoryPills() {
  if (!categoryPillsContainer) return;

  const categories = new Set(['General']);
  tasks.forEach(t => {
    if (t.category) categories.add(t.category);
  });

  const html = [
    `<button type="button" class="category-pill ${currentCategoryFilter === 'all' ? 'active' : ''}" data-cat="all">All Categories</button>`,
  ];

  categories.forEach(cat => {
    const isActive = currentCategoryFilter === cat;
    html.push(
      `<button type="button" class="category-pill ${isActive ? 'active' : ''}" data-cat="${escapeHtml(cat)}">#${escapeHtml(cat)}</button>`
    );
  });

  categoryPillsContainer.innerHTML = html.join('');

  categoryPillsContainer.querySelectorAll('.category-pill').forEach(btn => {
    btn.onclick = () => {
      currentCategoryFilter = btn.dataset.cat;
      renderAll();
    };
  });
}

// 3. Filtered & Sorted Tasks
function getFilteredTasks() {
  let list = [...tasks];
  const now = Date.now();

  // Status Filter
  if (currentStatusFilter === 'active') {
    list = list.filter(t => !t.completed);
  } else if (currentStatusFilter === 'completed') {
    list = list.filter(t => t.completed);
  } else if (currentStatusFilter === 'today') {
    list = list.filter(t => {
      if (t.completed || !t.dueAt) return false;
      const due = new Date(t.dueAt).getTime();
      return due >= now && due <= now + 86400_000;
    });
  } else if (currentStatusFilter === 'overdue') {
    list = list.filter(t => !t.completed && t.dueAt && new Date(t.dueAt).getTime() < now);
  }

  // Category Filter
  if (currentCategoryFilter !== 'all') {
    list = list.filter(t => (t.category || 'General').toLowerCase() === currentCategoryFilter.toLowerCase());
  }

  // Search Query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(t => {
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchCat = (t.category || '').toLowerCase().includes(q);
      const matchSub = (t.subtasks || []).some(s => (s.title || '').toLowerCase().includes(q));
      return matchTitle || matchDesc || matchCat || matchSub;
    });
  }

  // Sorting
  const priorityWeights = { urgent: 1, high: 2, medium: 3, low: 4 };
  list.sort((a, b) => {
    // Pinned always top
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    // Completed always bottom
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    switch (currentSort) {
      case 'dueDate': {
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      }
      case 'createdDate':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'effort':
        return (a.estimatedMinutes || 25) - (b.estimatedMinutes || 25);
      case 'timeSpent':
        return (b.actualSecondsSpent || 0) - (a.actualSecondsSpent || 0);
      case 'smartPriority':
      default: {
        const pDiff = (priorityWeights[a.priority] || 3) - (priorityWeights[b.priority] || 3);
        if (pDiff !== 0) return pDiff;
        if (a.dueAt && b.dueAt) {
          return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    }
  });

  return list;
}

// 4. Task List View Rendering
function renderTaskList() {
  if (isInitialLoading) return;

  const filtered = getFilteredTasks();
  taskList.innerHTML = '';

  if (filtered.length === 0) {
    taskList.hidden = true;
    emptyState.hidden = false;
    if (searchQuery || currentStatusFilter !== 'all' || currentCategoryFilter !== 'all') {
      emptyStateDesc.textContent = 'No tasks match your active filters or search terms.';
    } else {
      emptyStateDesc.textContent = 'Your task list is empty. Add a task above or load sample academic tasks.';
    }
    return;
  }

  taskList.hidden = false;
  emptyState.hidden = true;

  const fragment = document.createDocumentFragment();
  filtered.forEach(task => {
    fragment.appendChild(createTaskCardElement(task));
  });
  taskList.appendChild(fragment);
}

// Create Task Card DOM
function createTaskCardElement(task) {
  const li = document.createElement('li');
  li.className = `task-card priority-${task.priority || 'medium'}${task.completed ? ' completed' : ''}${task.pinned ? ' is-pinned' : ''}`;
  li.dataset.id = task.id;

  // Main row
  const mainRow = document.createElement('div');
  mainRow.className = 'task-main-row';

  // Custom Checkbox
  const checkboxWrapper = document.createElement('label');
  checkboxWrapper.className = 'custom-checkbox-wrapper';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'custom-checkbox';
  checkbox.checked = Boolean(task.completed);
  checkbox.setAttribute('aria-label', `Mark "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`);
  checkboxWrapper.appendChild(checkbox);

  // Body
  const body = document.createElement('div');
  body.className = 'task-body';

  const titleRow = document.createElement('div');
  titleRow.className = 'task-title-row';

  if (task.pinned) {
    const pin = document.createElement('span');
    pin.className = 'pinned-badge';
    pin.textContent = '📌';
    pin.title = 'Pinned task';
    titleRow.appendChild(pin);
  }

  const titleSpan = document.createElement('span');
  titleSpan.className = 'task-title';
  titleSpan.textContent = task.title; // XSS-safe
  titleRow.appendChild(titleSpan);
  body.appendChild(titleRow);

  // Notes description
  if (task.description) {
    const descP = document.createElement('p');
    descP.className = 'task-description';
    descP.textContent = task.description; // XSS-safe
    body.appendChild(descP);
  }

  // Metadata chips row
  const metaRow = document.createElement('div');
  metaRow.className = 'task-meta-row';

  // Priority chip
  const priorityChip = document.createElement('span');
  priorityChip.className = `meta-chip chip-${task.priority || 'medium'}`;
  priorityChip.textContent = (task.priority || 'medium').toUpperCase();
  metaRow.appendChild(priorityChip);

  // Category chip
  const catChip = document.createElement('span');
  catChip.className = 'meta-chip';
  catChip.textContent = `#${task.category || 'General'}`;
  metaRow.appendChild(catChip);

  // Due date countdown chip
  if (task.dueAt) {
    const dueChip = document.createElement('span');
    const { label, isOverdue, isDueSoon } = formatCountdown(task.dueAt);
    dueChip.className = `meta-chip ${isOverdue ? 'chip-overdue' : isDueSoon ? 'chip-due-soon' : ''}`;
    dueChip.textContent = `⏰ ${label}`;
    metaRow.appendChild(dueChip);
  }

  // Subtasks progress chip
  const subtasks = task.subtasks || [];
  if (subtasks.length > 0) {
    const doneSub = subtasks.filter(s => s.completed).length;
    const subChip = document.createElement('button');
    subChip.type = 'button';
    subChip.className = 'meta-chip';
    subChip.textContent = `☑ ${doneSub}/${subtasks.length} subtasks ▾`;
    subChip.title = 'Click to toggle checklist';
    subChip.onclick = e => {
      e.stopPropagation();
      toggleSubtasksDrawer(li, task);
    };
    metaRow.appendChild(subChip);
  }

  // Time tracked chip
  const actualMins = Math.round((task.actualSecondsSpent || 0) / 60);
  const estMins = task.estimatedMinutes || 25;
  const timeChip = document.createElement('span');
  timeChip.className = 'meta-chip';
  timeChip.textContent = `⏱ ${actualMins}m / ${estMins}m est`;
  metaRow.appendChild(timeChip);

  body.appendChild(metaRow);

  // Actions Cluster
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const focusBtn = document.createElement('button');
  focusBtn.type = 'button';
  focusBtn.className = 'btn btn-icon btn-sm';
  focusBtn.title = 'Start Pomodoro focus session';
  focusBtn.innerHTML = '▶ Focus';
  focusBtn.onclick = () => {
    switchView('focus');
    focusStudio.setTask(task);
    focusStudio.start();
  };

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'btn btn-icon btn-sm';
  editBtn.title = 'Edit task';
  editBtn.innerHTML = '✎';
  editBtn.onclick = () => openInlineEditor(li, task);

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'btn btn-icon btn-sm';
  pinBtn.title = task.pinned ? 'Unpin task' : 'Pin to top';
  pinBtn.innerHTML = task.pinned ? '📌' : '📍';
  pinBtn.onclick = () => handleTogglePin(task.id);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-icon btn-sm btn-danger';
  deleteBtn.title = 'Delete task';
  deleteBtn.innerHTML = '🗑';
  deleteBtn.onclick = () => handleDeleteTask(task.id);

  actions.appendChild(focusBtn);
  actions.appendChild(editBtn);
  actions.appendChild(pinBtn);
  actions.appendChild(deleteBtn);

  mainRow.appendChild(checkboxWrapper);
  mainRow.appendChild(body);
  mainRow.appendChild(actions);
  li.appendChild(mainRow);

  // Event listener on checkbox
  checkbox.addEventListener('change', () => {
    handleToggleComplete(task.id, checkbox.checked);
  });

  // Double click title for inline edit
  titleSpan.addEventListener('dblclick', () => {
    openInlineEditor(li, task);
  });

  return li;
}

// Subtasks Drawer inside Task Card
function toggleSubtasksDrawer(cardEl, task) {
  let drawer = cardEl.querySelector('.task-subtasks-drawer');
  if (drawer) {
    drawer.remove();
    return;
  }

  drawer = document.createElement('div');
  drawer.className = 'task-subtasks-drawer';

  const subtasks = task.subtasks || [];
  const list = document.createElement('div');
  list.className = 'subtasks-list';

  subtasks.forEach((st, index) => {
    const item = document.createElement('div');
    item.className = `subtask-item ${st.completed ? 'completed' : ''}`;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = Boolean(st.completed);
    cb.onchange = async () => {
      st.completed = cb.checked;
      item.classList.toggle('completed', cb.checked);
      await apiPatch(`/api/todos/${task.id}`, { subtasks });
      renderKpiStrip();
    };

    const span = document.createElement('span');
    span.textContent = st.title;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-icon btn-sm';
    del.innerHTML = '×';
    del.onclick = async () => {
      subtasks.splice(index, 1);
      await apiPatch(`/api/todos/${task.id}`, { subtasks });
      renderTaskList();
      renderKpiStrip();
    };

    item.appendChild(cb);
    item.appendChild(span);
    item.appendChild(del);
    list.appendChild(item);
  });

  // Add subtask input
  const addRow = document.createElement('div');
  addRow.className = 'subtask-add-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'subtask-add-input';
  input.placeholder = 'Add a subtask step...';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-sm btn-secondary';
  addBtn.textContent = '+ Add';

  const submitSubtask = async () => {
    const val = input.value.trim();
    if (!val) return;
    subtasks.push({ id: 'st-' + Date.now(), title: val, completed: false });
    input.value = '';
    await apiPatch(`/api/todos/${task.id}`, { subtasks });
    renderTaskList();
    renderKpiStrip();
  };

  addBtn.onclick = submitSubtask;
  input.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitSubtask();
    }
  };

  addRow.appendChild(input);
  addRow.appendChild(addBtn);

  drawer.appendChild(list);
  drawer.appendChild(addRow);
  cardEl.appendChild(drawer);
}

// Inline Task Editor
function openInlineEditor(cardEl, task) {
  const body = cardEl.querySelector('.task-body');
  if (!body || cardEl.querySelector('.task-inline-editor')) return;

  const originalContent = body.innerHTML;
  body.innerHTML = '';

  const editor = document.createElement('form');
  editor.className = 'task-inline-editor';

  editor.innerHTML = `
    <input type="text" class="inline-edit-input" value="${escapeHtml(task.title)}" required />
    <input type="text" class="composer-input" value="${escapeHtml(task.description || '')}" placeholder="Notes..." />
    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
      <select class="composer-select edit-priority">
        <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
        <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
        <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
        <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
      </select>
      <input type="text" class="composer-input edit-category" value="${escapeHtml(task.category || 'General')}" style="max-width: 130px;" />
      <button type="submit" class="btn btn-sm btn-primary">Save</button>
      <button type="button" class="btn btn-sm btn-secondary cancel-edit">Cancel</button>
    </div>
  `;

  editor.onsubmit = async e => {
    e.preventDefault();
    const newTitle = editor.querySelector('.inline-edit-input').value.trim();
    const newDesc = editor.querySelector('.composer-input').value.trim();
    const newPriority = editor.querySelector('.edit-priority').value;
    const newCategory = editor.querySelector('.edit-category').value.trim() || 'General';

    if (!newTitle) return;

    task.title = newTitle;
    task.description = newDesc;
    task.priority = newPriority;
    task.category = newCategory;

    renderTaskList();
    renderKpiStrip();

    try {
      await apiPatch(`/api/todos/${task.id}`, {
        title: newTitle,
        description: newDesc,
        priority: newPriority,
        category: newCategory,
      });
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  editor.querySelector('.cancel-edit').onclick = () => {
    body.innerHTML = originalContent;
  };

  body.appendChild(editor);
  editor.querySelector('.inline-edit-input').focus();
}

// 5. Eisenhower Matrix Rendering
function renderEisenhowerMatrix() {
  const q1List = document.getElementById('quadrant-q1-list');
  const q2List = document.getElementById('quadrant-q2-list');
  const q3List = document.getElementById('quadrant-q3-list');
  const q4List = document.getElementById('quadrant-q4-list');

  if (!q1List) return;

  q1List.innerHTML = '';
  q2List.innerHTML = '';
  q3List.innerHTML = '';
  q4List.innerHTML = '';

  const now = Date.now();
  let q1Count = 0;
  let q2Count = 0;
  let q3Count = 0;
  let q4Count = 0;

  tasks.filter(t => !t.completed).forEach(task => {
    const isUrgent = task.priority === 'urgent' || (task.dueAt && new Date(task.dueAt).getTime() < now + 86400_000);
    const isHigh = task.priority === 'urgent' || task.priority === 'high';
    const isShort = (task.estimatedMinutes || 25) <= 15;

    let targetList;
    if (isUrgent && isHigh) {
      targetList = q1List;
      q1Count++;
    } else if (isHigh && !isUrgent) {
      targetList = q2List;
      q2Count++;
    } else if (isShort) {
      targetList = q3List;
      q3Count++;
    } else {
      targetList = q4List;
      q4Count++;
    }

    const item = document.createElement('div');
    item.className = 'quadrant-mini-item';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
        <span>${task.priority === 'urgent' ? '🔥' : task.priority === 'high' ? '🎯' : '•'}</span>
        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">${escapeHtml(task.title)}</span>
      </div>
      <button type="button" class="btn btn-sm btn-secondary btn-q-focus" title="Focus now">▶</button>
    `;

    item.querySelector('.btn-q-focus').onclick = () => {
      switchView('focus');
      focusStudio.setTask(task);
      focusStudio.start();
    };

    targetList.appendChild(item);
  });

  const q1CountEl = document.getElementById('q1-count');
  const q2CountEl = document.getElementById('q2-count');
  const q3CountEl = document.getElementById('q3-count');
  const q4CountEl = document.getElementById('q4-count');
  if (q1CountEl) q1CountEl.textContent = `${q1Count} tasks`;
  if (q2CountEl) q2CountEl.textContent = `${q2Count} tasks`;
  if (q3CountEl) q3CountEl.textContent = `${q3Count} tasks`;
  if (q4CountEl) q4CountEl.textContent = `${q4Count} tasks`;
}

// ---- Event Handling & Mutations ----

// 1. Composer Submissions
function bindComposerEvents() {
  if (!taskForm) return;

  // Live Token Parsing
  titleInput.addEventListener('input', () => {
    const raw = titleInput.value;
    submitBtn.disabled = !raw.trim();

    if (smartParseEnabled) {
      const parsed = parseNaturalLanguageTask(raw);
      renderTokenPreviews(parsed.tokens);
    } else {
      tokenPreviewStrip.hidden = true;
    }
  });

  // Toggle Smart Parse Chip
  if (smartParseChip) {
    smartParseChip.addEventListener('click', () => {
      smartParseEnabled = !smartParseEnabled;
      smartParseChip.classList.toggle('active', smartParseEnabled);
      smartParseChip.textContent = smartParseEnabled ? '⚡ Smart Parse: ON' : 'Smart Parse: OFF';
      if (!smartParseEnabled) {
        tokenPreviewStrip.hidden = true;
      } else {
        const parsed = parseNaturalLanguageTask(titleInput.value);
        renderTokenPreviews(parsed.tokens);
      }
    });
  }

  // Toggle Composer Drawer
  if (composerExpandToggle) {
    composerExpandToggle.addEventListener('click', () => {
      composerDrawer.hidden = !composerDrawer.hidden;
      composerExpandToggle.textContent = composerDrawer.hidden ? 'Options ▾' : 'Options ▴';
    });
  }

  // Presets
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const p = chip.dataset.preset;
      const now = new Date();
      let target = new Date();

      if (p === 'in5m') {
        target = new Date(now.getTime() + 5 * 60_000);
      } else if (p === 'in30m') {
        target = new Date(now.getTime() + 30 * 60_000);
      } else if (p === 'tonight') {
        target.setHours(20, 0, 0, 0);
      } else if (p === 'tomorrow') {
        target.setDate(target.getDate() + 1);
        target.setHours(9, 0, 0, 0);
      }

      // Format for datetime-local
      const pad = n => String(n).padStart(2, '0');
      const str = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
      if (composerDue) composerDue.value = str;
    });
  });

  // Form Submit
  taskForm.addEventListener('submit', async e => {
    e.preventDefault();
    const raw = titleInput.value.trim();
    if (!raw) return;

    let finalTitle = raw;
    let priority = composerPriority.value || 'medium';
    let category = composerCategory.value.trim() || 'General';
    let estimatedMinutes = parseInt(composerEffort.value, 10) || 25;
    let dueAt = composerDue.value ? new Date(composerDue.value).toISOString() : null;
    let reminderAt = dueAt;
    const description = composerNotes.value.trim();

    if (smartParseEnabled) {
      const parsed = parseNaturalLanguageTask(raw);
      finalTitle = parsed.cleanTitle || raw;
      if (parsed.priority) priority = parsed.priority;
      if (parsed.category) category = parsed.category;
      if (parsed.estimatedMinutes) estimatedMinutes = parsed.estimatedMinutes;
      if (parsed.dueAt) {
        dueAt = parsed.dueAt;
        reminderAt = parsed.reminderAt;
      }
    }

    const newTask = {
      title: finalTitle,
      description,
      priority,
      category,
      estimatedMinutes,
      dueAt,
      reminderAt,
      completed: false,
      pinned: false,
      subtasks: [],
    };

    submitBtn.disabled = true;
    playClick();

    try {
      const res = await apiPost('/api/todos', newTask);
      tasks.unshift(res.task);
      renderAll();
      reminderEngine.setTasks(tasks);

      // Reset fields
      titleInput.value = '';
      composerNotes.value = '';
      if (composerDue) composerDue.value = '';
      tokenPreviewStrip.hidden = true;
    } catch (err) {
      console.error('Failed to create task:', err);
      alert(`Error creating task: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function renderTokenPreviews(tokens) {
  if (!tokens || tokens.length === 0) {
    tokenPreviewStrip.hidden = true;
    return;
  }
  tokenPreviewStrip.hidden = false;
  tokenPreviewStrip.innerHTML = tokens
    .map(tok => `<span class="token-pill token-${tok.type}-${tok.value || ''} token-${tok.type}">${tok.text}</span>`)
    .join('');
}

// 2. Task Mutations (Toggle, Pin, Delete)
async function handleToggleComplete(id, completed) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const prev = task.completed;
  task.completed = completed;
  if (completed) playCelebration();
  renderAll();

  try {
    await apiPatch(`/api/todos/${id}`, { completed });
  } catch (err) {
    task.completed = prev;
    renderAll();
    console.error('Failed to toggle completion:', err);
  }
}

async function handleTogglePin(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.pinned = !task.pinned;
  renderAll();

  try {
    await apiPatch(`/api/todos/${id}`, { pinned: task.pinned });
  } catch (err) {
    task.pinned = !task.pinned;
    renderAll();
    console.error('Failed to toggle pin:', err);
  }
}

async function handleDeleteTask(id) {
  const index = tasks.findIndex(t => t.id === id);
  if (index === -1) return;

  const removed = tasks.splice(index, 1)[0];
  lastDeletedTask = removed;
  renderAll();
  showUndoToast(`Task "${removed.title}" deleted`);

  try {
    await apiDelete(`/api/todos/${id}`);
  } catch (err) {
    tasks.splice(index, 0, removed);
    renderAll();
    console.error('Failed to delete task:', err);
  }
}

function showUndoToast(msg) {
  if (undoTimeoutId) clearTimeout(undoTimeoutId);
  undoToastText.textContent = msg;
  undoToast.hidden = false;

  undoActionBtn.onclick = async () => {
    undoToast.hidden = true;
    if (lastDeletedTask) {
      const restoreData = {
        title: lastDeletedTask.title,
        description: lastDeletedTask.description,
        priority: lastDeletedTask.priority,
        category: lastDeletedTask.category,
        dueAt: lastDeletedTask.dueAt,
        reminderAt: lastDeletedTask.reminderAt,
        estimatedMinutes: lastDeletedTask.estimatedMinutes,
        actualSecondsSpent: lastDeletedTask.actualSecondsSpent,
        subtasks: lastDeletedTask.subtasks,
        pinned: lastDeletedTask.pinned,
        completed: lastDeletedTask.completed,
      };
      try {
        const res = await apiPost('/api/todos', restoreData);
        tasks.unshift(res.task);
        renderAll();
      } catch (err) {
        console.error('Failed to restore task:', err);
      }
      lastDeletedTask = null;
    }
  };

  undoDismissBtn.onclick = () => {
    undoToast.hidden = true;
    lastDeletedTask = null;
  };

  undoTimeoutId = setTimeout(() => {
    undoToast.hidden = true;
    lastDeletedTask = null;
  }, 7000);
}

// 3. View Switcher
function bindViewEvents() {
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });
}

function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll('.nav-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewName);
  });

  const viewList = document.getElementById('view-list');
  const viewEisenhower = document.getElementById('view-eisenhower');
  const viewFocus = document.getElementById('view-focus');

  if (viewList) viewList.hidden = viewName !== 'list';
  if (viewEisenhower) viewEisenhower.hidden = viewName !== 'eisenhower';
  if (viewFocus) viewFocus.hidden = viewName !== 'focus';

  if (viewName === 'eisenhower') {
    renderEisenhowerMatrix();
  }
}

// 4. Filters & Search & Bulk Actions
function bindFilterEvents() {
  // Status filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentStatusFilter = tab.dataset.status;
      renderTaskList();
    });
  });

  // Search
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim();
      renderTaskList();
    });
  }

  // Sort
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      renderTaskList();
    });
  }

  // Clear completed
  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener('click', async () => {
      const completedTasks = tasks.filter(t => t.completed);
      if (completedTasks.length === 0) return;
      if (!confirm(`Clear all ${completedTasks.length} completed task(s)?`)) return;

      tasks = tasks.filter(t => !t.completed);
      renderAll();

      try {
        await apiPost('/api/todos/clear-completed', {});
      } catch (err) {
        console.error('Failed to clear completed:', err);
        loadTasks({ isInitial: false });
      }
    });
  }

  // Export report
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportTasks();
    });
  }

  // Auto-pick Eat the Frog top 3 focus tasks
  if (autoPickFrogBtn) {
    autoPickFrogBtn.addEventListener('click', () => {
      autoPickTopThreeTasks();
    });
  }

  // Seed sample tasks
  if (seedDemoTasksBtn) {
    seedDemoTasksBtn.addEventListener('click', () => seedSampleAcademicTasks());
  }

  // Retry button
  if (retryBtn) {
    retryBtn.addEventListener('click', () => loadTasks({ isInitial: true }));
  }
}

function autoPickTopThreeTasks() {
  const active = tasks.filter(t => !t.completed);
  if (active.length === 0) {
    alert('No active tasks to pick from!');
    return;
  }

  // Score algorithm: urgent=100, high=50, medium=20, low=10, overdue=+80, dueToday=+40
  const now = Date.now();
  const scored = active.map(t => {
    let score = 0;
    if (t.priority === 'urgent') score += 100;
    else if (t.priority === 'high') score += 50;
    else if (t.priority === 'medium') score += 20;
    else score += 10;

    if (t.dueAt) {
      const diff = new Date(t.dueAt).getTime() - now;
      if (diff < 0) score += 80;
      else if (diff <= 86400_000) score += 40;
    }
    return { task: t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, 3).map(s => s.task);

  alert(
    `✨ Eat the Frog: Top 3 High-Impact Tasks Selected!\n\n` +
      top3.map((t, i) => `${i + 1}. [${(t.priority || 'medium').toUpperCase()}] ${t.title}`).join('\n')
  );

  // Switch to Focus Studio with the #1 top task
  if (top3[0]) {
    switchView('focus');
    focusStudio.setTask(top3[0]);
  }
}

async function seedSampleAcademicTasks() {
  const samples = [
    {
      title: 'Prepare Final System Architecture Demo for Professor',
      category: 'Academic',
      priority: 'urgent',
      estimatedMinutes: 30,
      dueAt: new Date(Date.now() + 5 * 60_000).toISOString(), // 5m demo
      reminderAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      pinned: true,
      subtasks: [
        { id: 'st1', title: 'Test Web Audio API chime', completed: true },
        { id: 'st2', title: 'Open 3-Tier telemetry drawer', completed: false },
        { id: 'st3', title: 'Demonstrate live PostgreSQL latency', completed: false },
      ],
    },
    {
      title: 'Audit Express REST endpoints and query latency',
      category: 'Coding',
      priority: 'high',
      estimatedMinutes: 45,
      dueAt: new Date(Date.now() + 3600_000 * 3).toISOString(),
      pinned: false,
      subtasks: [],
    },
    {
      title: 'Review Chapter 4 Distributed Database Concurrency',
      category: 'Exam',
      priority: 'medium',
      estimatedMinutes: 60,
      pinned: false,
      subtasks: [],
    },
    {
      title: 'Setup PostgreSQL connection pool on Neon Vercel',
      category: 'Coding',
      priority: 'low',
      estimatedMinutes: 25,
      completed: true,
      pinned: false,
      subtasks: [],
    },
  ];

  for (const s of samples) {
    try {
      const res = await apiPost('/api/todos', s);
      tasks.unshift(res.task);
    } catch (e) {
      console.warn('Sample task seeding error:', e);
    }
  }

  renderAll();
  reminderEngine.setTasks(tasks);
}

function exportTasks() {
  const format = prompt('Export format: Type "json", "csv", or "markdown"', 'markdown');
  if (!format) return;

  let content = '';
  let filename = `tasks-export-${new Date().toISOString().slice(0, 10)}`;
  let mimeType = 'text/plain';

  if (format.toLowerCase() === 'json') {
    content = JSON.stringify(tasks, null, 2);
    filename += '.json';
    mimeType = 'application/json';
  } else if (format.toLowerCase() === 'csv') {
    filename += '.csv';
    mimeType = 'text/csv';
    content = 'ID,Title,Priority,Category,Completed,Due Date,Estimated Mins,Seconds Logged\n';
    tasks.forEach(t => {
      content += `"${t.id}","${t.title.replace(/"/g, '""')}","${t.priority}","${t.category}",${t.completed},"${t.dueAt || ''}",${t.estimatedMinutes},${t.actualSecondsSpent}\n`;
    });
  } else {
    filename += '.md';
    mimeType = 'text/markdown';
    content = `# TaskFlow Studio — Productivity Report\nGenerated: ${new Date().toLocaleString()}\n\n`;
    content += `| Status | Task | Priority | Category | Due | Effort |\n`;
    content += `| --- | --- | --- | --- | --- | --- |\n`;
    tasks.forEach(t => {
      const mark = t.completed ? '✅ Done' : '⏳ Pending';
      content += `| ${mark} | ${t.title} | ${t.priority} | ${t.category} | ${t.dueAt ? new Date(t.dueAt).toLocaleDateString() : '-'} | ${t.estimatedMinutes}m |\n`;
    });
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 5. Global Actions, Shortcuts & Reminder Callbacks
function bindGlobalEvents() {
  // 5s Demo button
  if (testDemoBtn) {
    testDemoBtn.addEventListener('click', () => {
      reminderEngine.triggerDemo5s();
    });
  }

  // Notification Pill
  if (notificationPill) {
    notificationPill.addEventListener('click', async () => {
      await reminderEngine.requestPermission();
    });
  }

  // Shortcuts Modal
  if (shortcutsBtn && shortcutsModal) {
    shortcutsBtn.addEventListener('click', () => shortcutsModal.showModal());
  }
  if (shortcutsCloseBtn && shortcutsModal) {
    shortcutsCloseBtn.addEventListener('click', () => shortcutsModal.close());
  }

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', e => {
    // If typing inside an input/textarea/select, only handle Escape
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

    if (e.key === 'Escape') {
      if (shortcutsModal && shortcutsModal.open) shortcutsModal.close();
      telemetryInspector.closeDrawer();
      if (composerDrawer && !composerDrawer.hidden) composerDrawer.hidden = true;
      return;
    }

    if (isInput) return;

    if (e.key === 'n' || e.key === 'N' || e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      switchView('list');
      titleInput.focus();
    } else if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      switchView('list');
      searchInput.focus();
    } else if (e.key === '1') {
      switchView('list');
    } else if (e.key === '2') {
      switchView('eisenhower');
    } else if (e.key === '3') {
      switchView('focus');
    } else if (e.key === 'i' || e.key === 'I') {
      telemetryInspector.toggleDrawer();
    } else if (e.key === 't' || e.key === 'T') {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(current === 'dark' ? 'light' : 'dark');
    } else if (e.key === '?') {
      if (shortcutsModal) shortcutsModal.showModal();
    }
  });
}

function handleReminderAction(action, taskId, snoozeMinutes = 5) {
  if (action === 'complete') {
    handleToggleComplete(taskId, true);
  } else if (action === 'snooze') {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newReminder = new Date(Date.now() + snoozeMinutes * 60_000).toISOString();
    task.reminderAt = newReminder;
    task.reminderSent = false;
    apiPatch(`/api/todos/${taskId}`, { reminderAt: newReminder, reminderSent: false });
    renderAll();
  } else if (action === 'focus') {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    switchView('focus');
    focusStudio.setTask(task);
    focusStudio.start();
  }
}

async function handleFocusTimeSync(taskId, totalActualSeconds) {
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task.actualSecondsSpent = totalActualSeconds;
    renderKpiStrip();
  }
  try {
    await apiPatch(`/api/todos/${taskId}`, { actualSecondsSpent: totalActualSeconds });
  } catch (err) {
    console.warn('Time tracking sync failed:', err);
  }
}

async function handleFocusComplete(taskId) {
  await handleToggleComplete(taskId, true);
}

// Helpers
function formatCountdown(isoString) {
  const diff = new Date(isoString).getTime() - Date.now();
  const absDiff = Math.abs(diff);

  const hours = Math.floor(absDiff / 3600_000);
  const mins = Math.floor((absDiff % 3600_000) / 60_000);

  if (diff < 0) {
    return {
      label: hours > 0 ? `${hours}h ${mins}m ago` : `${mins}m ago`,
      isOverdue: true,
      isDueSoon: false,
    };
  }

  const isDueSoon = diff <= 3600_000;
  return {
    label: hours > 0 ? `in ${hours}h ${mins}m` : `in ${mins}m`,
    isOverdue: false,
    isDueSoon,
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
