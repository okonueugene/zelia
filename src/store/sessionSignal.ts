/**
 * Tiny event-bridge that lets api/client.ts notify the auth store
 * about a 401 session expiry without creating a circular import chain.
 *
 * Import chain without this module:
 *   client.ts → authStore.ts → api/auth.ts → client.ts  ← circular!
 *
 * With this module both sides import a dependency-free file:
 *   client.ts   → sessionSignal.ts   (safe)
 *   authStore.ts → sessionSignal.ts  (safe)
 */

type AsyncVoidFn = () => Promise<void>;

let _handler: AsyncVoidFn | null = null;

/** Registered once by authStore at module init time. */
export const setSessionExpiredHandler = (fn: AsyncVoidFn) => {
  _handler = fn;
};

/**
 * Called by api/client.ts whenever a 401 response is received on a
 * non-auth endpoint.  The registered handler clears SecureStore AND
 * the in-memory Zustand state so every auth-gated hook stops firing.
 */
export const notifySessionExpired = async (): Promise<void> => {
  await _handler?.();
};
