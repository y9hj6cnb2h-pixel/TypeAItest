// Imported first from main.tsx. ES module imports are hoisted, so these globals have
// to be installed by a module that is *evaluated* before anything touching the SDK.
import { Buffer } from "buffer";

const g = globalThis as unknown as Record<string, any>;

if (!g.global) g.global = globalThis;
if (!g.Buffer) g.Buffer = Buffer;

// Merge rather than replace. Vite's dev server can leave a partial `process` in place
// (from its `define` handling), and an all-or-nothing guard then skips the pieces the
// SDK's bundled dotenv actually calls — `process.cwd()` being the one that crashed.
const proc = (g.process ??= {});
proc.env ??= {};
proc.version ??= "";
proc.versions ??= { node: "" };
proc.platform ??= "browser";
proc.browser ??= true;
proc.argv ??= [];
if (typeof proc.cwd !== "function") proc.cwd = () => "/";
if (typeof proc.nextTick !== "function")
  proc.nextTick = (fn: (...a: unknown[]) => void, ...args: unknown[]) =>
    queueMicrotask(() => fn(...args));
if (typeof proc.on !== "function") proc.on = () => proc;
if (typeof proc.emit !== "function") proc.emit = () => false;

export {};
