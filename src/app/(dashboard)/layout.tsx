import { UpgradeBanner } from '@/components/upgrade-banner';
import StardustBackground from '@/components/stardust';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        <StardustBackground />
      </div>
      <div className="relative z-10">
        <UpgradeBanner />
        {children}
      </div>
    </div>
  );
}
