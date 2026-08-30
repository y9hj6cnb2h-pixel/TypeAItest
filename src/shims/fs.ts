// Inert `fs` for the browser. The SDK's bundled dotenv calls readFileSync inside a
// try/catch, so throwing here simply means "no .env file", which is what we want.
const enoent = () => {
  const err: NodeJS.ErrnoException = new Error(
    "fs is not available in the browser",
  );
  err.code = "ENOENT";
  throw err;
};

export const readFileSync = enoent;
export const writeFileSync = enoent;
export const appendFileSync = enoent;
export const existsSync = () => false;
export const statSync = enoent;
export const readdirSync = () => [] as string[];

export default {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  statSync,
  readdirSync,
};
