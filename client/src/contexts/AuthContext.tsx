import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { User } from '@shared/api.interface';
import { auth as authApi } from '@client/src/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  updateCredits: (credits: number) => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'atoms_demo_token';
const USER_KEY = 'atoms_demo_user';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser = localStorage.getItem(USER_KEY);
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch (error) {
      logger.error('读取认证信息失败', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (newUser: User, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  };

  const updateCredits = (credits: number) => {
    if (!user) return;
    const updated = { ...user, credits };
    setUser(updated);
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const { user: freshUser } = await authApi.getCurrentUser();
      if (freshUser) {
        setUser(freshUser);
        localStorage.setItem(USER_KEY, JSON.stringify(freshUser));
      }
    } catch (error) {
      logger.error('刷新用户信息失败', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, updateUser, updateCredits, refreshUser, isLoading }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
