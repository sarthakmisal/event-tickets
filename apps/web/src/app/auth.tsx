import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { UserDto } from '@et/shared';
import { api } from '../lib/api';

interface AuthState {
  /** undefined while the first session check is running. */
  user: UserDto | null | undefined;
  login: (login: string, password: string) => Promise<UserDto>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null | undefined>(undefined);

  useEffect(() => {
    void api.auth.me().then(setUser, () => setUser(null));
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    const next = await api.auth.login({ login: loginId, password });
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user; only call below the auth guard. */
export function useUser(): UserDto {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
}
