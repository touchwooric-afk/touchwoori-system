'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase';
import type { User } from '@/types';

interface UserContextType {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      setUser(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    setUser(data as User | null);
    setLoading(false);
  };

  useEffect(() => {
    fetchUser();

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, refresh: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
