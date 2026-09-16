'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Deployment Training + Quiz — pass the quiz, win a discount code.
 * Teaches users to actually launch their app (fewer support headaches),
 * and converts them to paid with a reward. One reward per user.
 */

const LESSON = [
  {
    title: '1. Where your app lives',
    body: 'BoDiGi 2.0 builds your app and shows it as a live preview inside the platform. Nothing is on the real internet until YOU deploy it. To deploy: download your code (ZIP or GitHub export), then import it into a hosting platform like Vercel.',
  },
  {
    title: '2. The three accounts you need',
    body: 'GitHub stores your code (github.com). Vercel runs your app on the internet (vercel.com). Supabase is your database (supabase.com). All three have free tiers — you can launch without paying anything to them.',
  },
  {
    title: '3. Deploying step by step',
    body: 'Push your code to GitHub → go to vercel.com → "Add New Project" → import your repo → Vercel reads your settings automatically → click "Deploy". Your app gets a live URL in about a minute. Connect a custom domain later in Vercel → Settings → Domains.',
  },
  {
    title: '4. Environment variables (the #1 gotcha)',
    body: 'Your app needs its API keys to run — but keys never travel with the code. After importing to Vercel, add each key in Vercel → Settings → Environment Variables. The Launch Guide doc in your build lists every key and exactly where to find it.',
  },
  {
    title: '5. Test before you celebrate',
    body: 'Open your live URL on your phone. Sign up with a test account. If your app takes payments, use Stripe test card 4242 4242 4242 4242. Only share the URL after signup, login, and your core feature all work.',
  },
];

const QUIZ = [
  {
    q: 'After BoDiGi builds your app, where is it live on the internet?',
    options: [
      'On my own domain immediately',
      'Inside BoDiGi as a preview — I deploy it myself to make it live',
      'On BoDiGi\'s servers forever',
    ],
    answer: 1,
  },
  {
    q: 'Which platform actually RUNS your app on the internet?',
    options: ['GitHub', 'Supabase', 'Vercel'],
    answer: 2,
  },
  {
    q: 'What must you add in Vercel after importing your code?',
    options: [
      'Environment variables (your API keys)',
      'A new logo',
      'Nothing — it works automatically',
    ],
    answer: 0,
  },
  {
    q: 'What card do you use to test payments safely?',
    options: ['Your real debit card', '4242 4242 4242 4242', 'A gift card'],
    answer: 1,
  },
];

export default function TrainingPage() {
  const [step, setStep] = useState<'lesson' | 'quiz' | 'passed' | 'failed'>('lesson');
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const answer = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    const correct = idx === QUIZ[currentQ].answer;
    if (correct) setScore((s) => s + 1);

    setTimeout(() => {
      setSelected(null);
      if (currentQ + 1 < QUIZ.length) {
        setCurrentQ((q) => q + 1);
      } else {
        // Pass = 3 of 4 or better
        const finalScore = score + (correct ? 1 : 0);
        setStep(finalScore >= 3 ? 'passed' : 'failed');
      }
    }, 900);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Deployment Training</h1>
          <p className="text-slate-400 mt-2">
            5-minute training. Pass the 4-question quiz and win a discount on your plan.
          </p>
        </div>

        {step === 'lesson' && (
          <div className="space-y-4">
            {LESSON.map((section) => (
              <div key={section.title} className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                <h2 className="text-white font-semibold mb-2">{section.title}</h2>
                <p className="text-slate-300 text-sm leading-relaxed">{section.body}</p>
              </div>
            ))}
            <button
              onClick={() => setStep('quiz')}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-500 hover:to-pink-500 transition"
            >
              I&apos;m ready — start the quiz
            </button>
          </div>
        )}

        {step === 'quiz' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
            <div className="text-xs text-slate-500 mb-4">
              Question {currentQ + 1} of {QUIZ.length}
            </div>
            <h2 className="text-white font-semibold mb-4">{QUIZ[currentQ].q}</h2>
            <div className="space-y-2.5">
              {QUIZ[currentQ].options.map((opt, idx) => {
                const isCorrect = selected !== null && idx === QUIZ[currentQ].answer;
                const isWrongPick = selected === idx && idx !== QUIZ[currentQ].answer;
                return (
                  <button
                    key={idx}
                    onClick={() => answer(idx)}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition ${
                      isCorrect
                        ? 'bg-green-500/10 border-green-500/40 text-green-400'
                        : isWrongPick
                        ? 'bg-red-500/10 border-red-500/40 text-red-400'
                        : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-purple-500/50'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 'passed' && (
          <div className="bg-slate-900/50 border border-green-500/30 rounded-2xl p-8 text-center space-y-4">
            <div className="text-4xl">🏆</div>
            <h2 className="text-2xl font-bold text-white">You passed!</h2>
            <p className="text-slate-300 text-sm">
              You know how to deploy your app. Here&apos;s your reward — use it at checkout. One discount per checkout.
            </p>
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/40 rounded-xl p-4">
              <div className="text-xs text-slate-400 uppercase tracking-wide">Your discount code</div>
              <div className="text-2xl font-mono font-bold text-white mt-1">DEPLOY5</div>
              <div className="text-xs text-slate-400 mt-1">$5 off Starter or $10 off Pro — your choice at checkout</div>
            </div>
            <Link
              href="/pricing"
              className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-500 hover:to-pink-500 transition"
            >
              Use my discount →
            </Link>
          </div>
        )}

        {step === 'failed' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
            <div className="text-4xl">📖</div>
            <h2 className="text-2xl font-bold text-white">Almost — read the training once more</h2>
            <p className="text-slate-400 text-sm">You need 3 of 4 correct. The lesson is right above — the answers are all in it.</p>
            <button
              onClick={() => { setStep('lesson'); setCurrentQ(0); setScore(0); }}
              className="px-6 py-3 bg-slate-800 border border-slate-700 text-white font-semibold rounded-xl hover:bg-slate-700 transition"
            >
              Back to the training
            </button>
          </div>
        )}

        <p className="text-center mt-6">
          <Link href="/pricing" className="text-xs text-slate-500 hover:text-slate-300 transition">
            ← Back to pricing
          </Link>
        </p>
      </div>
    </div>
  );
}
