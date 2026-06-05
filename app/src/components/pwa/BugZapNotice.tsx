'use client';

export function BugZapNotice() {
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-[60] flex justify-start sm:inset-x-auto sm:left-5 sm:w-[22rem]">
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-[22rem] rounded-[24px] border border-white/14 bg-[#111111]/82 px-4 py-3 font-body text-[0.84rem] font-medium leading-snug text-white shadow-[0_18px_46px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl"
      >
        yesterday&apos;s bugs have been zapped
      </div>
    </div>
  );
}
