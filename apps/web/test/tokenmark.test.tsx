// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// TEST FIXTURES ONLY: invented tokens in the shape of the server's logo index.
const INDEX = {
  logos: [
    { coin: "rNVDA", name: "Nvidia", source: "coingecko", hasImage: true, fetchedAt: 1 },
    { coin: "rHIMS", name: "Hims & Hers Health", source: "none", hasImage: false, fetchedAt: 1 },
  ],
};
const answer = async (): Promise<unknown> => INDEX;
const request = vi.fn((path: string) => (path === "/public/logos" ? answer() : Promise.reject(new Error("unexpected " + path))));
vi.mock("../src/lib/api", () => ({ WORKER_URL: "https://worker.test", request: (...a: unknown[]) => request(...(a as [string])) }));

import { initials, TokenLabel, TokenMark } from "../src/components/TokenMark";
import { TokenTicker } from "../src/components/TokenTicker";

vi.mock("../src/lib/useMarket", () => ({
  useMarket: () => ({ loading: false, failed: false, data: { tokens: [{ coin: "rNVDA", symbol: "RNVDAUSDT", price: 100, change24h: 0.01 }, { coin: "rHIMS", symbol: "RHIMSUSDT", price: 50, change24h: -0.02 }], backingCount: 2, levels: null, uniform: true, asOf: 1 } }),
}));

afterEach(cleanup);

describe("token logos", () => {
  it("makes initials from the company name, else the ticker", () => {
    expect(initials("rHIMS", "Hims & Hers Health")).toBe("HH");
    expect(initials("rNVDA", "Nvidia")).toBe("NV"); // one word: the ticker
    expect(initials("rAAPL", null)).toBe("AA");
  });

  it("shows the real logo from the server when there is one, and initials when there is none", async () => {
    const { container } = render(
      <>
        <TokenMark coin="rNVDA" size={32} />
        <TokenMark coin="rHIMS" size={32} />
      </>,
    );
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://worker.test/public/logo/rNVDA");
    expect(screen.getByText("HH")).toBeInTheDocument(); // no real logo: initials from the real company name, never an invented picture
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("falls back to initials if the image fails to load", async () => {
    const { container } = render(<TokenMark coin="rNVDA" />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("NV")).toBeInTheDocument();
  });

  it("shows the company name next to the ticker, or the ticker alone when the name is unknown", async () => {
    render(
      <>
        <TokenLabel coin="rNVDA" />
        <TokenLabel coin="rZZZ" />
      </>,
    );
    await waitFor(() => expect(screen.getByText(/· Nvidia/)).toBeInTheDocument());
    expect(screen.getByText("rZZZ").parentElement?.textContent).toBe("rZZZ");
  });

  it("puts the logo and company name on every chip of the price strip", async () => {
    const { container } = render(<TokenTicker />);
    await waitFor(() => expect(screen.getAllByText(/· Nvidia/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/· Hims & Hers Health/).length).toBeGreaterThan(0);
    expect(container.querySelectorAll("img").length).toBeGreaterThan(0);
  });
});
