// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicRecord, ShadowView } from "../src/lib/types";

// TEST FIXTURES ONLY. Invented inputs, never shown on the site.
const loan = (id: string, start: number) => ({
  orderId: id, instrument: "rXYZ / USDT", protected: true, phase: "open" as const, asOf: 1, loanCoin: "USDT", backingCoin: "rXYZ", simulated: true as const, startHealth: start, openedAt: 1,
  health: { ratio: start, status: "safe" as const, distanceToMarginCall: 0.1, distanceToLiquidation: 0.3, priceDropToMarginCall: 0.2, marginCallLevel: 0.75, liquidationLevel: 0.9 },
  closure: null, projection: { ratio: start + 0.01, basis: "history_case", price: 99, status: "safe" }, trust: { trusted: false, failures: ["stale_trade"] }, plan: null, problems: [],
  lastDecision: { ts: Date.now() - 120_000, kind: "check", reason: "Safe. Projected loan health at reopen 66.0%." },
});
const VIEW: ShadowView = { simulated: true, loans: [loan("a", 0.65), loan("b", 0.7)], closure: { closeTs: Date.now() + 86_400_000, reopenTs: Date.now() + 2 * 86_400_000 } };
const PUBLIC_PROMISE = (id: string, simulated: boolean, status: "sealed" | "graded") => ({
  id, closeTs: Date.UTC(2026, 9, 9, 20), reopenTs: Date.UTC(2026, 9, 12, 13, 30), fingerprint: "f".repeat(64), sealedAt: 1, late: false, sizeBand: "5,000 to 10,000 USDT", backingCoin: "rXYZ",
  simulated, status, kept: status === "graded" ? true : null, actions: 0, cost: status === "graded" ? 0 : null, wouldHaveHadMarginCall: false, wouldHaveBeenLiquidated: false, marginCallAvoided: false, liquidationAvoided: false,
});

let record: { data: PublicRecord | null; failed: boolean; loading: boolean } = { data: null, failed: false, loading: false };
const request = vi.fn(async () => VIEW);
vi.mock("../src/lib/api", () => ({ WORKER_URL: "https://worker.test", request: (...a: unknown[]) => request(...(a as [])), getKey: () => null, subscribeKey: () => () => undefined }));
vi.mock("../src/lib/usePublicRecord", () => ({ usePublicRecord: () => record }));

import Home from "../src/app/app/page";
import { LogDownload } from "../src/components/LogDownload";
import { RecordView } from "../src/components/RecordView";

afterEach(cleanup);

describe("/app without signing in", () => {
  it("shows the live simulated loans, not a dead end, with a small owner sign-in link", async () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Live simulated loans" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Owner sign-in" })).toHaveAttribute("href", "/app/connect");
    await waitFor(() => expect(screen.getAllByText("Simulated").length).toBe(2));
    expect(screen.getAllByText(/Opened at/).length).toBe(2);
    expect(screen.getAllByText(/Safe\. Projected loan health/).length).toBe(2);
    expect(screen.getByText(/Next closure in/)).toBeInTheDocument();
    expect(screen.queryByText("Connect Bitget")).toBeNull();
    expect(request).toHaveBeenCalledWith("/public/shadow", { key: null });
  });
});

describe("the sealed promises on the record page", () => {
  it("never opens on a row of zeros: simulated promises are shown, labelled, and no empty totals", () => {
    record = { loading: false, failed: false, data: { totals: { promises: 0, graded: 0, kept: 0, marginCallsAvoided: 0, liquidationsAvoided: 0, totalCost: 0 }, promises: [], simulated: [PUBLIC_PROMISE("s1", true, "sealed"), PUBLIC_PROMISE("s2", true, "graded")] } };
    render(<RecordView />);
    expect(screen.getByText("Shadow ledger")).toBeInTheDocument();
    expect(screen.getAllByText("Simulated").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Promises kept")).toBeNull();
    expect(screen.queryByText("Starting")).toBeNull();
  });
  it("shows real totals only once something is graded", () => {
    record = { loading: false, failed: false, data: { totals: { promises: 1, graded: 1, kept: 1, marginCallsAvoided: 1, liquidationsAvoided: 0, totalCost: 12 }, promises: [PUBLIC_PROMISE("r1", false, "graded")], simulated: [] } };
    render(<RecordView />);
    expect(screen.getByText("Promises kept")).toBeInTheDocument();
  });
  it("says what happens next when there is nothing yet", () => {
    record = { loading: false, failed: false, data: { totals: { promises: 0, graded: 0, kept: 0, marginCallsAvoided: 0, liquidationsAvoided: 0, totalCost: 0 }, promises: [], simulated: [] } };
    render(<RecordView />);
    expect(screen.getByText(/first promises are sealed before the next closure/)).toBeInTheDocument();
  });
});

describe("download the log", () => {
  it("links CSV and JSON on the worker, public", () => {
    render(<LogDownload />);
    expect(screen.getByRole("link", { name: /Download CSV/ })).toHaveAttribute("href", "https://worker.test/public/log.csv");
    expect(screen.getByRole("link", { name: /Download JSON/ })).toHaveAttribute("href", "https://worker.test/public/log.json");
    expect(screen.getByText(/simulated or live/)).toBeInTheDocument();
  });
});
