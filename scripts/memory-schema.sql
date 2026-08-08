-- memory-schema.sql — Turso/SQLite schema for @browsercore agentic memory
--
-- Adapted from hospitality-ops. Run once at DB creation. Idempotent.

-- ═══════════════════════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facts (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('architecture','contracts','patterns','operational','bugs')),
    statement TEXT NOT NULL,
    stability TEXT NOT NULL DEFAULT 'stable' CHECK (stability IN ('stable','evolving','experimental')),
    base_confidence REAL NOT NULL CHECK (base_confidence BETWEEN 0 AND 1),
    weight REAL NOT NULL DEFAULT 1.0,
    coupling TEXT,
    detail TEXT,
    agents_must_know TEXT,
    superseded_by TEXT REFERENCES facts(id),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_verified_at INTEGER,
    verification_count INTEGER NOT NULL DEFAULT 0,
    embedding TEXT,
    embedding_model TEXT
);

CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('file','conversation','task','code','agent')),
    source_path TEXT,
    source_detail TEXT,
    observation TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 1.0 CHECK (rating BETWEEN 0 AND 1),
    observed_at INTEGER NOT NULL DEFAULT (unixepoch()),
    observed_by TEXT
);

CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('file','conversation','filesystem')),
    path TEXT NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    note TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    repo TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','failed','cancelled')),
    started_at INTEGER,
    finished_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    embedding TEXT
);

CREATE TABLE IF NOT EXISTS task_facts (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL CHECK (relationship IN ('created','updated','verified','contradicted','superseded')),
    PRIMARY KEY (task_id, fact_id, relationship)
);

CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    context TEXT NOT NULL,
    the_question TEXT NOT NULL,
    options TEXT,
    impact_if_wrong TEXT,
    default_behavior TEXT,
    answer TEXT,
    answered_at INTEGER,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','withdrawn')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_facts_scope ON facts(scope);
CREATE INDEX IF NOT EXISTS idx_facts_stability ON facts(stability);
CREATE INDEX IF NOT EXISTS idx_facts_weight ON facts(weight DESC);
CREATE INDEX IF NOT EXISTS idx_facts_superseded ON facts(superseded_by);

CREATE INDEX IF NOT EXISTS idx_evidence_fact ON evidence(fact_id);
CREATE INDEX IF NOT EXISTS idx_evidence_date ON evidence(observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sources_fact ON sources(fact_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_repo ON tasks(repo);
CREATE INDEX IF NOT EXISTS idx_tasks_finished ON tasks(finished_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_facts_fact ON task_facts(fact_id);

CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- FTS MIRROR TABLES (manually synced by application code)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS facts_fts (
    fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    detail TEXT
);

CREATE TABLE IF NOT EXISTS tasks_fts (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS questions_fts (
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    the_question TEXT NOT NULL,
    context TEXT
);
