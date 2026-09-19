import { UpgradeBanner } from '@/components/upgrade-banner';
import { AppNav } from '@/components/app-nav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black">
      <AppNav />
      <UpgradeBanner />
      {children}
    </div>
  );
}
