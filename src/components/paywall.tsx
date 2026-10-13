'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, ArrowRight, Download, GitBranch, Globe, Clock } from 'lucide-react';
import { TierBadge } from './tier-badge';

interface PaywallProps {
  feature: 'export' | 'backend' | 'custom_domain' | 'download';
  currentTier: string;
  previewExpiresAt?: string;
  projectName?: string;
}

const featureInfo: Record<string, { title: string; description: string; icon: React.ReactNode }> = {
  export: {
    title: 'Source Code Export',
    description: 'Download the full source code of your generated app as a ZIP file, including all documentation and configuration files.',
    icon: <Download className="w-8 h-8" />,
  },
  backend: {
    title: 'Backend Access',
    description: 'Full backend source code including API routes, database schema, authentication, and server logic.',
    icon: <GitBranch className="w-8 h-8" />,
  },
  custom_domain: {
    title: 'Custom Domain',
    description: 'Point your own domain to your generated app. Available on Pro and Enterprise plans.',
    icon: <Globe className="w-8 h-8" />,
  },
  download: {
    title: 'Download Project',
    description: 'Download all generated files, documentation, and configuration. Upgrade to unlock this feature.',
    icon: <Download className="w-8 h-8" />,
  },
};

export function Paywall({ feature, currentTier, previewExpiresAt, projectName }: PaywallProps) {
  const info = featureInfo[feature] || featureInfo.export;
  const isFreeTier = currentTier === 'free';
  // Anchor "now" once at mount — calling Date.now() during render is
  // impure and trips the React compiler lint.
  const [now] = useState(() => Date.now());

  const daysLeft = previewExpiresAt
    ? Math.max(0, Math.ceil((new Date(previewExpiresAt).getTime() - now) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5">
      <CardContent className="p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-4 text-violet-400">
          <Lock className="w-8 h-8" />
        </div>

        <h3 className="text-xl font-bold mb-2">{info.title}</h3>
        <p className="text-white/50 text-sm mb-4 max-w-sm mx-auto">{info.description}</p>

        {isFreeTier && daysLeft !== null && (
          <div className="flex items-center justify-center gap-2 mb-4 text-orange-400 text-sm">
            <Clock className="w-4 h-4" />
            <span>
              {daysLeft > 0
                ? `Preview expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                : 'Preview has expired'}
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="text-sm text-white/40">Your plan:</span>
          <TierBadge tier={currentTier} />
        </div>

        <div className="space-y-2">
          <Button
            variant="gradient"
            className="w-full"
            onClick={() => window.location.href = '/pricing'}
          >
            Upgrade to Unlock <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
          <p className="text-xs text-white/30">
            Starting at $19.99/month — cancel anytime
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
