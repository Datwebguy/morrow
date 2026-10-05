import { describe, expect, it } from "vitest";
import { Store } from "../src/db";
import { logRows, toCsv } from "../src/logexport";

const entry = (over: Record<string, unknown>) => ({
  ts: 1, kind: "action" as const, loanId: "SECRET-ID", instrument: "rXYZ / USDT", direction: "pay down", price: 100, quantity: 5, balanceChange: "-5 USDT",
  simulated: true, reason: 'Pay down 5, "now"', detail: { decision: { choice: { by: "model-a" } } }, ...over,
});

describe("decision log export", () => {
  it("merges stores oldest first, labels simulated or live, names the model, and never exposes loan ids", () => {
    const a = new Store(":memory:");
    const b = new Store(":memory:");
    a.addLog(entry({ ts: 3_000, simulated: false, reason: "Live one" }));
    b.addLog(entry({ ts: 1_000, detail: {} }));
    const rows = logRows([a, b]);
    expect(rows.map((r) => r.mode)).toEqual(["simulated", "live"]);
    expect(rows[0]?.timestamp).toBe("1970-01-01T00:00:01.000Z");
    expect(rows[1]?.decidedBy).toBe("model-a");
    expect(JSON.stringify(rows)).not.toContain("SECRET-ID");
  });

  it("writes CSV with a header, quotes commas and quotes, and leaves empty cells empty", () => {
    const s = new Store(":memory:");
    s.addLog(entry({ price: null, quantity: null }));
    const csv = toCsv(logRows([s]));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("timestamp,kind,instrument,direction,price,quantity,balance_change,reason,decided_by,mode");
    expect(lines[1]).toBe('1970-01-01T00:00:00.001Z,action,rXYZ / USDT,pay down,,,-5 USDT,"Pay down 5, ""now""",model-a,simulated');
  });
});
