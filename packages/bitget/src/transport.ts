import { BitgetRestClient, loadConfig } from "@bitget-ai/bitget-agent-sdk";

/** The one door to Bitget's private API. Tests replace it with a recorder. */
export interface Transport {
  call(operationId: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface Credentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

/** Transport backed by the official SDK. Credentials are passed in and never logged. */
export function sdkTransport(creds: Credentials, opts?: { paperTrading?: boolean }): Transport {
  const config = loadConfig({
    apiKey: creds.apiKey,
    secretKey: creds.secretKey,
    passphrase: creds.passphrase,
    paperTrading: opts?.paperTrading ?? false,
  });
  const client = new BitgetRestClient(config);
  return {
    async call(operationId, args) {
      const res = await client.callOperation(operationId, args);
      return res;
    },
  };
}
