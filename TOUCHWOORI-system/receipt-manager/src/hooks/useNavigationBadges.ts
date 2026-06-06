'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import type { User } from '@/types';

interface NavigationBadges {
  pendingReceipts: number;
  pendingUsers: number;
  rejectedReceipts: number;
}

const EMPTY_BADGES: NavigationBadges = {
  pendingReceipts: 0,
  pendingUsers: 0,
  rejectedReceipts: 0,
};

let badgeCache: { userId: string; expiresAt: number; value: NavigationBadges } | null = null;

export function useNavigationBadges(user: User | null) {
  const [badges, setBadges] = useState(EMPTY_BADGES);

  useEffect(() => {
    if (!user) {
      setBadges(EMPTY_BADGES);
      return;
    }

    if (badgeCache?.userId === user.id && badgeCache.expiresAt > Date.now()) {
      setBadges(badgeCache.value);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    const loadBadges = async () => {
      const pendingReceiptsQuery = user.role === 'master' || user.role === 'accountant'
        ? supabase
            .from('receipts')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
        : null;
      if (pendingReceiptsQuery && user.role === 'accountant') {
        pendingReceiptsQuery.eq('department_id', user.department_id);
      }

      const pendingUsersQuery = user.role === 'master' || user.role === 'sub_master'
        ? supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
        : null;

      const rejectedReceiptsQuery = supabase
        .from('receipts')
        .select('id', { count: 'exact', head: true })
        .eq('submitted_by', user.id)
        .eq('status', 'rejected');

      const [pendingReceipts, pendingUsers, rejectedReceipts] = await Promise.all([
        pendingReceiptsQuery,
        pendingUsersQuery,
        rejectedReceiptsQuery,
      ]);

      const value = {
        pendingReceipts: pendingReceipts?.count ?? 0,
        pendingUsers: pendingUsers?.count ?? 0,
        rejectedReceipts: rejectedReceipts.count ?? 0,
      };
      badgeCache = { userId: user.id, expiresAt: Date.now() + 30_000, value };
      if (!cancelled) setBadges(value);
    };

    void loadBadges();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return badges;
}
