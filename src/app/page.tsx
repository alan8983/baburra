import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

export default function Home() {
  // 首頁重導向到 Dashboard
  redirect(ROUTES.DASHBOARD);
}
