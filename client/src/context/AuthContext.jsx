import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAccessToken } from '../services/api.js';

const AuthContext = createContext(null);
function unwrapUser(data) {
  const user = data?.user || data?.data?.user || data?.data || data;
  const role = String(user?.role || '').toLowerCase();
  return {
    ...user,
    role: role === 'admin' ? 'Admin' : role === 'hr' ? 'HR Manager' : role === 'manager' ? 'Manager' : role === 'employee' ? 'Employee' : user?.role,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    try { await api.post('/auth/logout'); } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.get('/auth/me')
      .then(({ data }) => { if (active) setUser(unwrapUser(data)); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    const onUnauthorized = () => { setUser(null); setAccessToken(null); };
    window.addEventListener('ems:unauthorized', onUnauthorized);
    return () => { active = false; window.removeEventListener('ems:unauthorized', onUnauthorized); };
  }, []);

  const signIn = useCallback(async (credentials) => {
    const { data } = await api.post('/auth/login', credentials);
    const token = data.accessToken || data.token;
    setAccessToken(token);
    const nextUser = unwrapUser(data);
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = useMemo(() => ({ user, loading, signIn, signOut, setUser }), [user, loading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
