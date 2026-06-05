'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';

const stryvDashItems = [
  { title: 'Smart Booking', desc: 'Book, reschedule, or cancel sessions in seconds. Priority access for premium members.' },
  { title: 'Progress Tracking', desc: 'Monthly reports tracking your body composition, strength gains, and metabolic markers.' },
  { title: 'Coach Integration', desc: 'Direct messaging, form review, and daily check-ins — all in one place.' },
];

export default function WinningSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  return (
    <section
      id="winning"
      ref={ref}
      className="relative min-h-dvh flex flex-col items-center justify-center px-6 py-0"
    >
      <div className="max-w-6xl w-full mx-auto text-center">
        <motion.div
          style={{
            opacity: useTransform(scrollYProgress, [0, 0.15], [0, 1]),
            y: useTransform(scrollYProgress, [0, 0.15], [30, 0]),
          }}
        >
          <p className="font-caption text-[10px] tracking-[0.2em] uppercase text-gold/60 mb-4">
            STRYVDASH
          </p>
          <h2 className="font-section text-4xl md:text-6xl tracking-normal text-text leading-[1.02]">
            From effort,
            <br />
            <span className="text-gold">results.</span>
          </h2>
          <p className="font-body text-text-muted text-sm md:text-base max-w-2xl mx-auto mt-6 leading-relaxed">
            Book sessions, track progress, and train smarter with our custom booking platform
            built for Stryv Society Fitness.
          </p>
        </motion.div>

        {/* StryvDash features with vertical ruler dividers — no glass backgrounds */}
        <div className="flex flex-col md:flex-row items-stretch md:items-start gap-0 mt-16 max-w-5xl mx-auto">
          {stryvDashItems.map((item, i) => (
            <div key={item.title} className="flex-1 flex items-stretch">
              {/* Vertical gold ruler divider between cards */}
              {i > 0 && (
                <div className="hidden md:flex flex-shrink-0 items-center justify-center w-12">
                  <div className="relative h-32 w-[1.5px]">
                    <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-transparent to-gold/25" />
                    <div className="absolute top-8 bottom-8 left-0 right-0 bg-gold/35" />
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-transparent to-gold/25" />
                  </div>
                </div>
              )}

              <WinningItem item={item} index={i} scrollYProgress={scrollYProgress} />
            </div>
          ))}
        </div>

        <motion.div
          className="mt-20 max-w-3xl mx-auto border-t border-gold/10 pt-12"
          style={{
            opacity: useTransform(scrollYProgress, [0.5, 0.65], [0, 1]),
          }}
        >
          <p className="font-body text-text-muted text-sm md:text-base leading-relaxed italic">
            &ldquo;Stryv Society Fitness was founded on one belief: real results come from real work.
            No shortcuts, no gimmicks, no one-size-fits-all plans. Every client who walks through
            the door gets a program tailored to their body, their goals, and their life.&rdquo;
          </p>
        </motion.div>

        <motion.div
          className="mt-12"
          style={{
            opacity: useTransform(scrollYProgress, [0.6, 0.75], [0, 1]),
          }}
        >
          <a
            href="/book"
            className="inline-flex items-center px-10 py-4 bg-gold text-bg font-accent text-sm
                       uppercase tracking-[0.18em] transition-all duration-300 hover:bg-gold/90
                       rounded-lg shadow-gold-glow"
          >
            Claim Your Free Session
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function WinningItem({
  item,
  index,
  scrollYProgress,
}: {
  item: (typeof stryvDashItems)[0];
  index: number;
  scrollYProgress: MotionValue<number>;
}) {
  const opacity = useTransform(scrollYProgress, [0.2 + index * 0.08, 0.35 + index * 0.08], [0, 1]);
  const y = useTransform(scrollYProgress, [0.2 + index * 0.08, 0.35 + index * 0.08], [20, 0]);

  return (
    <motion.div className="flex-1 mx-0 md:mx-2 text-left" style={{ opacity, y }}>
      <div className="w-8 h-[1px] bg-gold/50 mb-4" />
      <h3 className="font-section text-lg md:text-xl tracking-normal text-text mb-3">
        {item.title}
      </h3>
      <p className="font-body text-text-muted text-sm leading-relaxed">
        {item.desc}
      </p>
    </motion.div>
  );
}
