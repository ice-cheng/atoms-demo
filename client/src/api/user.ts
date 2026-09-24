import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { RechargeRequest, RechargeResponse, User, UpdateUserRequest, BrandKit } from '@shared/api.interface';

const getHeaders = () => {
  const token = localStorage.getItem('atoms_demo_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function updateUser(data: UpdateUserRequest): Promise<User> {
  try {
    const response = await axiosForBackend.patch('/api/user/profile', data, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    logger.error('更新用户信息失败', error);
    throw error;
  }
}

export async function deleteAccount(): Promise<void> {
  try {
    await axiosForBackend.delete('/api/user/account', {
      headers: getHeaders(),
    });
  } catch (error) {
    logger.error('删除账户失败', error);
    throw error;
  }
}

export async function recharge(data: RechargeRequest): Promise<RechargeResponse> {
  try {
    const response = await axiosForBackend.post('/api/user/recharge', data, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    logger.error('充值失败', error);
    throw error;
  }
}

export async function getBrandKit(): Promise<BrandKit> {
  try {
    const response = await axiosForBackend.get('/api/user/brand-kit', {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    logger.error('获取品牌配置失败', error);
    throw error;
  }
}

export async function updateBrandKit(data: Partial<BrandKit>): Promise<BrandKit> {
  try {
    const response = await axiosForBackend.patch('/api/user/brand-kit', data, {
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    logger.error('更新品牌配置失败', error);
    throw error;
  }
}
