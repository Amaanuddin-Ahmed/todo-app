// Natural Language Task Parser
// Extracts priorities (!urgent, !1), categories (#coding), effort (~30m), and dates (today, tomorrow, in 10m, at 5pm)

export function parseNaturalLanguageTask(input) {
  if (!input || typeof input !== 'string') {
    return {
      cleanTitle: '',
      priority: null,
      category: null,
      estimatedMinutes: null,
      dueAt: null,
      reminderAt: null,
      tokens: [],
    };
  }

  let text = input;
  const tokens = [];
  let priority = null;
  let category = null;
  let estimatedMinutes = null;
  let dueAt = null;
  let reminderAt = null;

  // 1. Priority (!urgent, !high, !medium, !low, !1, !2, !3, !4)
  const priorityMatch = text.match(/\B!([a-zA-Z0-9]+)\b/);
  if (priorityMatch) {
    const raw = priorityMatch[1].toLowerCase();
    const map = {
      urgent: 'urgent',
      1: 'urgent',
      high: 'high',
      2: 'high',
      medium: 'medium',
      med: 'medium',
      3: 'medium',
      low: 'low',
      4: 'low',
    };
    if (map[raw]) {
      priority = map[raw];
      tokens.push({ type: 'priority', text: `!${raw}`, value: priority });
      text = text.replace(priorityMatch[0], ' ');
    }
  }

  // 2. Category (#academic, #coding, #personal, etc.)
  const categoryMatch = text.match(/\B#([a-zA-Z0-9_-]+)\b/);
  if (categoryMatch) {
    const rawCat = categoryMatch[1];
    // Capitalize first letter
    category = rawCat.charAt(0).toUpperCase() + rawCat.slice(1);
    tokens.push({ type: 'category', text: `#${rawCat}`, value: category });
    text = text.replace(categoryMatch[0], ' ');
  }

  // 3. Estimated Effort (~15m, ~30m, ~1h, ~2h, etc.)
  const effortMatch = text.match(/\B~([0-9]+)(m|min|mins|h|hr|hrs)?\b/i);
  if (effortMatch) {
    const num = parseInt(effortMatch[1], 10);
    const unit = (effortMatch[2] || 'm').toLowerCase();
    let mins = num;
    if (unit.startsWith('h')) {
      mins = num * 60;
    }
    if (mins >= 1 && mins <= 1440) {
      estimatedMinutes = mins;
      tokens.push({ type: 'effort', text: effortMatch[0], value: `${mins}m` });
      text = text.replace(effortMatch[0], ' ');
    }
  }

  // 4. Relative time shortcuts: "in 10m", "in 30m", "in 1h", "in 5m"
  const relativeMatch = text.match(/\bin\s+(\d+)\s*(m|min|mins|h|hr|hrs)\b/i);
  if (relativeMatch) {
    const count = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const now = new Date();
    const target = new Date(now.getTime() + count * (unit.startsWith('h') ? 3600_000 : 60_000));
    dueAt = target.toISOString();
    reminderAt = target.toISOString();
    tokens.push({ type: 'datetime', text: relativeMatch[0], value: formatTimeShort(target) });
    text = text.replace(relativeMatch[0], ' ');
  }

  // 5. Explicit time shortcuts: "today", "tomorrow"
  if (!dueAt) {
    if (/\btomorrow\b/i.test(text)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(18, 0, 0, 0); // 6:00 PM tomorrow
      dueAt = tomorrow.toISOString();
      reminderAt = tomorrow.toISOString();
      tokens.push({ type: 'datetime', text: 'tomorrow', value: 'Tomorrow 6 PM' });
      text = text.replace(/\btomorrow\b/i, ' ');
    } else if (/\btoday\b/i.test(text)) {
      const today = new Date();
      today.setHours(20, 0, 0, 0); // 8:00 PM today
      dueAt = today.toISOString();
      reminderAt = today.toISOString();
      tokens.push({ type: 'datetime', text: 'today', value: 'Today 8 PM' });
      text = text.replace(/\btoday\b/i, ' ');
    }
  }

  // 6. Time of day: "at 17:00", "at 8pm", "at 9:30am"
  const timeMatch = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch && !dueAt) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridian = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

    if (meridian === 'pm' && hour < 12) hour += 12;
    if (meridian === 'am' && hour === 12) hour = 0;

    const targetDate = new Date();
    targetDate.setHours(hour, minute, 0, 0);
    // If time is already past today, schedule for tomorrow
    if (targetDate.getTime() <= Date.now()) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    dueAt = targetDate.toISOString();
    reminderAt = targetDate.toISOString();
    tokens.push({ type: 'datetime', text: timeMatch[0], value: formatTimeShort(targetDate) });
    text = text.replace(timeMatch[0], ' ');
  }

  const cleanTitle = text.replace(/\s+/g, ' ').trim();

  return {
    cleanTitle: cleanTitle || input.trim(),
    priority,
    category,
    estimatedMinutes,
    dueAt,
    reminderAt,
    tokens,
  };
}

function formatTimeShort(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
