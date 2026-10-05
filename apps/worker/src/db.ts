import { createRequire } from "node:module";

// `node:sqlite` is loaded through require so the test runner's bundler does not try to resolve it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteDb;
};

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...a: unknown[]): { lastInsertRowid: number | bigint }; get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] };
}

export interface LogEntry {
  ts: number;
  kind: "check" | "action" | "refused" | "alert" | "promise" | "grade" | "approval";
  loanId: string;
  /** The loan, for example "rNVDA / USDT". */
  instrument: string;
  /** "pay down", "add backing" or "" for checks. */
  direction: string;
  /** Stock token price used. */
  price: number | null;
  /** Amount paid down or added. */
  quantity: number | null;
  /** Change in the borrowed coin or the stock token balance. */
  balanceChange: string;
  /** Every entry from a shadow run is labelled simulated. */
  simulated: boolean;
  /** One plain line for the user. */
  reason: string;
  /** Full detail: inputs, trust status, the AI's choice, rule checks, receipts. */
  detail: unknown;
}

export interface StoredLog extends LogEntry {
  id: number;
}

export interface PromiseRow {
  id: string;
  loanId: string;
  closeTs: number;
  reopenTs: number;
  body: string;
  fingerprint: string;
  createdAt: number;
  simulated: boolean;
  actions: string;
  grade: string | null;
  gradedAt: number | null;
}

/** A cached token logo and company name, with where it came from and when. `source` is "none" when no real logo was found. */
export interface LogoRow {
  coin: string;
  name: string | null;
  source: "coingecko" | "company_site" | "none";
  sourceUrl: string | null;
  contentType: string | null;
  image: Uint8Array | null;
  fetchedAt: number;
}

export interface ApprovalRow {
  id: number;
  createdAt: number;
  loanId: string;
  proposal: string;
  status: "pending" | "approved" | "rejected" | "expired";
  decidedAt: number | null;
}

/** All of Morrow's stored state. SQLite through the runtime's built-in driver. */
export class Store {
  private readonly db: SqliteDb;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      create table if not exists settings (key text primary key, value text not null);
      create table if not exists promises (
        id text primary key, loan_id text not null, close_ts integer not null, reopen_ts integer not null,
        body text not null, fingerprint text not null, created_at integer not null, simulated integer not null,
        actions text not null default '[]', grade text, graded_at integer
      );
      create table if not exists log (
        id integer primary key autoincrement, ts integer not null, kind text not null, loan_id text not null,
        instrument text not null, direction text not null, price real, quantity real, balance_change text not null,
        simulated integer not null, reason text not null, detail text not null
      );
      create table if not exists approvals (
        id integer primary key autoincrement, created_at integer not null, loan_id text not null,
        proposal text not null, status text not null, decided_at integer
      );
      create table if not exists spend (
        id integer primary key autoincrement, ts integer not null, loan_id text not null,
        value_in_borrowed real not null, close_ts integer not null
      );
      create table if not exists logos (
        coin text primary key, name text, source text not null, source_url text, content_type text, image blob, fetched_at integer not null
      );
      create index if not exists log_ts on log (ts);
      create index if not exists promises_close on promises (close_ts);
    `);
  }

  setLogo(l: LogoRow): void {
    this.db
      .prepare("insert into logos (coin, name, source, source_url, content_type, image, fetched_at) values (?,?,?,?,?,?,?) on conflict(coin) do update set name = excluded.name, source = excluded.source, source_url = excluded.source_url, content_type = excluded.content_type, image = excluded.image, fetched_at = excluded.fetched_at")
      .run(l.coin, l.name, l.source, l.sourceUrl, l.contentType, l.image, l.fetchedAt);
  }

  private mapLogo(r: Record<string, unknown>): LogoRow {
    return {
      coin: r["coin"] as string, name: (r["name"] as string | null) ?? null, source: r["source"] as LogoRow["source"], sourceUrl: (r["source_url"] as string | null) ?? null,
      contentType: (r["content_type"] as string | null) ?? null, image: (r["image"] as Uint8Array | null) ?? null, fetchedAt: r["fetched_at"] as number,
    };
  }

  getLogo(coin: string): LogoRow | null {
    const r = this.db.prepare("select * from logos where lower(coin) = lower(?)").get(coin);
    return r ? this.mapLogo(r as Record<string, unknown>) : null;
  }

  /** Every cached logo without its image bytes. */
  logoIndex(): Array<Omit<LogoRow, "image"> & { hasImage: boolean }> {
    return (this.db.prepare("select coin, name, source, source_url, content_type, fetched_at, image is not null as has_image from logos order by coin").all() as Array<Record<string, unknown>>).map((r) => ({
      coin: r["coin"] as string, name: (r["name"] as string | null) ?? null, source: r["source"] as LogoRow["source"], sourceUrl: (r["source_url"] as string | null) ?? null,
      contentType: (r["content_type"] as string | null) ?? null, fetchedAt: r["fetched_at"] as number, hasImage: r["has_image"] === 1,
    }));
  }

  getSetting<T>(key: string): T | null {
    const row = this.db.prepare("select value from settings where key = ?").get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }

  setSetting(key: string, value: unknown): void {
    this.db.prepare("insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value").run(key, JSON.stringify(value));
  }

  addLog(e: LogEntry): number {
    const r = this.db
      .prepare("insert into log (ts, kind, loan_id, instrument, direction, price, quantity, balance_change, simulated, reason, detail) values (?,?,?,?,?,?,?,?,?,?,?)")
      .run(e.ts, e.kind, e.loanId, e.instrument, e.direction, e.price, e.quantity, e.balanceChange, e.simulated ? 1 : 0, e.reason, JSON.stringify(e.detail));
    return Number(r.lastInsertRowid);
  }

  private mapLog(r: Record<string, unknown>): StoredLog {
    return {
      id: r["id"] as number, ts: r["ts"] as number, kind: r["kind"] as StoredLog["kind"], loanId: r["loan_id"] as string,
      instrument: r["instrument"] as string, direction: r["direction"] as string, price: r["price"] as number | null,
      quantity: r["quantity"] as number | null, balanceChange: r["balance_change"] as string, simulated: r["simulated"] === 1,
      reason: r["reason"] as string, detail: JSON.parse(r["detail"] as string),
    };
  }

  recentLog(limit: number, loanId?: string): StoredLog[] {
    const rows = loanId
      ? this.db.prepare("select * from log where loan_id = ? order by id desc limit ?").all(loanId, limit)
      : this.db.prepare("select * from log order by id desc limit ?").all(limit);
    return (rows as Array<Record<string, unknown>>).map((r) => this.mapLog(r));
  }

  lastLog(loanId: string, kind: LogEntry["kind"]): StoredLog | null {
    const r = this.db.prepare("select * from log where loan_id = ? and kind = ? order by id desc limit 1").get(loanId, kind);
    return r ? this.mapLog(r as Record<string, unknown>) : null;
  }

  /** Actions already taken on a loan since a moment (used to credit run-up actions to the next promise). */
  actionsSince(loanId: string, sinceMs: number): StoredLog[] {
    return (this.db.prepare("select * from log where loan_id = ? and kind = 'action' and ts >= ? order by id").all(loanId, sinceMs) as Array<Record<string, unknown>>).map((r) => this.mapLog(r));
  }

  allLog(): StoredLog[] {
    return (this.db.prepare("select * from log order by id asc").all() as Array<Record<string, unknown>>).map((r) => this.mapLog(r));
  }

  insertPromise(p: Omit<PromiseRow, "grade" | "gradedAt" | "actions">): void {
    this.db
      .prepare("insert into promises (id, loan_id, close_ts, reopen_ts, body, fingerprint, created_at, simulated) values (?,?,?,?,?,?,?,?)")
      .run(p.id, p.loanId, p.closeTs, p.reopenTs, p.body, p.fingerprint, p.createdAt, p.simulated ? 1 : 0);
  }

  private mapPromise(r: Record<string, unknown>): PromiseRow {
    return {
      id: r["id"] as string, loanId: r["loan_id"] as string, closeTs: r["close_ts"] as number, reopenTs: r["reopen_ts"] as number,
      body: r["body"] as string, fingerprint: r["fingerprint"] as string, createdAt: r["created_at"] as number,
      simulated: r["simulated"] === 1, actions: r["actions"] as string, grade: r["grade"] as string | null, gradedAt: r["graded_at"] as number | null,
    };
  }

  promiseFor(loanId: string, closeTs: number): PromiseRow | null {
    const r = this.db.prepare("select * from promises where loan_id = ? and close_ts = ?").get(loanId, closeTs);
    return r ? this.mapPromise(r as Record<string, unknown>) : null;
  }

  allPromises(): PromiseRow[] {
    return (this.db.prepare("select * from promises order by close_ts desc, loan_id asc").all() as Array<Record<string, unknown>>).map((r) => this.mapPromise(r));
  }

  ungradedPromisesDue(nowMs: number, delayMs: number): PromiseRow[] {
    return (this.db.prepare("select * from promises where grade is null and reopen_ts + ? <= ?").all(delayMs, nowMs) as Array<Record<string, unknown>>).map((r) => this.mapPromise(r));
  }

  appendPromiseAction(id: string, action: unknown): void {
    const row = this.db.prepare("select actions from promises where id = ?").get(id) as { actions: string } | undefined;
    if (!row) return;
    const list = JSON.parse(row.actions) as unknown[];
    list.push(action);
    this.db.prepare("update promises set actions = ? where id = ?").run(JSON.stringify(list), id);
  }

  setGrade(id: string, grade: unknown, gradedAt: number): void {
    this.db.prepare("update promises set grade = ?, graded_at = ? where id = ?").run(JSON.stringify(grade), gradedAt, id);
  }

  addApproval(createdAt: number, loanId: string, proposal: unknown): number {
    const r = this.db.prepare("insert into approvals (created_at, loan_id, proposal, status) values (?,?,?, 'pending')").run(createdAt, loanId, JSON.stringify(proposal));
    return Number(r.lastInsertRowid);
  }

  private mapApproval(r: Record<string, unknown>): ApprovalRow {
    return {
      id: r["id"] as number, createdAt: r["created_at"] as number, loanId: r["loan_id"] as string, proposal: r["proposal"] as string,
      status: r["status"] as ApprovalRow["status"], decidedAt: r["decided_at"] as number | null,
    };
  }

  getApproval(id: number): ApprovalRow | null {
    const r = this.db.prepare("select * from approvals where id = ?").get(id);
    return r ? this.mapApproval(r as Record<string, unknown>) : null;
  }

  pendingApprovals(loanId?: string): ApprovalRow[] {
    const rows = loanId
      ? this.db.prepare("select * from approvals where status = 'pending' and loan_id = ? order by id").all(loanId)
      : this.db.prepare("select * from approvals where status = 'pending' order by id").all();
    return (rows as Array<Record<string, unknown>>).map((r) => this.mapApproval(r));
  }

  decideApproval(id: number, status: ApprovalRow["status"], decidedAt: number): void {
    this.db.prepare("update approvals set status = ?, decided_at = ? where id = ?").run(status, decidedAt, id);
  }

  addSpend(ts: number, loanId: string, valueInBorrowed: number, closeTs: number): void {
    this.db.prepare("insert into spend (ts, loan_id, value_in_borrowed, close_ts) values (?,?,?,?)").run(ts, loanId, valueInBorrowed, closeTs);
  }

  spentForClosure(closeTs: number): number {
    const r = this.db.prepare("select coalesce(sum(value_in_borrowed), 0) as s from spend where close_ts = ?").get(closeTs) as { s: number };
    return r.s;
  }

  spentSince(sinceMs: number): number {
    const r = this.db.prepare("select coalesce(sum(value_in_borrowed), 0) as s from spend where ts >= ?").get(sinceMs) as { s: number };
    return r.s;
  }
}
