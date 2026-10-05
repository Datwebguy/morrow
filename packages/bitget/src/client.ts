import {
  assertOperationAllowed,
  assertRawWriteAllowed,
  buildAddBacking,
  buildOwnTransfer,
  buildPayDown,
  READ_OPERATIONS,
  type AddBackingRequest,
  type OwnTransferRequest,
  type PayDownRequest,
  type ReadOperation,
} from "./guard";
import type { Transport } from "./transport";

export interface DryRunResult {
  dryRun: true;
  operationId: string;
  wouldSend: Record<string, unknown>;
}

export interface SentResult {
  dryRun: false;
  operationId: string;
  sent: Record<string, unknown>;
  response: unknown;
}

export type WriteResult = DryRunResult | SentResult;

export interface WriteOptions {
  /** Preview only: nothing is sent. Defaults to true so a live write is always a deliberate choice. */
  dryRun?: boolean;
}

/**
 * Everything Morrow can do on a user's Bitget account.
 * Reads, plus two loan writes (pay down, add backing) and own-account transfers.
 * Borrow and withdraw do not exist here.
 */
export class MorrowBitget {
  constructor(private readonly transport: Transport) {}

  async read(operationId: ReadOperation, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!(READ_OPERATIONS as readonly string[]).includes(operationId)) {
      assertOperationAllowed(operationId); // throws for anything that is not allowed at all
      throw new Error(`"${operationId}" is a write, not a read`);
    }
    return this.transport.call(operationId, args);
  }

  async ongoingLoans(): Promise<unknown> {
    return this.read("getBorrowOngoing");
  }

  async debts(): Promise<unknown> {
    return this.read("getLoanDebts");
  }

  /** Pay down part of a loan with the borrowed coin. Never touches the user's backing. */
  async payDown(req: PayDownRequest, opts: WriteOptions = {}): Promise<WriteResult> {
    return this.write("repayCoins", buildPayDown(req), opts);
  }

  /** Add more of the backing token to a loan. Never removes backing. */
  async addBacking(req: AddBackingRequest, opts: WriteOptions = {}): Promise<WriteResult> {
    return this.write("revisePledge", buildAddBacking(req), opts);
  }

  /** Move funds between the user's own Bitget accounts. */
  async transferBetweenOwnAccounts(req: OwnTransferRequest, opts: WriteOptions = {}): Promise<WriteResult> {
    return this.write("transfer", buildOwnTransfer(req), opts);
  }

  /** Generic entry for callers holding a raw request. Runs the same checks as the typed methods. */
  async send(operationId: string, args: Record<string, unknown>, opts: WriteOptions = {}): Promise<WriteResult> {
    return this.write(operationId, assertRawWriteAllowed(operationId, args), opts);
  }

  private async write(operationId: string, body: Record<string, unknown>, opts: WriteOptions): Promise<WriteResult> {
    // Re-check what is about to be sent, even when it came from a builder.
    const checked = assertRawWriteAllowed(operationId, body);
    if (opts.dryRun !== false) return { dryRun: true, operationId, wouldSend: checked };
    const response = await this.transport.call(operationId, checked);
    return { dryRun: false, operationId, sent: checked, response };
  }
}
