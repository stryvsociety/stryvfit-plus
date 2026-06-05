'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform, type MotionValue } from 'framer-motion';

type PricingPlan = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
};

type PricingMode = 'in_person' | 'remote';

const inPersonPlans: PricingPlan[] = [
  {
    name: '4 Sessions',
    price: '$120',
    period: '',
    description: 'A focused two-week training block with flexible scheduling for clients who want to start strong.',
    features: [
      '2 weeks of training',
      '4 in-person sessions',
      'Flexible scheduling',
      'Coach-guided structure',
    ],
    cta: 'Book a Session',
    href: '/book?service=sessions_4',
  },
  {
    name: '8 Sessions',
    price: '$200',
    period: '',
    description: 'A steady monthly rhythm for clients training twice per week with consistent in-person coaching.',
    features: [
      '1 month of training',
      '8 in-person sessions',
      '2x per week training',
      'Progressive session structure',
    ],
    cta: 'Book a Session',
    href: '/book?service=sessions_8',
  },
  {
    name: '12 Sessions',
    price: '$300',
    period: '',
    description: 'The highest-touch in-person package for clients training three times per week.',
    features: [
      '1 month of training',
      '12 in-person sessions',
      '3x per week training',
      'High-accountability coaching',
    ],
    cta: 'Book a Session',
    href: '/book?service=sessions_12',
  },
];

const onlineCoachingPlans: PricingPlan[] = [
  {
    name: 'Starter',
    price: '$100',
    period: '/ month',
    description: 'For clients wanting guidance while training more independently in their own gym or workout space.',
    features: [
      '4 online coaching sessions',
      'Custom weekly workout programming',
      'Exercise breakdowns and guidance',
      'Weekly check-ins',
      'Light nutrition guidance',
      'Form review support via video',
    ],
    cta: 'Start Coaching',
    href: '/book?service=online_coaching_starter',
  },
  {
    name: 'Elevate',
    price: '$180',
    period: '/ month',
    description: 'For clients ready to stay consistent, level up faster, and keep accountability high between sessions.',
    features: [
      '8 online coaching sessions',
      'Custom progressive workout plan',
      'Exercise breakdowns',
      'Weekly accountability check-ins',
      'Form review and feedback',
      'Light nutrition guidance',
      'Priority messaging support',
    ],
    cta: 'Start Coaching',
    href: '/book?service=online_coaching_elevate',
  },
  {
    name: 'Elite',
    price: '$250',
    period: '/ month',
    description: 'Built for clients fully committed to transformation, advanced progression, and elite consistency.',
    features: [
      '12 online coaching sessions',
      'Fully customized training structure',
      'Advanced workout progression tracking',
      'Detailed form review',
      'Weekly accountability coaching',
      'Light nutrition guidance',
      'Priority support and faster response times',
      'Goal and performance tracking',
    ],
    cta: 'Start Coaching',
    href: '/book?service=online_coaching_elite',
  },
];

const pricingModeOrder: PricingMode[] = ['in_person', 'remote'];

const pricingModeContent: Record<
  PricingMode,
  {
    label: string;
    eyebrow: string;
    headline: string;
    body: string;
    plans: PricingPlan[];
  }
> = {
  in_person: {
    label: 'In Person',
    eyebrow: 'Studio Training',
    headline: 'Train face to face.',
    body: 'Hands-on coaching, flexible scheduling, and progressive in-person structure built around your goals.',
    plans: inPersonPlans,
  },
  remote: {
    label: 'Remote Coaching',
    eyebrow: 'Remote Coaching',
    headline: 'Structure from anywhere.',
    body: 'For clients training in their own gym or workout space who still want premium accountability, programming, and feedback.',
    plans: onlineCoachingPlans,
  },
};

export default function PricingSection() {
  const ref = useRef(null);
  const [selectedMode, setSelectedMode] = useState<PricingMode>('in_person');
  const activeMode = pricingModeContent[selectedMode];
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  return (
    <section
      id="pricing"
      ref={ref}
      className="relative min-h-dvh flex flex-col items-center justify-center px-6 py-24 md:py-28"
    >
      <div className="max-w-6xl w-full mx-auto">
        <motion.div
          className="text-center mb-16"
          style={{
            opacity: useTransform(scrollYProgress, [0, 0.1], [0, 1]),
            y: useTransform(scrollYProgress, [0, 0.1], [30, 0]),
          }}
        >
          <p className="font-caption text-[10px] tracking-[0.2em] uppercase text-gold/60 mb-4">
            Find Your Path
          </p>
          <h2 className="font-section text-4xl md:text-6xl tracking-normal text-text leading-[1.02]">
            Choose Your
            <br />
            <span className="text-gold">Experience</span>
          </h2>

          <div
            className="mx-auto mt-8 grid w-full max-w-sm grid-cols-2 overflow-hidden rounded-lg border border-gold/15 bg-bg/40 p-1 shadow-glass"
            aria-label="Choose training format"
          >
            {pricingModeOrder.map((mode) => {
              const selected = selectedMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedMode(mode)}
                  className={`min-h-11 rounded-md px-3 font-accent text-[10px] uppercase tracking-[0.16em] transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 ${
                    selected
                      ? 'bg-gold text-bg shadow-gold-glow'
                      : 'text-text-muted hover:bg-surface-2/70 hover:text-gold'
                  }`}
                >
                  {pricingModeContent[mode].label}
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          className="mx-auto mb-10 max-w-3xl text-center"
          style={{
            opacity: useTransform(scrollYProgress, [0.1, 0.24], [0, 1]),
            y: useTransform(scrollYProgress, [0.1, 0.24], [24, 0]),
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedMode}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="font-caption text-[10px] tracking-[0.2em] uppercase text-gold/60">
                {activeMode.eyebrow}
              </p>
              <h3 className="mt-3 font-section text-3xl leading-none tracking-normal text-text md:text-5xl">
                {activeMode.headline}
              </h3>
              <p className="mx-auto mt-4 max-w-2xl font-body text-sm leading-relaxed text-text-muted">
                {activeMode.body}
              </p>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={selectedMode}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto"
          >
            {activeMode.plans.map((plan, i) => (
              <PlanCard key={`${selectedMode}-${plan.name}`} plan={plan} index={i} scrollYProgress={scrollYProgress} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  index,
  scrollYProgress,
}: {
  plan: PricingPlan;
  index: number;
  scrollYProgress: MotionValue<number>;
}) {
  const opacity = useTransform(scrollYProgress, [0.1 + index * 0.08, 0.25 + index * 0.08], [0, 1]);
  const y = useTransform(scrollYProgress, [0.1 + index * 0.08, 0.25 + index * 0.08], [30, 0]);

  return (
    <motion.div
      className="relative overflow-hidden glass-card"
      style={{ opacity, y }}
    >
      <div className="p-6 md:p-8 flex flex-col h-full">
        <h3 className="font-body text-2xl md:text-3xl font-semibold tracking-normal text-text mb-2">
          {plan.name}
        </h3>

        <div className="flex items-baseline gap-1 mb-3">
          <span className="font-price text-4xl md:text-5xl font-semibold text-gold">
            {plan.price}
          </span>
          {plan.period && (
            <span className="font-price text-text-muted text-sm">
              {plan.period}
            </span>
          )}
        </div>

        <p className="font-body text-text-muted text-sm leading-relaxed mb-6">
          {plan.description}
        </p>

        <p className="font-caption text-[10px] tracking-[0.15em] uppercase text-gold/60 mb-3">
          What&apos;s Included
        </p>
        <ul className="space-y-2 mb-8 flex-1">
          {plan.features.map((f) => (
            <li key={f} className="font-body text-text-muted text-sm flex items-start gap-2">
              <span className="text-gold mt-0.5">-</span>
              {f}
            </li>
          ))}
        </ul>

        <a
          href={plan.href}
          className="block text-center w-full py-3 font-accent text-sm uppercase tracking-[0.18em] rounded-lg transition-all duration-300 glass-button text-gold hover:text-gold-light"
        >
          {plan.cta}
        </a>
      </div>
    </motion.div>
  );
}
