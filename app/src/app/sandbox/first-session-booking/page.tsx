export default function SandboxBookingPage() {
  return (
    <main className="min-h-dvh bg-bg px-4 py-6 text-text">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-[430px] flex-col">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Mobile sandbox</p>
            <h1 className="mt-1 font-section text-3xl leading-none tracking-normal">First-session booking</h1>
          </div>
          <span className="rounded-md border border-border bg-surface/80 px-2.5 py-1.5 font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">
            390px
          </span>
        </div>

        <div className="flex-1 overflow-hidden rounded-[34px] border border-gold/20 bg-black p-2 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
          <iframe
            title="First-session booking mobile sandbox"
            src="/sandbox/first-session-booking/flow"
            className="h-[844px] max-h-[calc(100dvh-7.5rem)] w-full rounded-[26px] border-0 bg-bg"
          />
        </div>
      </section>
    </main>
  );
}
