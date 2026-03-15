import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

// In development (Expo Go), connect to the local Django dev server running on your PC.
// In production (APK build), connect to the live server.
// Run the dev server with: python manage.py runserver 0.0.0.0:8000
export const BASE_URL = 'https://backup.mcdave.co.ke/api/';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
       // These headers help Imunify360 recognise the request
    // as a legitimate mobile app, not a bot
    'User-Agent': 'ZeliaOMS-Android/1.0 (Mobile; React-Native)',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Content-Type': 'application/json',
    'X-App-Name': 'ZeliaOMS',
    'X-App-Version': '1.0',
  },
});

// Simple flag so we only spam logs in dev
const API_DEBUG = __DEV__;

// Attach token to every request
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync('auth_token');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    if (API_DEBUG) {
      const method = (config.method || 'get').toUpperCase();
      const url = `${config.baseURL || ''}${config.url || ''}`;
      // Avoid logging huge bodies; this is just for visibility during debugging
      console.log('[API REQUEST]', method, url, {
        params: config.params,
        hasBody: !!config.data,
      });
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Normalize error responses — extract readable message from Django DRF errors
apiClient.interceptors.response.use(
  (response) => {
    if (API_DEBUG) {
      const method = (response.config.method || 'get').toUpperCase();
      const url = `${response.config.baseURL || ''}${response.config.url || ''}`;
      console.log('[API RESPONSE]', method, url, {
        status: response.status,
        // Show a small slice of data to avoid huge logs
        dataSample:
          typeof response.data === 'string'
            ? response.data.slice(0, 200)
            : response.data,
      });
    }
    return response;
  },
  (error: AxiosError<Record<string, unknown>>) => {
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

    if (error.response?.status === 401) {
      SecureStore.deleteItemAsync('auth_token');
    }

    if (error.response?.data) {
      const d = error.response.data;
      const msg =
        (d.detail as string) ||
        (d.error as string) ||
        (d.message as string) ||
        (Array.isArray(d.non_field_errors) ? (d.non_field_errors as string[])[0] : undefined) ||
        extractFirstFieldError(d) ||
        `Server error (${error.response.status})`;
      const enhanced = new Error(msg) as Error & { status: number; data: unknown };
      enhanced.status = error.response.status;
      enhanced.data = d;
      return Promise.reject(enhanced);
    }

    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return Promise.reject(new Error('Request timed out. Check your connection.'));
    }

    if (!error.response) {
      // ERR_NETWORK / CORS / DNS / connection refused — browser never got a response
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
