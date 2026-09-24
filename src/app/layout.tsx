import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { FlashSale } from "@/components/flash-sale";
import { AppNav } from "@/components/app-nav";
import { SupportChat } from "@/components/support-chat";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://bodigi2.com";
const TITLE = "BoDiGi 2.0 — AI Builds Your App AND Your Business Plan";
const DESCRIPTION =
  "Describe your idea in one sentence. Nine AI agents build your full app — frontend, backend, tests, docs — plus an investor pitch, honest reality check, and marketing kit. Deploys to YOUR Vercel. Your code, your keys, no lock-in.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — BoDiGi 2.0",
  },
  description: DESCRIPTION,
  keywords: [
    "AI app builder",
    "no-code app builder",
    "AI app generator",
    "build app without code",
    "AI agents build apps",
    "Lovable alternative",
    "Base44 alternative",
    "own your code app builder",
    "no vendor lock-in",
    "investor pitch generator",
    "startup idea validation",
    "AI business builder",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "BoDiGi 2.0",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  category: "technology",
};

// JSON-LD structured data — the AEO/GEO fuel. This is what answer engines
// and LLM crawlers read when deciding how to describe us.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "BoDiGi 2.0",
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: "Starter", price: "19", priceCurrency: "USD" },
        { "@type": "Offer", name: "Pro", price: "49", priceCurrency: "USD" },
        { "@type": "Offer", name: "Enterprise", price: "199", priceCurrency: "USD" },
      ],
      featureList:
        "AI app generation from a single prompt, 9-agent build pipeline, investor one-pager, honest reality-check report, marketing kit, one-click deploy to user's own Vercel account, full source-code export, AI chat-to-edit modifications",
    },
    {
      "@type": "Organization",
      name: "Bobbie Digital",
      url: SITE_URL,
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is BoDiGi 2.0?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "BoDiGi 2.0 is an AI app factory: describe your idea in one sentence and nine specialized AI agents build a complete, working application — frontend, backend, database, tests, compliance checks, and documentation — plus an investor one-pager, an honest reality-check report, and a 30-day marketing kit.",
          },
        },
        {
          "@type": "Question",
          name: "How is BoDiGi different from Lovable, Bolt, or Base44?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Ownership. BoDiGi deploys your app to your own Vercel account, exports your full source code, and runs on your own API keys. Cancel anytime and keep everything — your app keeps running. Every build also includes an honest reality-check document that names your idea's weaknesses, with one-click AI fixes.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need to know how to code?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. BoDiGi is built for founders, not developers. One plain-English prompt produces a working app you can preview the same day, with a step-by-step launch guide written for non-technical users.",
          },
        },
        {
          "@type": "Question",
          name: "What does BoDiGi cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Free tier: build a real app with a 7-day live preview, no card required. Starter ($19/mo): export your code and keep previews 30 days. Pro ($49/mo): unlimited apps, one-click deploy to your own Vercel, AI chat-to-edit, and the full marketing kit. Enterprise ($199/mo): everything unlimited plus phone support.",
          },
        },
        {
          "@type": "Question",
          name: "Who owns the app BoDiGi builds?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You do — completely. Download the ZIP, push to your own GitHub, deploy to your own Vercel account. Your code, your hosting, your keys. There is no lock-in and no ransom: cancel your subscription and everything you built keeps working.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <FlashSale />
          <AppNav />
          {children}
          <SupportChat />
        </AuthProvider>
      </body>
    </html>
  );
}
