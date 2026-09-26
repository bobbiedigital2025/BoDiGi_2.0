'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, Zap, Crown, Building2, ArrowRight } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  price: number;
  icon: React.ReactNode;
  color: string;
  description: string;
  features: string[];
  cta: string;
  popular?: boolean;
}

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    icon: <Sparkles className="w-6 h-6" />,
    color: 'from-gray-500 to-gray-600',
    description: 'Starts with 3 days of Pro free',
    features: [
      '1 AI-generated app per month',
      'Hosted preview inside BoDiGi 2.0',
      'README + Investor Pitch + Reality Check docs',
      '7-day preview access',
      'Community support',
    ],
    cta: 'Current Plan',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 19,
    icon: <Zap className="w-6 h-6" />,
    color: 'from-blue-500 to-cyan-500',
    description: 'Own your code',
    features: [
      '5 AI-generated apps per month',
      'Full source code export (ZIP)',
      'Backend included',
      '30-day previews',
      'Email support',
      'No branding',
    ],
    cta: 'Upgrade to Starter',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    icon: <Crown className="w-6 h-6" />,
    color: 'from-violet-500 to-fuchsia-500',
    description: 'For serious builders',
    features: [
      'Unlimited AI-generated apps',
      'GitHub export',
      'Preview never expires — your apps stay live',
      'Deploy-ready code — connect your own domain',
      'Launch Marketing Kit — brand voice, social posts, emails, 30-day plan',
      'Priority AI pipeline',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 199,
    icon: <Building2 className="w-6 h-6" />,
    color: 'from-amber-500 to-orange-500',
    description: 'For teams and agencies',
    features: [
      'Everything in Pro',
      'Dedicated infrastructure',
      'SLA guarantee',
      'Custom AI models',
      'White label',
      'Phone support',
    ],
    cta: 'Contact Sales',
  },
];

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);
  const [promo, setPromo] = useState('');

  const handleUpgrade = async (tierId: string) => {
    if (tierId === 'free') return;

    if (tierId === 'enterprise') {
      // Enterprise goes to contact sales — for now, open Stripe too
      // Can be changed to a contact form later
    }

    setLoading(tierId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: tierId, ...(promo.trim() ? { promoCode: promo.trim() } : {}) }),
      });

      const data = await res.json();

      if (res.status === 401) {
        window.location.href = '/login?redirect=/pricing';
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to start checkout. Please try again.');
        setLoading(null);
      }
    } catch {
      alert('Something went wrong. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h1 className="font-semibold">BoDiGi 2.0 Pricing</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            Back
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Simple, Transparent Pricing
          </h2>
          <p className="text-white/60 max-w-xl mx-auto mb-4">
            Start free. Upgrade when you're ready to own your apps.
            Every plan includes our AI agent team that builds your app from a single prompt.
          </p>

          {/* Promo code + training quiz */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <input
              type="text"
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder="Promo code (optional)"
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/50 uppercase"
            />
            <a
              href="/training"
              className="text-xs text-fuchsia-400 hover:text-fuchsia-300 transition underline underline-offset-2"
            >
              🏆 Take deployment training — pass the quiz, win $5–$10 off
            </a>
          </div>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-3 bg-white/5 rounded-full p-1">
            <button
              className={`px-4 py-2 rounded-full text-sm transition ${billingPeriod === 'monthly' ? 'bg-white/10 text-white' : 'text-white/40'}`}
              onClick={() => setBillingPeriod('monthly')}
            >
              Monthly
            </button>
            <button
              className={`px-4 py-2 rounded-full text-sm transition ${billingPeriod === 'yearly' ? 'bg-white/10 text-white' : 'text-white/40'}`}
              onClick={() => setBillingPeriod('yearly')}
            >
              Yearly <Badge variant="success" className="ml-1">Save 20%</Badge>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const yearlyPrice = Math.round(plan.price * 0.8);
            const displayPrice = billingPeriod === 'yearly' ? yearlyPrice : plan.price;

            return (
              <Card
                key={plan.id}
                className={`relative ${plan.popular ? 'border-violet-500/50 ring-1 ring-violet-500/20' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="success" className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white border-0">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mx-auto mb-3`}>
                    {plan.icon}
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <p className="text-sm text-white/40">{plan.description}</p>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="mb-6">
                    <span className="text-4xl font-bold">${displayPrice}</span>
                    <span className="text-white/40 text-sm">/month</span>
                    {billingPeriod === 'yearly' && plan.price > 0 && (
                      <p className="text-xs text-green-400 mt-1">
                        ${displayPrice * 12}/year (save ${(plan.price - yearlyPrice) * 12})
                      </p>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 text-left">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                        <span className="text-white/70">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={plan.popular ? 'gradient' : 'outline'}
                    className="w-full"
                    disabled={plan.id === 'free' || loading === plan.id}
                    onClick={() => handleUpgrade(plan.id)}
                  >
                    {loading === plan.id ? 'Redirecting to checkout...' : plan.cta} {plan.id !== 'free' && loading !== plan.id && <ArrowRight className="w-3 h-3 ml-1" />}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-8">Common Questions</h3>
          <div className="space-y-4">
            {[
              {
                q: 'What happens when my free preview expires?',
                a: 'Your app stays live for 7 days on the free tier. After that, it goes offline. Upgrade to any paid plan to keep it permanently and get the source code.',
              },
              {
                q: 'Can I export my code on the free tier?',
                a: 'No — the free tier is a preview. You can see your app working, but the source code is only available on paid plans. This keeps the platform sustainable.',
              },
              {
                q: 'What API keys do I need?',
                a: 'None to start. Every new account gets 3 days of Pro free, and your first app runs in our Zero-Key sandbox — it works the moment it deploys, no signups anywhere else. When you\'re ready to go live for real, our Setup Guide walks you through adding your own keys step by step.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. Cancel anytime from your dashboard. You keep access until the end of your billing period. No questions asked.',
              },
            ].map((faq, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <h4 className="font-medium mb-2">{faq.q}</h4>
                  <p className="text-sm text-white/50">{faq.a}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
