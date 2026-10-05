// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchResult } from "../src/lib/types";

// TEST FIXTURES ONLY. Invented inputs, never shown on the site.
const RESULT: WatchResult = {
  label: "Simulated loan, real prices", token: "rXYZ", symbol: "RXYZUSDT",
  closure: { closeTs: Date.UTC(2026, 7, 21, 20), reopenTs: Date.UTC(2026, 7, 24, 13, 30), closeDate: "2026-08-21", reopenDate: "2026-08-24" },
  reopenMove: -0.12,
  loan: { backingAmount: 100, backingValue: 10000, debt: 7000, startHealth: 0.7, idleBorrowed: 1750, basis: "standard" },
  limits: { marginCall: 0.75, liquidation: 0.9 }, decidedBy: "rules only",
  prices: Array.from({ length: 24 }, (_, i) => ({ t: Date.UTC(2026, 7, 21, 14) + i * 3_600_000 * 4, price: 100 - i })),
  steps: [
    { id: "seal", at: Date.UTC(2026, 7, 21, 19), title: "The promise is sealed", line: "Before the market closes, Morrow writes down what it will protect.", facts: [{ label: "Sealed promise", value: "abcdef0123456789…" }] },
    { id: "weekend", at: Date.UTC(2026, 7, 21, 20), title: "The weekend price moves", line: "rXYZ pauses while the US market is shut.", facts: [] },
    { id: "project", at: Date.UTC(2026, 7, 23, 20), title: "Morrow projects the reopen", line: "Morrow works out what loan health will be.", facts: [{ label: "Projected loan health", value: "74.0%" }] },
    { id: "decide", at: Date.UTC(2026, 7, 21, 19), title: "The AI decides", line: "Loan health is projected too close to the margin-call level.", facts: [{ label: "Decided by", value: "rules only" }] },
    { id: "act", at: Date.UTC(2026, 7, 21, 19), title: "Morrow acts", line: "Morrow pays down 900.00 USDT of the loan with idle USDT.", facts: [] },
    { id: "reopen", at: Date.UTC(2026, 7, 24, 13, 30), title: "Monday: the market reopens", line: "rXYZ reopens down 12.0% from Friday's close.", facts: [] },
    { id: "grade", at: Date.UTC(2026, 7, 24, 14, 30), title: "Graded: promise kept", line: "Thirty minutes after the open, the loan is below the margin-call level.", facts: [] },
  ],
  outcome: { kept: true, healthWithMorrow: 0.66, healthWithoutMorrow: 0.8, marginCallWithoutMorrow: true, paidDown: 900 },
  notes: ["Order-book depth does not exist for past hours."],
};

const request = vi.fn();
vi.mock("../src/lib/api", () => ({ WORKER_URL: "https://worker.test", request: (...a: unknown[]) => request(...a) }));
let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

import { WatchAWeekend } from "../src/components/WatchAWeekend";

beforeEach(() => {
  search = "";
  request.mockImplementation(async (path: string) => {
    if (path === "/public/check/tokens") return { tokens: [{ coin: "rXYZ", name: "Xyz Corporation" }, { coin: "rABC", name: null }] };
    if (path === "/public/watch/featured") return { featured: { coin: "rXYZ", symbol: "RXYZUSDT", closeTs: 1, reopenTs: 2, move: -0.12 } };
    return RESULT;
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  request.mockReset();
});

describe("Watch a weekend", () => {
  it("opens on the featured token with the simulated label, and shows nothing until Start is pressed", async () => {
    render(<WatchAWeekend />);
    expect(screen.getByText("Simulated loan, real prices")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/most dramatic real weekend/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Start/ })).toBeEnabled();
    expect(screen.queryByRole("list", { name: /step by step/ })).toBeNull();
    expect(request.mock.calls.some((c) => String(c[0]).startsWith("/public/watch?"))).toBe(false);
  });

  it("plays the weekend one step at a time and ends on the result", async () => {
    render(<WatchAWeekend />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Start/ })).toBeEnabled());
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    });
    await waitFor(() => expect(screen.getByText("The promise is sealed")).toBeInTheDocument());
    expect(request).toHaveBeenCalledWith("/public/watch?token=rXYZ", { key: null });
    expect(screen.queryByText("Morrow acts")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2400 * 6);
    });
    expect(screen.getByText("Graded: promise kept")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Result" })).toHaveTextContent("Promise kept");
    expect(screen.getByRole("region", { name: "Result" })).toHaveTextContent(/900\.00 USDT/);
    expect(screen.getByRole("button", { name: /Watch again/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/LTV|collateral|pledge|supRate|forceRate/i);
  });

  it("lets the viewer skip to the end", async () => {
    render(<WatchAWeekend />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Start/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Skip to the end/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Skip to the end/ }));
    expect(screen.getByText("Graded: promise kept")).toBeInTheDocument();
  });

  it("replays the visitor's own loan when it arrives from Check my loan", async () => {
    search = "token=rXYZ&backing=25&borrowed=3000";
    render(<WatchAWeekend />);
    expect(screen.getByText(/Your loan: 3,000.00 USDT borrowed against 25 rXYZ/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Start/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/public/watch?token=rXYZ&backing=25&borrowed=3000", { key: null }));
  });

  it("says plainly what went wrong and lets the viewer try again", async () => {
    request.mockImplementation(async (path: string) => {
      if (path === "/public/check/tokens") return { tokens: [{ coin: "rXYZ", name: null }] };
      if (path === "/public/watch/featured") return { featured: null };
      throw new Error("There is not enough price history for this token yet to replay a weekend.");
    });
    search = "token=rXYZ";
    render(<WatchAWeekend />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Start/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Start/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not enough price history/));
    expect(screen.getByRole("button", { name: /Start/ })).toBeEnabled();
  });
});
