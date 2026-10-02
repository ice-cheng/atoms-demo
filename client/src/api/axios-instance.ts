import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { getCurrentUser } from './auth';

const TOKEN_KEY = 'atoms_demo_token';

function getCsrfTokenFromCookie(): string {
  const name = 'suda-csrf-token';
  const cookies = document.cookie.split('; ');
  for (const cookie of cookies) {
    const [k, v] = cookie.split('=');
    if (k === name) return decodeURIComponent(v);
  }
  return '';
}

let isRefreshing = false;
let pendingQueue: Array<() => void> = [];

function processQueue(): void {
  pendingQueue.forEach((resolve: () => void) => resolve());
  pendingQueue = [];
}

axiosForBackend.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    if (config.headers) {
      const csrfFromCookie = getCsrfTokenFromCookie();
      if (csrfFromCookie) {
        config.headers['X-Suda-Csrf-Token'] = csrfFromCookie;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

axiosForBackend.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error.config;

    if (status !== 401 && status !== 403) {
      return Promise.reject(error);
    }

    if (status === 403) {
      const csrfFromCookie = getCsrfTokenFromCookie();
      if (csrfFromCookie && originalRequest && !originalRequest._csrfRetried) {
        originalRequest._csrfRetried = true;
        originalRequest.headers = {
          ...(originalRequest.headers || {}),
          'X-Suda-Csrf-Token': csrfFromCookie,
        };
        logger.warn('403 重试：从 cookie 补充 CSRF token');
        return axiosForBackend(originalRequest);
      }
    }

    if (status === 401) {
      if (!originalRequest) return Promise.reject(error);

      if (originalRequest._retry || originalRequest._skipAuthRefresh) {
        logger.warn('[auth] 401 重试仍失败或鉴权端点失败，清空登录态');
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('atoms_demo_user');
        if (isRefreshing) {
          isRefreshing = false;
          processQueue();
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise<void>((resolve: () => void) => {
          pendingQueue.push(resolve);
        }).then(() => axiosForBackend(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) throw new Error('no token');
        await axiosForBackend.get('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
          _skipAuthRefresh: true,
        } as any);
        logger.log({ level: 'info', args: ['401 静默恢复成功'] });
        processQueue();
        return axiosForBackend(originalRequest);
      } catch (refreshError) {
        logger.warn('401 静默恢复失败', refreshError);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('atoms_demo_user');
        processQueue();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export { axiosForBackend };
