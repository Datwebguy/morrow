// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchTokens, TokenPicker } from "../src/components/TokenPicker";

afterEach(cleanup);

// TEST FIXTURES ONLY.
const TOKENS = [
  { coin: "rNVDA", name: "NVIDIA Corporation" },
  { coin: "rNVDL", name: "GraniteShares 2x Long NVDA Daily ETF" },
  { coin: "rAAPL", name: "Apple Inc." },
  { coin: "rZZZ", name: null },
];

describe("token search", () => {
  it("finds a token by ticker, with or without the r, and by company name", () => {
    expect(searchTokens(TOKENS, "rnvda")[0]?.coin).toBe("rNVDA");
    expect(searchTokens(TOKENS, "nvda")[0]?.coin).toBe("rNVDA");
    expect(searchTokens(TOKENS, "nvidia")[0]?.coin).toBe("rNVDA");
    expect(searchTokens(TOKENS, "apple").map((t) => t.coin)).toEqual(["rAAPL"]);
    expect(searchTokens(TOKENS, "zzz")[0]?.coin).toBe("rZZZ");
    expect(searchTokens(TOKENS, "nothing at all")).toEqual([]);
  });
  it("ranks the exact ticker above a looser match, and shows everything for an empty search", () => {
    expect(searchTokens(TOKENS, "nvda").map((t) => t.coin).slice(0, 2)).toEqual(["rNVDA", "rNVDL"]);
    expect(searchTokens(TOKENS, "")).toHaveLength(4);
  });
});

describe("token picker", () => {
  it("opens a list, filters as you type, and picks with the mouse or keyboard", () => {
    const onChange = vi.fn();
    render(<TokenPicker id="t" tokens={TOKENS} failed={false} value="" onChange={onChange} />);
    const box = screen.getByRole("combobox");
    fireEvent.focus(box);
    expect(screen.getAllByRole("option")).toHaveLength(4);
    fireEvent.change(box, { target: { value: "nvidia" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("rNVDA");
    fireEvent.change(box, { target: { value: "apple" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: /rAAPL/ }));
    expect(onChange).toHaveBeenLastCalledWith("rAAPL");
  });
  it("shows the chosen token with its company name, and says plainly when nothing matches", () => {
    render(<TokenPicker id="t" tokens={TOKENS} failed={false} value="rNVDA" onChange={() => {}} />);
    const box = screen.getByRole("combobox") as HTMLInputElement;
    expect(box.value).toBe("rNVDA · NVIDIA Corporation");
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "qqqq" } });
    expect(screen.getByText(/No token matches/)).toBeInTheDocument();
  });
  it("is disabled while loading and says so when the list is not available", () => {
    const { rerender } = render(<TokenPicker id="t" tokens={null} failed={false} value="" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    rerender(<TokenPicker id="t" tokens={null} failed value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/not available/)).toBeInTheDocument();
  });
});
