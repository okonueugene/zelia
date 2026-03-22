import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as authApi from '../api/auth';
import type { UserProfile, LoginCredentials } from '../types';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  authReady: boolean;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  clearError: () => void;
  updateUser: (user: UserProfile) => Promise<void>;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// A token is valid if it's a non-empty string
const isValidToken = (token: unknown): token is string =>
  typeof token === 'string' && token.trim().length > 0;

// A user object is valid if it matches the actual UserProfile shape:
// { id, user: { id, username }, is_admin, is_salesperson, ... }
const isValidUser = (user: unknown): user is UserProfile => {
  if (!user || typeof user !== 'object') return false;
  const u = user as Record<string, unknown>;
  // Must have a top-level id (UserProfile.id)
  if (!u.id) return false;
  // Must have nested user object with at minimum a username
  const inner = u.user as Record<string, unknown> | undefined;
  if (!inner || (!inner.id && !inner.username)) return false;
  return true;
};

const clearStoredAuth = async () => {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(USER_KEY).catch(() => {}),
  ]);
};

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  authReady: false,

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(credentials);
      if (!response?.token || !response?.user) {
        throw new Error(
          response?.message || 'Login response missing token or user data',
        );
      }

      await Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, response.token),
        SecureStore.setItemAsync(USER_KEY, JSON.stringify(response.user)),
      ]);

      set({
        token: response.token,
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        authReady: true,
        error: null,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Login failed. Please try again.';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authApi.logout().catch(() => {}); // silent fail
    } finally {
      await clearStoredAuth();
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        authReady: true,
        error: null,
      });
    }
  },

  loadStoredAuth: async () => {
    set({ isLoading: true, authReady: false });
    try {
      const [token, userJson] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      // No stored session — not an error, just not logged in
      if (!token && !userJson) {
        return;
      }

      // Token present but invalid string
      if (!isValidToken(token)) {
        console.warn('[Auth] Stored token is invalid — clearing session');
        await clearStoredAuth();
        return;
      }

      // Parse user JSON
      let user: UserProfile | null = null;
      if (userJson) {
        try {
          user = JSON.parse(userJson);
        } catch {
          console.warn('[Auth] Stored user JSON is corrupted — clearing session');
          await clearStoredAuth();
          return;
        }
      }

      // User present but fails shape check
      if (user && !isValidUser(user)) {
        console.warn('[Auth] Stored user missing identity fields — clearing session');
        await clearStoredAuth();
        return;
      }

      // All good — restore session
      set({
        token,
        user,
        isAuthenticated: true,
        error: null,
      });
    } catch (err) {
      // Unexpected error (e.g. SecureStore unavailable) — don't wipe, just log
      console.warn('[Auth] Unexpected error loading stored auth:', err);
    } finally {
      set({ isLoading: false, authReady: true });
    }
  },

  clearError: () => set({ error: null }),

  updateUser: async (updatedUser: UserProfile) => {
    try {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(updatedUser));
      set({ user: updatedUser });
    } catch (err) {
      console.error('[Auth] Failed to update stored user:', err);
    }
  },
}));

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectIsAdmin = (state: AuthState) => state.user?.is_admin ?? false;
export const selectIsSalesperson = (state: AuthState) => state.user?.is_salesperson ?? false;
export const selectAuthReady = (state: AuthState) => state.authReady;
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectUser = (state: AuthState) => state.user;
export const selectToken = (state: AuthState) => state.token;
export const selectAuthError = (state: AuthState) => state.error;
export const selectIsAuthLoading = (state: AuthState) => state.isLoading;
