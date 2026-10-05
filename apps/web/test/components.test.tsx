// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionButton } from "../src/components/ActionButton";
import { EmptyState, ErrorNote } from "../src/components/EmptyState";
import { Gauge } from "../src/components/Gauge";
import { Switch } from "../src/components/Switch";
import { TrustBadge } from "../src/components/TrustBadge";
import { LoanCardSkeleton } from "../src/components/Skeleton";
import { Words } from "../src/components/Reveal";
import { Gate } from "../src/components/Gate";

afterEach(cleanup);

describe("ActionButton: four states", () => {
  it("idle, pending, success with a receipt link", async () => {
    let done!: (v: { line: string; receiptHref: string }) => void;
    const p = new Promise<{ line: string; receiptHref: string }>((r) => (done = r));
    render(<ActionButton label="Approve pay down" onAction={() => p} />);
    const button = screen.getByRole("button", { name: "Approve pay down" });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: /Working/ })).toBeDisabled();
    done({ line: "Pay down 5 (sent).", receiptHref: "/app/activity" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument());
    expect(screen.getByText(/Pay down 5/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See receipt" })).toHaveAttribute("href", "/app/activity");
  });
  it("error shows the plain reason and a way to try again", async () => {
    render(<ActionButton label="Approve" onAction={async () => { throw new Error("Bitget did not accept it. Try again in a minute."); }} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Try again in a minute"));
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
  it("can be disabled", () => {
    render(<ActionButton label="Save" disabled onAction={async () => undefined} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("Switch", () => {
  it("is a real switch with state and a busy state", () => {
    const change = vi.fn();
    const { rerender } = render(<Switch checked={false} onChange={change} label="Protect this loan" />);
    const sw = screen.getByRole("switch", { name: "Protect this loan" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(change).toHaveBeenCalledWith(true);
    rerender(<Switch checked busy onChange={change} label="Protect this loan" />);
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});

describe("Gauge", () => {
  it("reads out loan health and the status in words", () => {
    render(<Gauge ratio={0.58} marginCall={0.75} liquidation={0.91} status="watch" />);
    expect(screen.getByLabelText(/Loan health 58.0%/)).toBeInTheDocument();
    expect(screen.getByText("Getting close")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("empty state has a next action", () => {
    render(<EmptyState title="No loans yet" line="Connect Bitget to start." action={{ label: "Connect Bitget", href: "/app/connect" }} />);
    expect(screen.getByRole("link", { name: "Connect Bitget" })).toHaveAttribute("href", "/app/connect");
  });
  it("error note announces itself and can retry", () => {
    const retry = vi.fn();
    render(<ErrorNote message="Morrow could not reach its server." onRetry={retry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });
  it("skeleton is announced as loading", () => {
    render(<LoanCardSkeleton />);
    expect(screen.getByRole("status", { name: "Loading your loans" })).toBeInTheDocument();
  });
  it("trust badge says why a price is not trusted", () => {
    render(<TrustBadge trust={{ trusted: false, failures: ["thin_book"] }} />);
    expect(screen.getByText(/too few orders/)).toBeInTheDocument();
  });
  it("headline keeps its full text for screen readers", () => {
    render(<Words text="Borrow today. Still yours tomorrow." />);
    expect(screen.getByRole("heading", { name: "Borrow today. Still yours tomorrow." })).toBeInTheDocument();
  });
  it("the gate asks to connect when this site has no server or no key", () => {
    render(<Gate><p>secret</p></Gate>);
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });
});
