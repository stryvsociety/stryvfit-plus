'use client';

import { motion, useScroll, useTransform } from 'framer-motion';

export default function HeroSection({ animateIn }: { animateIn: boolean }) {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);
  const scale = useTransform(scrollY, [0, 400], [1, 0.95]);
  const imgParallax = useTransform(scrollY, [0, 300], [0, 40]);

  return (
    <section
      id="hero"
      className="relative min-h-dvh overflow-hidden bg-bg"
    >
      <div className="absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(7,14,19,0.98)_0%,rgba(7,14,19,0.9)_58%,rgba(7,14,19,0.48)_100%)] md:bg-[linear-gradient(90deg,rgba(7,14,19,0.98)_0%,rgba(7,14,19,0.9)_37%,rgba(7,14,19,0.22)_72%,rgba(7,14,19,0.72)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 z-10 h-44 bg-gradient-to-t from-bg to-transparent" />

      <div className="absolute inset-0 z-0 overflow-hidden">
        <motion.img
          src="/images/hero-training.jpg"
          alt="Stryv Society athlete training in the gym"
          className="h-full w-full object-cover object-[58%_42%] md:object-[72%_44%]"
          style={{ y: imgParallax }}
          draggable={false}
        />
      </div>

      <motion.div
        className="relative z-20 mx-auto flex min-h-dvh max-w-6xl flex-col justify-center px-6 pb-14 pt-20 text-left sm:pb-16 md:pt-24"
        style={{ opacity, scale }}
      >
        <h1
          aria-label="Results you can see. Training you can feel."
          className="font-section max-w-[20.5rem] text-[2.52rem] uppercase leading-[0.94] tracking-normal text-text sm:max-w-[42rem] sm:text-[3.45rem] md:max-w-[52rem] md:text-[4.35rem] lg:max-w-[58rem] lg:text-[4.85rem] xl:text-[5.08rem]"
        >
          <motion.span
            className="block"
            aria-hidden="true"
            initial={{ opacity: 0, y: 40 }}
            animate={animateIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="block sm:hidden">
              Results you
              <br />
              can see.
            </span>
            <span className="hidden sm:block">Results you can see.</span>
          </motion.span>
          <motion.span
            className="block text-gold"
            aria-hidden="true"
            initial={{ opacity: 0, y: 40 }}
            animate={animateIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="block sm:hidden">
              Training you
              <br />
              can feel.
            </span>
            <span className="hidden sm:block">Training you can feel.</span>
          </motion.span>
        </h1>

        <motion.p
          className="mt-6 max-w-[20rem] font-accent text-[0.72rem] uppercase tracking-[0.16em] text-text-muted sm:max-w-none sm:text-sm md:text-base md:tracking-[0.18em]"
          initial={{ opacity: 0, y: 10 }}
          animate={animateIn ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          Train With Intention. Build With Purpose.
        </motion.p>

        <motion.p
          className="mt-5 max-w-[21rem] font-body text-sm leading-relaxed text-text-muted sm:mt-6 sm:max-w-xl md:text-base"
          initial={{ opacity: 0, y: 10 }}
          animate={animateIn ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          Every session is designed around your goals, your body, and your schedule.
          No cookie-cutter programs. No wasted reps. Just focused, expert-guided training
          that gets you where you want to be, faster.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 mt-10"
          initial={{ opacity: 0, y: 10 }}
          animate={animateIn ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 1.1 }}
        >
          <a
            href="/book"
            className="inline-flex w-full max-w-[22rem] items-center justify-center px-6 py-4 bg-gold text-bg font-accent text-[0.78rem] sm:w-fit sm:px-10 sm:text-sm
                       uppercase tracking-[0.18em] transition-all duration-300 hover:bg-gold/90
                       rounded-lg shadow-gold-glow"
          >
            Claim Your Free Session
          </a>
        </motion.div>
      </motion.div>

      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 hidden flex-col items-center gap-2 md:flex"
        style={{ opacity: useTransform(scrollY, [0, 200], [1, 0]) }}
      >
        <span className="font-caption text-[10px] tracking-[0.15em] uppercase text-text-dim">
          Scroll
        </span>
        <div className="w-[1px] h-12 bg-gradient-to-b from-gold/50 to-transparent" />
      </motion.div>
    </section>
  );
}
