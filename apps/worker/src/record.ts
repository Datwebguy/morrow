import type { Grade } from "./grade";
import type { PromiseRow, Store } from "./db";
import { sizeBand, type PromiseBody } from "./promise";

export interface PublicPromise {
  id: string;
  closeTs: number;
  reopenTs: number;
  /** The sealed promise's fingerprint. Published at once, so the promise cannot be edited afterwards. */
  fingerprint: string;
  sealedAt: number;
  late: boolean;
  /** Loan size as a band, never an exact balance. */
  sizeBand: string;
  backingCoin: string;
  simulated: boolean;
  status: "sealed" | "graded";
  kept: boolean | null;
  actions: number;
  cost: number | null;
  wouldHaveHadMarginCall: boolean | null;
  wouldHaveBeenLiquidated: boolean | null;
  marginCallAvoided: boolean;
  liquidationAvoided: boolean;
}

export interface Totals {
  promises: number;
  graded: number;
  kept: number;
  marginCallsAvoided: number;
  liquidationsAvoided: number;
  /** USDT paid down plus the value of backing added. */
  totalCost: number;
}

export interface PublicRecord {
  /** Real results only. Simulated entries are listed apart and never counted in `totals`. */
  totals: Totals;
  promises: PublicPromise[];
  simulated: PublicPromise[];
}

function view(row: PromiseRow): PublicPromise {
  const body = JSON.parse(row.body) as PromiseBody;
  const grade = row.grade ? (JSON.parse(row.grade) as Grade) : null;
  return {
    id: row.id, closeTs: row.closeTs, reopenTs: row.reopenTs, fingerprint: row.fingerprint, sealedAt: body.sealedAt, late: body.late,
    sizeBand: sizeBand(body.debtAtSeal), backingCoin: body.backingCoin, simulated: row.simulated, status: grade ? "graded" : "sealed",
    kept: grade ? grade.kept : null, actions: grade ? grade.actions.length : (JSON.parse(row.actions) as unknown[]).length,
    cost: grade ? grade.paidDown + grade.addedBackingValue : null, wouldHaveHadMarginCall: grade?.wouldHaveHadMarginCall ?? null,
    wouldHaveBeenLiquidated: grade?.wouldHaveBeenLiquidated ?? null, marginCallAvoided: grade?.marginCallAvoided ?? false,
    liquidationAvoided: grade?.liquidationAvoided ?? false,
  };
}

/** The public record. Personal details are never included. */
export function publicRecord(store: Store): PublicRecord {
  const all = store.allPromises().map(view);
  const real = all.filter((p) => !p.simulated);
  const graded = real.filter((p) => p.status === "graded");
  return {
    totals: {
      promises: real.length, graded: graded.length, kept: graded.filter((p) => p.kept === true).length,
      marginCallsAvoided: graded.filter((p) => p.marginCallAvoided).length, liquidationsAvoided: graded.filter((p) => p.liquidationAvoided).length,
      totalCost: graded.reduce((s, p) => s + (p.cost ?? 0), 0),
    },
    promises: real,
    simulated: all.filter((p) => p.simulated),
  };
}
