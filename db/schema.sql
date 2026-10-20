-- Todo App Database Schema v2
-- Run with: npm run db:migrate (uses DATABASE_URL_UNPOOLED)
-- Idempotent migration that adds new columns without data loss

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tasks (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                 TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 500),
    description           TEXT NOT NULL DEFAULT '',
    completed             BOOLEAN NOT NULL DEFAULT false,
    priority              VARCHAR(16) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    category              VARCHAR(64) NOT NULL DEFAULT 'General',
    due_at                TIMESTAMPTZ NULL,
    reminder_at           TIMESTAMPTZ NULL,
    reminder_sent         BOOLEAN NOT NULL DEFAULT false,
    estimated_minutes     INTEGER NOT NULL DEFAULT 25,
    actual_seconds_spent  INTEGER NOT NULL DEFAULT 0,
    subtasks              JSONB NOT NULL DEFAULT '[]'::jsonb,
    pinned                BOOLEAN NOT NULL DEFAULT false,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at          TIMESTAMPTZ NULL
);

-- Safe column additions for existing tables (idempotent)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category VARCHAR(64) NOT NULL DEFAULT 'General';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 25;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_seconds_spent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtasks JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_created_at_desc ON tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks (completed);
CREATE INDEX IF NOT EXISTS idx_tasks_pinned ON tasks (pinned DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks (due_at ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks (category);
CREATE INDEX IF NOT EXISTS idx_tasks_reminder_at ON tasks (reminder_at) WHERE reminder_at IS NOT NULL AND reminder_sent = false;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to set completed_at when completed changes
CREATE OR REPLACE FUNCTION set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed = true AND OLD.completed = false THEN
        NEW.completed_at = now();
    ELSIF NEW.completed = false AND OLD.completed = true THEN
        NEW.completed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_tasks_completed_at ON tasks;
CREATE TRIGGER set_tasks_completed_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_completed_at();