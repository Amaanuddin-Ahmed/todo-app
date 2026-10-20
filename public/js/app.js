// Todo App - Client Application
// State management, rendering, event handling

import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from './api.js';

// ---- State ----
let tasks = [];
let isLoading = false;
let error = null;

// ---- DOM Elements ----
const form = document.getElementById('task-form');
const titleInput = document.getElementById('task-title');
const submitBtn = document.getElementById('submit-btn');
const btnText = submitBtn.querySelector('.btn-text');
const btnLoading = submitBtn.querySelector('.btn-loading');
const titleError = document.getElementById('title-error');
const refreshBtn = document.getElementById('refresh-btn');
const taskList = document.getElementById('task-list');
const emptyState = document.getElementById('empty-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');
const loadingState = document.getElementById('loading-state');

// ---- Helpers ----

/** Show only the given section, hide others. */
function showSection(section) {
  [taskList, emptyState, errorState, loadingState].forEach(el => {
    el.hidden = el !== section;
  });
}

/** Set loading state. */
function setLoading(loading) {
  isLoading = loading;
  submitBtn.disabled = loading;
  refreshBtn.disabled = loading;

  if (loading) {
    btnText.hidden = true;
    btnLoading.hidden = false;
    showSection(loadingState);
  } else {
    btnText.hidden = false;
    btnLoading.hidden = true;
    if (tasks.length === 0 && !error) {
      showSection(emptyState);
    } else if (error) {
      showSection(errorState);
    } else {
      showSection(taskList);
    }
  }
}

/** Set error state. */
function setError(err) {
  error = err;
  if (err instanceof ApiError) {
    errorMessage.textContent = `${err.message} (${err.code})`;
  } else {
    errorMessage.textContent = err.message || 'Unknown error';
  }
  if (!isLoading) showSection(errorState);
}

/** Clear error state. */
function clearError() {
  error = null;
  if (!isLoading && tasks.length > 0) showSection(taskList);
}

/** Validate title input client-side. */
function validateTitle(value) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'Title cannot be empty';
  }
  if (trimmed.length > 200) {
    return 'Title must be 200 characters or fewer';
  }
  return null;
}

/** Announce to screen readers via aria-live region. */
function announce(message) {
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.className = 'sr-only';
  liveRegion.textContent = message;
  document.body.appendChild(liveRegion);
  setTimeout(() => liveRegion.remove(), 1000);
}

// ---- Rendering ----

/** Format timestamp for display. */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Create task element (using textContent for XSS safety). */
function createTaskElement(task) {
  const li = document.createElement('li');
  li.className = `task-item${task.completed ? ' completed' : ''}`;
  li.dataset.id = task.id;

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.setAttribute(
    'aria-label',
    `Mark "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`
  );

  // Title
  const titleSpan = document.createElement('span');
  titleSpan.className = 'task-title';
  titleSpan.textContent = task.title; // textContent = XSS safe

  // Timestamp
  const timestamp = document.createElement('time');
  timestamp.className = 'task-timestamp';
  timestamp.dateTime = task.createdAt;
  timestamp.textContent = formatDate(task.createdAt);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger btn-icon';
  deleteBtn.setAttribute('aria-label', `Delete "${task.title}"`);
  deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

  actions.appendChild(deleteBtn);

  // Assemble
  li.appendChild(checkbox);
  li.appendChild(titleSpan);
  li.appendChild(timestamp);
  li.appendChild(actions);

  // Event listeners
  checkbox.addEventListener('change', () => handleToggle(task.id, checkbox.checked));
  deleteBtn.addEventListener('click', () => handleDelete(task.id));

  return li;
}

/** Render all tasks. */
function renderTasks() {
  taskList.innerHTML = '';
  if (tasks.length === 0) {
    showSection(emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const task of tasks) {
    fragment.appendChild(createTaskElement(task));
  }
  taskList.appendChild(fragment);
  showSection(taskList);
}

// ---- Event Handlers ----

/** Load tasks from API. */
async function loadTasks() {
  if (isLoading) return;
  setLoading(true);
  clearError();

  try {
    const data = await apiGet('/api/tasks');
    tasks = data.tasks || [];
    renderTasks();
    announce(`${tasks.length} task${tasks.length !== 1 ? 's' : ''} loaded`);
  } catch (err) {
    setError(err);
    console.error('Failed to load tasks:', err);
  } finally {
    setLoading(false);
  }
}

/** Handle form submit - add new task. */
async function handleSubmit(event) {
  event.preventDefault();

  const rawTitle = titleInput.value;
  const validationError = validateTitle(rawTitle);
  if (validationError) {
    showValidationError(validationError);
    return;
  }

  const title = rawTitle.trim();
  setLoading(true);
  clearError();
  hideValidationError();

  try {
    const data = await apiPost('/api/tasks', { title });
    tasks.unshift(data.task); // newest first
    renderTasks();
    titleInput.value = '';
    submitBtn.disabled = true;
    announce(`Added task: ${data.task.title}`);
  } catch (err) {
    setError(err);
    if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
      showValidationError(err.message);
    }
    console.error('Failed to add task:', err);
  } finally {
    setLoading(false);
  }
}

/** Toggle task completion. */
async function handleToggle(id, completed) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const previousCompleted = task.completed;
  task.completed = completed;
  renderTasks(); // Optimistic update

  try {
    await apiPatch(`/api/tasks/${id}`, { completed });
    announce(`Task ${completed ? 'completed' : 'marked incomplete'}: ${task.title}`);
  } catch (err) {
    // Rollback on error
    task.completed = previousCompleted;
    renderTasks();
    setError(err);
    console.error('Failed to toggle task:', err);
  }
}

/** Delete task. */
async function handleDelete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  if (!confirm(`Delete "${task.title}"?`)) return;

  const index = tasks.findIndex(t => t.id === id);
  const removed = tasks.splice(index, 1)[0];
  renderTasks(); // Optimistic update

  try {
    await apiDelete(`/api/tasks/${id}`);
    announce(`Deleted task: ${removed.title}`);
  } catch (err) {
    // Rollback on error
    tasks.splice(index, 0, removed);
    renderTasks();
    setError(err);
    console.error('Failed to delete task:', err);
  }
}

/** Retry button - reload tasks. */
async function handleRetry() {
  await loadTasks();
}

// ---- Input Validation UI ----

function showValidationError(message) {
  titleError.textContent = message;
  titleError.hidden = false;
  titleInput.setAttribute('aria-invalid', 'true');
  titleInput.focus();
}

function hideValidationError() {
  titleError.hidden = true;
  titleInput.removeAttribute('aria-invalid');
}

// ---- Initialize ----

function init() {
  // Form submit
  form.addEventListener('submit', handleSubmit);

  // Input validation on blur/change
  titleInput.addEventListener('input', () => {
    const err = validateTitle(titleInput.value);
    if (err) {
      showValidationError(err);
    } else {
      hideValidationError();
    }
    submitBtn.disabled = !!err || !titleInput.value.trim();
  });

  // Refresh button
  refreshBtn.addEventListener('click', loadTasks);

  // Retry button
  retryBtn.addEventListener('click', handleRetry);

  // Initial load
  loadTasks();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
