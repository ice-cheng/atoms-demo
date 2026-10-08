import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';

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
      const hadToken = !!(originalRequest?.headers?.Authorization || localStorage.getItem(TOKEN_KEY));
      const skipClear = originalRequest?._skipAuthClear;

      if (hadToken && !skipClear) {
        logger.warn('[auth] 401 且请求携带了 token，清空登录态');
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('atoms_demo_user');
        const event = new CustomEvent('auth:token-cleared', { detail: { reason: '401' } });
        window.dispatchEvent(event);
      } else {
        logger.warn('[auth] 401 但请求未携带 token，保留登录态（可能是公网接口或时序问题）');
      }

      return Promise.reject(error);
    }

    return Promise.reject(error);
  },
);

export { axiosForBackend };
