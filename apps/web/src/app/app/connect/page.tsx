"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/EmptyState";
import { WORKER_URL, request, setKey } from "@/lib/api";
import type { Status } from "@/lib/types";
import { useKey } from "@/lib/useKey";

export default function Connect() {
  const key = useKey();
  const [value, setValue] = useState("");

  if (!WORKER_URL) {
    return (
      <>
        <h1 className="text-2xl sm:text-3xl">Connect Bitget</h1>
        <div className="mt-6">
          <EmptyState title="Not linked to a server yet" line="This site has no Morrow server to talk to yet. Once one is set up, you can connect here." />
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl sm:text-3xl">Connect Bitget</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Morrow can only pay down a loan or add backing. It can never sell, borrow or withdraw.</p>
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="connect-title">
        <h2 id="connect-title" className="flex items-center gap-2 text-lg">
          <ShieldCheck size={20} strokeWidth={1.75} aria-hidden /> Connect Bitget
        </h2>
        <ol className="mt-4 space-y-5">
          <li>
            <label htmlFor="access" className="text-sm font-medium">
              1. Your Morrow access key
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                id="access"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={key ? "Saved in this browser" : "Paste your access key"}
                className="h-11 min-w-0 flex-1 rounded-xl border border-muted/60 bg-canvas px-3 text-sm"
              />
              <ActionButton
                label="Save key"
                variant="secondary"
                disabled={value.trim().length === 0}
                onAction={async () => {
                  const k = value.trim();
                  await request<Status>("/api/status", { key: k });
                  setKey(k);
                  setValue("");
                  return { line: "Key saved in this browser." };
                }}
              />
            </div>
          </li>
          <li>
            <p className="text-sm font-medium">2. Check the connection to Bitget</p>
            <p className="mt-1 text-sm text-muted">Your Bitget connection is set on the Morrow server, so nothing sensitive is typed here.</p>
            <ActionButton
              className="mt-3"
              label="Connect Bitget"
              disabled={!key}
              onAction={async () => {
                const r = await request<{ line: string }>("/api/connect", { method: "POST", body: {} });
                return { line: r.line };
              }}
            />
          </li>
        </ol>
      </section>
    </>
  );
}
