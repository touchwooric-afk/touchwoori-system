'use client';

export const runtime = 'edge';


import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SubmitRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/receipts/upload'); }, [router]);
  return null;
}
