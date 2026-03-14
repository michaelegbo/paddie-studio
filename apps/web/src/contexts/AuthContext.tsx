import * as React from 'react';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
}

interface AuthContextValue {
  user: AuthUser;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const fallbackUser: AuthUser = {
  id: 'studio-local-user',
  email: 'studio@paddie.io',
  name: 'Studio User',
  tenant_id: 'studio-default-tenant',
};

const AuthContext = React.createContext<AuthContextValue>({
  user: fallbackUser,
  loading: true,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser>(fallbackUser);
  const [loading, setLoading] = React.useState(true);

  const refreshUser = React.useCallback(async () => {
    try {
      const response = await fetch('/api/me', {
        credentials: 'include',
      });
      const payload = await response.json();
      if (payload?.authenticated && payload?.user) {
        setUser({
          id: String(payload.user.id || fallbackUser.id),
          email: String(payload.user.email || fallbackUser.email),
          name: String(payload.user.name || fallbackUser.name),
          tenant_id: String(payload.user.tenantId || fallbackUser.tenant_id),
        });
      }
    } catch (_error) {
      setUser(fallbackUser);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return React.useContext(AuthContext);
}
