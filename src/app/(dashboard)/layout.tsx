import { UpgradeBanner } from '@/components/upgrade-banner';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black">
      <UpgradeBanner />
      {children}
    </div>
  );
}
