import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  User,
} from '@shared/api.interface';

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  try {
    const response = await axiosForBackend.post('/api/auth/register', data);
    return response.data;
  } catch (error) {
    logger.error('注册失败', error);
    throw error;
  }
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
  try {
    const response = await axiosForBackend.post('/api/auth/login', data);
    return response.data;
  } catch (error) {
    logger.error('登录失败', error);
    throw error;
  }
}

export async function getCurrentUser(): Promise<{ user: User }> {
  try {
    const token = localStorage.getItem('atoms_demo_token');
    const response = await axiosForBackend.get('/api/auth/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return response.data;
  } catch (error) {
    logger.error('获取当前用户失败', error);
    throw error;
  }
}
