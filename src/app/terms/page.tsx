import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — BoDiGi 2.0',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-white mb-8">Terms of Service</h1>
        <div className="prose prose-invert prose-slate max-w-none space-y-6 text-sm leading-relaxed">
          <p className="text-slate-400">Last updated: October 11, 2026</p>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>By creating an account or using BoDiGi 2.0 (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
            <p>BoDiGi 2.0 is an AI-powered platform that generates application code from user-provided ideas. The Service uses AI agent teams to produce frontend, backend, database, testing, deployment, and documentation artifacts. Related features include: Plan Mode (guided idea interview), Modify Pass (natural-language edits to generated apps), one-click deployment to your own hosting account, GitHub export, Ad Studio (pay-per-video AI avatar advertisements), a template marketplace, and Build Memory (the platform learns generalized rules from builds and edits to improve future generations).</p>
          </section>

          <section className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-5">
            <h2 className="text-xl font-semibold text-amber-300 mb-3">3. No Guarantee of Business Success</h2>
            <p className="text-amber-100/80"><strong>Please read this carefully.</strong> BoDiGi 2.0 gives you a head start — not a business. Using the Service does <strong>not</strong> guarantee that your application will succeed, generate revenue, attract users, or become a functioning business. Building a successful business requires substantial work on your end: marketing, sales, customer support, legal compliance, operations, and persistence. Most new businesses require significant time and effort before becoming viable, and many do not succeed at all. We build your starting point — the app, the documents, and the launch tools. What you build on top of that foundation is up to you. Any earnings or success examples referenced in our materials are illustrative only and are not a promise of results.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. User Accounts</h2>
            <p>You are responsible for maintaining the security of your account and password. You must provide a valid email address. You are fully responsible for all activity that occurs under your account.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Subscriptions, Billing & Cancellation</h2>
            <p>Paid plans (Starter, Pro, Enterprise) are billed monthly through Stripe. Subscriptions renew automatically until cancelled. You may cancel anytime — cancellation takes effect at the end of the current billing period, and you keep access until then. Payments are non-refundable except where required by law. Preview expiry varies by tier: Free previews expire after 7 days, Starter after 30 days, and Pro/Enterprise previews do not expire while the subscription is active.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Promotional Codes & Discounts</h2>
            <p>From time to time we offer promotional codes (for example, flash-sale codes or codes earned through the training quiz). Promo codes: (a) are limited to one per customer unless stated otherwise; (b) cannot be combined or stacked with other discounts; (c) expire on their stated date; (d) have no cash value and cannot be redeemed retroactively; (e) may be limited to a maximum number of redemptions; and (f) may be modified or withdrawn at any time. Discounts apply at checkout only and do not alter the underlying subscription price on renewal unless the code explicitly states a recurring discount.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Fair Use</h2>
            <p>&ldquo;Unlimited&rdquo; plans are subject to fair use. We reserve the right to rate-limit, queue, or throttle builds and AI features for accounts whose usage substantially exceeds normal patterns (for example, automated bulk generation or usage that degrades the Service for others). Normal entrepreneurial use will never hit these limits.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. User Content</h2>
            <p>You retain ownership of any ideas, prompts, or content you submit to the Service. By submitting content, you grant BoDiGi 2.0 a license to process it through AI agents for the purpose of generating application code for you.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Generated Content & Build Memory</h2>
            <p>Code and artifacts generated by BoDiGi 2.0 are provided for your use. You are responsible for reviewing, testing, and deploying generated code. BoDiGi 2.0 does not guarantee that generated code will be free of errors, security vulnerabilities, or other defects. The Service maintains a Build Memory: generalized, non-personal rules learned from builds and edits (for example, &ldquo;auth pages should include a sign-up toggle&rdquo;). These rules contain no user data, project content, or personal information, and are used to improve generation quality for everyone.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Modify Pass & AI-Applied Edits</h2>
            <p>Modify Pass lets you request changes to generated apps in plain language. AI-applied edits are snapshotted before application and can be reviewed in your project history. You are responsible for reviewing edits before relying on them. Modify Pass cannot change authentication, payment, or database schema files.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Deployment, Export & Third-Party Accounts</h2>
            <p>When you deploy through BoDiGi 2.0, the app is deployed to <strong>your own</strong> hosting account (for example, your Vercel account) under your control. You may revoke our access at any time. Exported code (ZIP or GitHub) is yours to keep forever, deploys anywhere, and remains yours even after cancellation. Third-party services (hosting, database, AI providers, payment processors) are governed by their own terms and billed by those providers — you are responsible for those accounts and their costs.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Ad Studio & Pay-Per-Video Purchases</h2>
            <p>Ad Studio offers one-time purchases of AI-generated video advertisements (for example, 30-second and 1&ndash;2 minute renders). Each purchase covers one render and is charged at checkout; rendering begins only after payment clears. Video purchases are non-refundable once rendering has started. AI-generated videos may contain synthetic avatars and voices; some platforms require you to label AI-generated content when you publish, and you are responsible for complying with those rules and with applicable advertising and endorsement laws. AI avatars may not be presented as real customers giving genuine testimonials.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">13. Acceptable Use</h2>
            <p>You agree not to use the Service to: (a) generate malicious, illegal, or harmful software; (b) infringe on intellectual property rights; (c) spam or abuse the platform; (d) attempt to disrupt or compromise the Service; (e) create deceptive advertising, fake testimonials, or misleading AI-generated endorsements.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">14. AI Disclaimer</h2>
            <p>BoDiGi 2.0 uses artificial intelligence to generate code, documents, and video. AI-generated content may contain errors, biases, or unexpected behavior. You are responsible for verifying the safety, legality, and functionality of all generated output before using or publishing it.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">15. Limitation of Liability</h2>
            <p>BoDiGi 2.0 is provided &ldquo;as is&rdquo; without warranties of any kind. We are not liable for any damages arising from the use of generated code, documents, or video, including data loss, security issues, lost profits, or business losses — including losses arising from a business venture built with the Service that does not succeed.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">16. Changes to Terms</h2>
            <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">17. Contact</h2>
            <p>For questions about these Terms, contact us at <a href="mailto:support@bobbie.digital" className="text-purple-400 hover:text-purple-300">support@bobbie.digital</a>.</p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800">
          <Link href="/signup" className="text-purple-400 hover:text-purple-300 transition text-sm">
            ← Back to sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
