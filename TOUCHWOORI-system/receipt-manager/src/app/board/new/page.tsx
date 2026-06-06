import AppShell from '@/components/layout/AppShell';
import BoardHeader from '@/components/board/BoardHeader';
import PostForm from '@/components/board/PostForm';

export default function NewBoardPostPage() {
  return <AppShell><div className="space-y-5"><BoardHeader /><PostForm /></div></AppShell>;
}
