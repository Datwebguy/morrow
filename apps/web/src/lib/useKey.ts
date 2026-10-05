"use client";

import { useSyncExternalStore } from "react";
import { getKey, subscribeKey } from "./api";

/** The access key stored in this browser. `undefined` while the page is still loading on the client. */
export function useKey(): string | null | undefined {
  return useSyncExternalStore(subscribeKey, getKey, () => undefined);
}
