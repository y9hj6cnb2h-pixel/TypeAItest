// Imported first from main.tsx. ES module imports are hoisted, so these globals have
// to be installed by a module that is *evaluated* before anything touching the SDK.
import { Buffer } from "buffer";

const g = globalThis as unknown as Record<string, unknown>;

if (!g.global) g.global = globalThis;
if (!g.Buffer) g.Buffer = Buffer;
if (!g.process) {
  g.process = {
    env: {} as Record<string, string>,
    version: "",
    versions: { node: "" },
    platform: "browser",
    browser: true,
    nextTick: (fn: () => void, ...args: unknown[]) =>
      queueMicrotask(() => (fn as (...a: unknown[]) => void)(...args)),
    cwd: () => "/",
  };
}

export {};
