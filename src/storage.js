const DB = "spotiswipe-v3",
  STORE = "session";
let dbPromise;
function db() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(Error("Close other Spotiswipe tabs and try again."));
  }));
}
export async function loadSession() {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE)
      .objectStore(STORE)
      .get("current");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
let chain = Promise.resolve();
export function persistSession(state) {
  const snapshot = structuredClone(state);
  const operation = chain
    .catch(() => {})
    .then(async () => {
      const database = await db();
      await new Promise((resolve, reject) => {
        const tx = database.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(snapshot, "current");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || Error("Save was interrupted."));
      });
    });
  chain = operation;
  return operation;
}
