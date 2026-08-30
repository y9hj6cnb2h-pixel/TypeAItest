// The SDK only reaches for node:crypto through dotenv's encrypted-.env path
// (DOTENV_KEY), which never triggers in the browser. Fail loudly if it somehow does.
const unsupported = (name: string) => () => {
  throw new Error(`node:crypto.${name} is not available in the browser`);
};

export const createDecipheriv = unsupported("createDecipheriv");
export const createCipheriv = unsupported("createCipheriv");
export const createHash = unsupported("createHash");

export const randomBytes = (size: number) => {
  const arr = new Uint8Array(size);
  globalThis.crypto.getRandomValues(arr);
  return arr;
};

export default { createDecipheriv, createCipheriv, createHash, randomBytes };
