'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';

const methods = [
  {
    title: 'Elite Training, Built from the Ground Up',
    subtitle: 'THE METHOD',
    body: "Most trainers follow trends. We follow the science of movement, progressive overload, and recovery. Whether you are prepping for competition, building functional strength, or reclaiming your health after years of neglect — your program is built for you, not for a template.",
  },
  {
    title: '1-on-1 Personal Training',
    subtitle: 'FOCUSED SESSIONS',
    body: 'Full 60-minute session focused on your goals. Customized programming, hands-on form coaching, and progressive overload. All fitness levels welcome. Your first session is on us.',
  },
];

export default function MethodSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  return (
    <section
      id="method"
      ref={ref}
      className="relative min-h-dvh flex flex-col items-center justify-center px-6 py-0"
    >
      <div className="max-w-6xl w-full mx-auto">
        {/* Section heading */}
        <motion.div
          className="text-center mb-16"
          style={{
            opacity: useTransform(scrollYProgress, [0, 0.1], [0, 1]),
            y: useTransform(scrollYProgress, [0, 0.1], [30, 0]),
          }}
        >
          <p className="font-caption text-[10px] tracking-[0.2em] uppercase text-gold/60 mb-4">
            How We Train
          </p>
          <h2 className="font-section text-3xl md:text-5xl tracking-normal text-text leading-[1.02]">
            Train With Intention.
            <br />
            <span className="text-gold">Build With Purpose.</span>
          </h2>
          <p className="font-body text-text-muted text-sm md:text-base max-w-xl mx-auto mt-6 leading-relaxed">
            Every session is designed around your goals, your body, and your schedule.
            No cookie-cutter programs. No wasted reps.
          </p>
        </motion.div>

        {/* Method cards with vertical ruler dividers — no glass backgrounds */}
        <div className="flex flex-col md:flex-row items-stretch md:items-start gap-0">
          {methods.map((method, i) => (
            <div key={method.title} className="flex-1 flex items-stretch">
              {/* Vertical gold ruler divider between cards */}
              {i > 0 && (
                <div className="hidden md:flex flex-shrink-0 items-center justify-center w-12">
                  <div className="relative h-48 w-[1.5px]">
                    <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-gold/25" />
                    <div className="absolute top-10 bottom-10 left-0 right-0 bg-gold/35" />
                    <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-transparent to-gold/25" />
                  </div>
                </div>
              )}

              <MethodCard method={method} index={i} scrollYProgress={scrollYProgress} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MethodCard({
  method,
  index,
  scrollYProgress,
}: {
  method: (typeof methods)[0];
  index: number;
  scrollYProgress: MotionValue<number>;
}) {
  const opacity = useTransform(scrollYProgress, [0.1 + index * 0.08, 0.25 + index * 0.08], [0, 1]);
  const y = useTransform(scrollYProgress, [0.1 + index * 0.08, 0.25 + index * 0.08], [30, 0]);

  return (
    <motion.div className="flex-1 mx-0 md:mx-2" style={{ opacity, y }}>
      <p className="font-caption text-[10px] tracking-[0.2em] uppercase text-gold/60 mb-4">
        {method.subtitle}
      </p>
      <h3 className="font-section text-xl md:text-2xl tracking-normal text-text mb-4">
        {method.title}
      </h3>
      <p className="font-body text-text-muted text-sm leading-relaxed">
        {method.body}
      </p>
    </motion.div>
  );
}
