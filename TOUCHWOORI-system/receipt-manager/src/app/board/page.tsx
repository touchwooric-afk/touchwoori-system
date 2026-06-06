import AppShell from '@/components/layout/AppShell';
import BoardHeader from '@/components/board/BoardHeader';
import PostList from '@/components/board/PostList';

export default function BoardPage() {
  return <AppShell><div className="space-y-5"><BoardHeader /><PostList /></div></AppShell>;
}
