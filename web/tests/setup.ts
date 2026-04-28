import "@testing-library/jest-dom/vitest";

// Node 25+ exposes a built-in `globalThis.localStorage` with no real Storage
// API (empty object prototype). happy-dom's window.localStorage then gets
// shadowed, breaking `setItem`/`getItem`/`clear`. Install a tiny in-memory
// Storage polyfill for tests so draft-autosave logic can be exercised
// deterministically.
function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
  };
  return storage;
}

const memoryStorage = createMemoryStorage();
// Override on window AND globalThis so both lookup paths see the same store.
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryStorage,
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage,
});
