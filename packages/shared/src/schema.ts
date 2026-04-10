/**
 * SQLite schema for the bot's operational state.
 *
 * Both apps/bot (read+write) and apps/dashboard (read-only) share this file.
 *
 * Bigints are stored as TEXT to preserve precision beyond JavaScript's
 * Number.MAX_SAFE_INTEGER. Timestamps are milliseconds since epoch (INTEGER).
 */

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS wallets (
  idx          INTEGER PRIMARY KEY,      -- 0..7 for MM wallets, -1 for treasury
  address      TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,            -- 'treasury' | 'mm-0' | ... | 'mm-7'
  usdc_micro   TEXT NOT NULL DEFAULT '0',
  matic_wei    TEXT NOT NULL DEFAULT '0',
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS markets (
  condition_id TEXT PRIMARY KEY,
  trader       TEXT NOT NULL,
  slug         TEXT NOT NULL,
  yes_token_id TEXT NOT NULL,
  no_token_id  TEXT NOT NULL,
  tick_size    REAL NOT NULL,
  min_order    REAL NOT NULL,
  best_bid     REAL,
  best_ask     REAL,
  last_trade   REAL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_markets_yes_token ON markets(yes_token_id);
CREATE INDEX IF NOT EXISTS idx_markets_no_token ON markets(no_token_id);

CREATE TABLE IF NOT EXISTS positions (
  wallet_address TEXT NOT NULL,
  condition_id   TEXT NOT NULL,
  yes_micro      TEXT NOT NULL DEFAULT '0',
  no_micro       TEXT NOT NULL DEFAULT '0',
  yes_avg_entry  TEXT NOT NULL DEFAULT '0',
  no_avg_entry   TEXT NOT NULL DEFAULT '0',
  realized_pnl   TEXT NOT NULL DEFAULT '0',
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (wallet_address, condition_id)
);

CREATE TABLE IF NOT EXISTS orders (
  order_id       TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  condition_id   TEXT NOT NULL,
  token_id       TEXT NOT NULL,
  outcome        TEXT NOT NULL,           -- 'YES' | 'NO'
  side           TEXT NOT NULL,           -- 'BUY' | 'SELL'
  price          TEXT NOT NULL,
  size_micro     TEXT NOT NULL,
  filled_micro   TEXT NOT NULL DEFAULT '0',
  status         TEXT NOT NULL,           -- 'PROPOSED' | 'LIVE' | 'MATCHED' | 'CANCELED' | 'UNMATCHED' | 'REJECTED'
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_wallet ON orders(wallet_address);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_condition ON orders(condition_id);

CREATE TABLE IF NOT EXISTS fills (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  condition_id   TEXT NOT NULL,
  token_id       TEXT NOT NULL,
  side           TEXT NOT NULL,
  price          TEXT NOT NULL,
  size_micro     TEXT NOT NULL,
  fee_micro      TEXT NOT NULL DEFAULT '0',
  pnl_micro      TEXT NOT NULL DEFAULT '0',
  timestamp      INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE INDEX IF NOT EXISTS idx_fills_wallet ON fills(wallet_address);
CREATE INDEX IF NOT EXISTS idx_fills_timestamp ON fills(timestamp);

CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kind           TEXT NOT NULL,
  level          TEXT NOT NULL,
  wallet_address TEXT,
  condition_id   TEXT,
  message        TEXT NOT NULL,
  payload        TEXT,
  timestamp      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);

CREATE TABLE IF NOT EXISTS heartbeats (
  wallet_address TEXT PRIMARY KEY,
  timestamp      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kill_switch (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  engaged     INTEGER NOT NULL DEFAULT 0,
  engaged_at  INTEGER,
  reason      TEXT
);

INSERT OR IGNORE INTO kill_switch (id, engaged) VALUES (1, 0);
`

export const DB_PATH_DEFAULT = 'data/state.sqlite'
export const KILL_SWITCH_FILE = 'data/KILL_SWITCH'
