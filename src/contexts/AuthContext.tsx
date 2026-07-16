import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types/types';
import { toast } from 'sonner';

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('โหลดโปรไฟล์ไม่สำเร็จ:', error);
    return null;
  }
  return data as Profile | null;
}

async function loadPermissions(userId: string): Promise<string[]> {
  try {
    const { data } = await supabase.rpc('get_user_permissions', { p_user_id: userId });
    return Array.isArray(data) ? data.map((r: { permission: string }) => r.permission) : [];
  } catch {
    return [];
  }
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  permissions: string[];
  loading: boolean;
  hasPermission: (key: string) => boolean;
  signInWithUsername: (username: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (userId: string) => {
    const [profileData, perms] = await Promise.all([
      getProfile(userId),
      loadPermissions(userId),
    ]);
    setProfile(profileData);
    setPermissions(perms);
  }, []);

  const refreshProfile = async () => {
    if (!user) { setProfile(null); setPermissions([]); return; }
    await loadUserData(user.id);
  };

  useEffect(() => {
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadUserData(session.user.id);
        }
      })
      .catch(error => toast.error(`โหลดเซสชันไม่สำเร็จ: ${error.message}`))
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadUserData(session.user.id);
      } else {
        setProfile(null);
        setPermissions([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserData]);

  const hasPermission = useCallback((key: string): boolean => {
    // super_admin and admin always have all permissions
    if (profile?.system_role === 'super_admin' || profile?.system_role === 'admin') return true;
    return permissions.includes(key);
  }, [profile, permissions]);

  const signInWithUsername = async (username: string, password: string) => {
    try {
      const email = `${username.toLowerCase()}@gta-fivem.local`;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setPermissions([]);
  };

  return (
    <AuthContext.Provider value={{ user, profile, permissions, loading, hasPermission, signInWithUsername, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
