import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';

export const BASE_URL = 'https://zeliaoms.mcdave.co.ke/api/';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'User-Agent': 'ZeliaOMS-Android/1.0 (Mobile; React-Native)',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Content-Type': 'application/json',
    'X-App-Name': 'ZeliaOMS',
    'X-App-Version': '1.0',
  },
});

const API_DEBUG = __DEV__;

// Debounce the 401 handler so a burst of parallel requests only triggers one logout
let sessionExpiredHandled = false;
const handleSessionExpired = async () => {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;

  // Clear stored credentials
  await Promise.all([
    SecureStore.deleteItemAsync('auth_token').catch(() => {}),
    SecureStore.deleteItemAsync('auth_user').catch(() => {}),
  ]);

  // Show user-facing message
  Toast.show({
    type: 'error',
    text1: 'Session Expired',
    text2: 'Please log in again to continue.',
    visibilityTime: 4000,
  });

  // Navigate to login — small delay so toast renders first
  setTimeout(() => {
    sessionExpiredHandled = false; // reset for next session
    router.replace('/login');
  }, 500);
};

// ─── Request interceptor — attach token ──────────────────────────────────────

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    if (API_DEBUG) {
      const method = (config.method || 'get').toUpperCase();
      const url = `${config.baseURL || ''}${config.url || ''}`;
      console.log('[API REQUEST]', method, url, {
        params: config.params,
        hasBody: !!config.data,
      });
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response interceptor — handle errors ────────────────────────────────────

apiClient.interceptors.response.use(
  (response) => {
    if (API_DEBUG) {
      const method = (response.config.method || 'get').toUpperCase();
      const url = `${response.config.baseURL || ''}${response.config.url || ''}`;
      console.log('[API RESPONSE]', method, url, {
        status: response.status,
        dataSample:
          typeof response.data === 'string'
            ? response.data.slice(0, 200)
            : response.data,
      });
    }
    return response;
  },
  async (error: AxiosError<Record<string, unknown>>) => {
    if (API_DEBUG) {
      const cfg = error.config || {};
      const method = (cfg.method || 'get').toUpperCase();
      const url = `${(cfg as any).baseURL || ''}${cfg.url || ''}`;
      console.error('[API ERROR]', method, url, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
      });
    }

    // ── 401: session expired or invalid token ─────────────────────────────
    if (error.response?.status === 401) {
      await handleSessionExpired();
      return Promise.reject(new Error('Session expired. Please log in again.'));
    }

    // ── Structured DRF error response ─────────────────────────────────────
    if (error.response?.data) {
      const d = error.response.data;
      const msg =
        (d.detail as string) ||
        (d.error as string) ||
        (d.message as string) ||
        (Array.isArray(d.non_field_errors)
          ? (d.non_field_errors as string[])[0]
          : undefined) ||
        extractFirstFieldError(d) ||
        `Server error (${error.response.status})`;
      const enhanced = new Error(msg) as Error & { status: number; data: unknown };
      enhanced.status = error.response.status;
      enhanced.data = d;
      return Promise.reject(enhanced);
    }

    // ── Timeout ────────────────────────────────────────────────────────────
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return Promise.reject(new Error('Request timed out. Check your connection.'));
    }

    // ── No response (network/CORS/DNS) ─────────────────────────────────────
    if (!error.response) {
      const hint =
        error.code === 'ERR_NETWORK'
          ? ' Often caused by CORS or firewall blocking the request.'
          : '';
      return Promise.reject(
        new Error(
          `Unable to reach the server. It may be offline or blocked by your network.${hint}`,
        ),
      );
    }

    return Promise.reject(error);
  },
);

function extractFirstFieldError(data: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (Array.isArray(val) && typeof val[0] === 'string') {
      return `${key}: ${val[0]}`;
    }
    if (typeof val === 'string') return `${key}: ${val}`;
  }
  return undefined;
}

export default apiClient;
