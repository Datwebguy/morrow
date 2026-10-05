// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CheckResult } from "../src/lib/types";

// TEST FIXTURES ONLY. These are test inputs, not market data.
const FIXTURE: CheckResult = {
  asOf: Date.UTC(2026, 9, 3, 12, 0), token: "rXYZ", loanCoin: "USDT", phase: "closed", closure: { closeTs: Date.UTC(2026, 9, 2, 20, 0), reopenTs: Date.UTC(2026, 9, 5, 13, 30) },
  price: 100, lastClose: 99, moveSinceClose: 0.01,
  health: { ratio: 0.58, status: "watch", distanceToMarginCall: 0.02, distanceToLiquidation: 0.22, priceDropToMarginCall: 0.033, marginCallLevel: 0.6, liquidationLevel: 0.8, startLevel: 0.5 },
  projection: { ratio: 0.598, status: "watch", basis: "history_case", price: 97 },
  history: { closures: 12, likelyDrop: 0.03, severeDrop: 0.05, likelyPercentile: 95, severePercentile: 99, tradesOnWeekends: false },
  trust: { trusted: false, failures: ["no_history"] },
  suggestion: { payDown: 120.5, addBacking: 0, ratioAfter: 0.5, targetRatio: 0.5 },
  problems: [],
};

const request = vi.fn();
vi.mock("../src/lib/api", () => ({ WORKER_URL: "https://worker.test", request: (...a: unknown[]) => request(...a) }));

import { CheckMyLoan } from "../src/components/CheckMyLoan";

afterEach(() => {
  cleanup();
  request.mockReset();
});

function setup() {
  request.mockImplementation(async (path: string) => {
    if (path === "/public/check/tokens") return { tokens: ["rXYZ", "rABC"] };
    return FIXTURE;
  });
}

async function fill() {
  await waitFor(() => expect(screen.getByRole("option", { name: "rXYZ" })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/Stock token/), { target: { value: "rXYZ" } });
  fireEvent.change(screen.getByLabelText(/Backing amount/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/Amount borrowed/), { target: { value: "580" } });
}

describe("Check my loan page", () => {
  it("asks for the three things, sends them with no key, and shows the answer in plain words", async () => {
    setup();
    render(<CheckMyLoan />);
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Check my loan" }));
    await waitFor(() => expect(screen.getByText("Suggested action")).toBeInTheDocument());
    const call = request.mock.calls.find((c) => c[0] === "/public/check")!;
    expect(call[1]).toMatchObject({ method: "POST", key: null, body: { token: "rXYZ", backingAmount: "10", borrowed: "580" } });
    expect(screen.getByText(/Pay down 120.50 USDT/)).toBeInTheDocument();
    expect(screen.getByText("To margin call")).toBeInTheDocument();
    expect(screen.getByText(/Price not trusted/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing you type is saved/)).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/LTV|collateral|pledge|supRate|forceRate/i);
  });

  it("says plainly what went wrong and keeps the form", async () => {
    request.mockImplementation(async (path: string) => {
      if (path === "/public/check/tokens") return { tokens: ["rXYZ"] };
      throw new Error("Backing amount must be a number above zero.");
    });
    render(<CheckMyLoan />);
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Check my loan" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Backing amount must be a number above zero."));
    expect(screen.getByLabelText(/Backing amount/)).toHaveValue("10");
  });

  it("says so when the token list cannot be read", async () => {
    request.mockRejectedValue(new Error("down"));
    render(<CheckMyLoan />);
    await waitFor(() => expect(screen.getByRole("option", { name: /not available/ })).toBeInTheDocument());
  });
});
