// Enough of `path` for the SDK's bundled dotenv to resolve a (nonexistent) .env path.
const normalize = (p: string) => {
  const isAbs = p.startsWith("/");
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!isAbs) out.push("..");
      continue;
    }
    out.push(part);
  }
  return (isAbs ? "/" : "") + out.join("/");
};

export const join = (...parts: string[]) =>
  normalize(parts.filter(Boolean).join("/")) || ".";

export const resolve = (...parts: string[]) => {
  let out = "";
  for (const part of parts) {
    if (!part) continue;
    out = part.startsWith("/") ? part : out ? `${out}/${part}` : part;
  }
  return normalize(out.startsWith("/") ? out : `/${out}`);
};

export const dirname = (p: string) => {
  const i = normalize(p).lastIndexOf("/");
  if (i < 0) return ".";
  return i === 0 ? "/" : normalize(p).slice(0, i);
};

export const basename = (p: string) => normalize(p).split("/").pop() ?? "";
export const extname = (p: string) => {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i <= 0 ? "" : b.slice(i);
};
export const sep = "/";

export default { join, resolve, dirname, basename, extname, sep, normalize };
