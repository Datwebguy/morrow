import { describe, expect, it } from "vitest";
import { ForbiddenRequestError, MorrowBitget, type Transport } from "../src";

/** Test fixture: a transport that records every call so tests can prove nothing was sent. */
function recorder(): Transport & { calls: Array<{ operationId: string; args: Record<string, unknown> }> } {
  const calls: Array<{ operationId: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    async call(operationId, args) {
      calls.push({ operationId, args });
      return { ok: true };
    },
  };
}

async function refuses(p: Promise<unknown>, reason: string): Promise<void> {
  await expect(p).rejects.toBeInstanceOf(ForbiddenRequestError);
  await expect(p).rejects.toMatchObject({ reason });
}

describe("hard limits: refused before any request is sent", () => {
  it("refuses repay with method=collateral", async () => {
    const t = recorder();
    const b = new MorrowBitget(t);
    await refuses(b.send("repayCoins", { orderId: "1", method: "collateral", repayAll: "no", amount: "5" }, { dryRun: false }), "repay_method_must_be_borrowed_coin");
    expect(t.calls).toHaveLength(0);
  });
  it("refuses repay that redeems backing", async () => {
    const t = recorder();
    await refuses(
      new MorrowBitget(t).send("repayCoins", { orderId: "1", method: "borrowed_coin", repayAll: "no", amount: "5", repayUnlock: "yes" }, { dryRun: false }),
      "repay_method_must_be_borrowed_coin",
    );
    expect(t.calls).toHaveLength(0);
  });
  it("refuses repay in full", async () => {
    const t = recorder();
    await refuses(new MorrowBitget(t).send("repayCoins", { orderId: "1", method: "borrowed_coin", repayAll: "yes", amount: "5" }, { dryRun: false }), "missing_field");
    expect(t.calls).toHaveLength(0);
  });
  it("refuses revise pledge with reviseType=OUT", async () => {
    const t = recorder();
    await refuses(new MorrowBitget(t).send("revisePledge", { orderId: "1", amount: "1", pledgeCoin: "rXYZ", reviseType: "OUT" }, { dryRun: false }), "revise_type_must_be_in");
    expect(t.calls).toHaveLength(0);
  });
  it("refuses revise pledge with reviseType missing", async () => {
    const t = recorder();
    await refuses(new MorrowBitget(t).send("revisePledge", { orderId: "1", amount: "1", pledgeCoin: "rXYZ" }, { dryRun: false }), "revise_type_must_be_in");
    expect(t.calls).toHaveLength(0);
  });
  it("refuses borrow", async () => {
    const t = recorder();
    const b = new MorrowBitget(t);
    await refuses(b.send("borrowCoins", { loanCoin: "USDT", pledgeCoin: "rXYZ", daily: "FLEXIBLE", loanAmount: "10" }, { dryRun: false }), "operation_not_allowed");
    await refuses(b.read("borrowCoins" as never), "operation_not_allowed");
    expect(t.calls).toHaveLength(0);
  });
  it("refuses withdraw, in every form", async () => {
    const t = recorder();
    const b = new MorrowBitget(t);
    for (const op of ["withdrawal", "brokerSubaccountWithdrawal", "withdraw"]) {
      await refuses(b.send(op, { coin: "USDT", address: "x", size: "1" }, { dryRun: false }), "operation_not_allowed");
    }
    expect(t.calls).toHaveLength(0);
  });
  it("refuses transfer to anyone other than the user's own accounts", async () => {
    const t = recorder();
    const b = new MorrowBitget(t);
    await refuses(b.send("transfer", { fromType: "spot", toType: "uta", amount: "1", coin: "USDT", toUid: "123" }, { dryRun: false }), "transfer_not_between_own_accounts");
    await refuses(b.send("transfer", { fromType: "spot", toType: "someone_else", amount: "1", coin: "USDT" }, { dryRun: false }), "transfer_not_between_own_accounts");
    await refuses(b.send("transfer", { fromType: "spot", toType: "spot", amount: "1", coin: "USDT" }, { dryRun: false }), "transfer_not_between_own_accounts");
    await refuses(b.send("transfer", { fromType: "spot", toType: "uta", amount: "1", coin: "USDT", allowBorrow: "yes" }, { dryRun: false }), "transfer_not_between_own_accounts");
    await refuses(b.send("subMainAccountTransfer", { amount: "1" }, { dryRun: false }), "operation_not_allowed");
    await refuses(b.send("mainSubAccountTransfer", { amount: "1" }, { dryRun: false }), "operation_not_allowed");
    expect(t.calls).toHaveLength(0);
  });
  it("refuses bad amounts and missing fields", async () => {
    const t = recorder();
    const b = new MorrowBitget(t);
    await refuses(b.payDown({ orderId: "1", amount: "0" }, { dryRun: false }), "bad_amount");
    await refuses(b.payDown({ orderId: "1", amount: "abc" }, { dryRun: false }), "bad_amount");
    await refuses(b.payDown({ orderId: "", amount: "5" }, { dryRun: false }), "missing_field");
    await refuses(b.addBacking({ orderId: "1", amount: "-1", pledgeCoin: "rXYZ" }, { dryRun: false }), "bad_amount");
    expect(t.calls).toHaveLength(0);
  });
});

describe("allowed writes", () => {
  it("pay down sends method=borrowed_coin and nothing that sells backing", async () => {
    const t = recorder();
    const r = await new MorrowBitget(t).payDown({ orderId: "9", amount: "12.5" }, { dryRun: false });
    expect(t.calls).toEqual([
      { operationId: "repayCoins", args: { orderId: "9", method: "borrowed_coin", repayAll: "no", amount: "12.5", repayUnlock: "no" } },
    ]);
    expect(r.dryRun).toBe(false);
  });
  it("add backing always sends reviseType=IN explicitly", async () => {
    const t = recorder();
    await new MorrowBitget(t).addBacking({ orderId: "9", amount: "2", pledgeCoin: "rXYZ" }, { dryRun: false });
    expect(t.calls[0]).toEqual({ operationId: "revisePledge", args: { orderId: "9", amount: "2", pledgeCoin: "rXYZ", reviseType: "IN" } });
  });
  it("transfers between the user's own accounts", async () => {
    const t = recorder();
    await new MorrowBitget(t).transferBetweenOwnAccounts({ fromType: "spot", toType: "uta", amount: "10", coin: "USDT" }, { dryRun: false });
    expect(t.calls[0]?.operationId).toBe("transfer");
  });
  it("is a dry run by default and sends nothing", async () => {
    const t = recorder();
    const b = new MorrowBitget(t);
    const r = await b.payDown({ orderId: "9", amount: "1" });
    expect(r).toMatchObject({ dryRun: true, operationId: "repayCoins" });
    const s = await b.addBacking({ orderId: "9", amount: "1", pledgeCoin: "rXYZ" }, { dryRun: true });
    expect(s.dryRun).toBe(true);
    expect(t.calls).toHaveLength(0);
  });
  it("reads go through for allowed read operations only", async () => {
    const t = recorder();
    const b = new MorrowBitget(t);
    await b.ongoingLoans();
    await b.debts();
    expect(t.calls.map((c) => c.operationId)).toEqual(["getBorrowOngoing", "getLoanDebts"]);
    await expect(b.read("repayCoins" as never)).rejects.toThrow();
    expect(t.calls).toHaveLength(2);
  });
});
