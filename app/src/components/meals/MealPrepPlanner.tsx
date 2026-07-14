'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ExternalLink, MessageSquareText, RefreshCw, Search, X } from 'lucide-react';
import type { IdealNutritionMeal } from '@/types';
import { buildPulseBrief } from '@/lib/idealNutrition';
import { reportIncident } from '@/lib/reportIncident';
import { GoogleScheduler, type SchedulerBookingDraft } from '@/components/scheduling/GoogleScheduler';
import { historyPathFromRedirectUrl } from '@/lib/clientNavigation';
import type { BookingServiceType } from '@/lib/bookingServices';

type ApiResponse = {
  source: string;
  updated_at: string;
  meals: IdealNutritionMeal[];
};

type ClientRequestKind = 'trainer-note' | 'meal-plan-change';

const filters = ['all', 'high protein', 'lean', 'keto', 'vegan', 'performance carbs'] as const;
const workoutFocuses = ['strength', 'hypertrophy', 'conditioning', 'recovery'] as const;
const AFFILIATE_CODE = process.env.NEXT_PUBLIC_IDEAL_NUTRITION_AFFILIATE_CODE ?? 'STRYVTRAINER';

export type MealPrepPlanSnapshot = {
  selectedMeals: IdealNutritionMeal[];
  totals: {
    cost: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  workoutFocus: (typeof workoutFocuses)[number];
  brief: string;
};

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function affiliateUrl(url: string): string {
  const next = new URL(url, 'https://idealnutritionnow.com/');
  next.searchParams.set('ref', AFFILIATE_CODE);
  return next.toString();
}

export function MealPrepPlanner({
  admin = false,
  clientName = 'StryvFit+ client',
  onAdminPlanSnapshot,
  onPlanChange,
}: {
  admin?: boolean;
  clientName?: string;
  onAdminPlanSnapshot?: (snapshot: MealPrepPlanSnapshot) => void;
  onPlanChange?: () => void;
}) {
  const [meals, setMeals] = useState<IdealNutritionMeal[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>('all');
  const [workoutFocus, setWorkoutFocus] = useState<(typeof workoutFocuses)[number]>('strength');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [trainerNote, setTrainerNote] = useState('');
  const [changesOpen, setChangesOpen] = useState(false);
  const [changeRequest, setChangeRequest] = useState('');
  const [sentState, setSentState] = useState<ClientRequestKind | null>(null);
  const [sendingRequest, setSendingRequest] = useState<ClientRequestKind | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMeals() {
      setLoading(true);
      try {
        const res = await fetch('/api/ideal-nutrition/meals');
        if (!res.ok) {
          throw new Error(`Ideal Nutrition API failed with ${res.status}`);
        }
        const data = (await res.json()) as ApiResponse;
        if (!cancelled) {
          setMeals(data.meals);
          setSelectedIds(data.meals.slice(0, admin ? 5 : 4).map((meal) => meal.id));
        }
      } catch (error) {
        void reportIncident({
          source: 'browserbase',
          severity: 'high',
          message: error instanceof Error ? error.message : 'Ideal Nutrition meal load failed',
          stack: error instanceof Error ? error.stack : undefined,
          context: { admin },
          admin_action: 'Auto-filed from Ideal Nutrition meal planner.',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMeals();
    return () => {
      cancelled = true;
    };
  }, [admin]);

  const selectedMeals = useMemo(
    () => selectedIds.map((id) => meals.find((meal) => meal.id === id)).filter(Boolean) as IdealNutritionMeal[],
    [meals, selectedIds]
  );

  const visibleMeals = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return meals.filter((meal) => {
      const matchesFilter = filter === 'all' || meal.tags.includes(filter);
      const matchesQuery =
        !needle ||
        `${meal.name} ${meal.subtitle} ${meal.tags.join(' ')}`.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [filter, meals, query]);

  const totals = useMemo(
    () =>
      selectedMeals.reduce(
        (sum, meal) => ({
          cost: sum.cost + meal.price_cents,
          calories: sum.calories + meal.calories,
          protein: sum.protein + meal.protein_g,
          carbs: sum.carbs + meal.carbs_g,
          fat: sum.fat + meal.fat_g,
        }),
        { cost: 0, calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [selectedMeals]
  );
  const pulseContext = useMemo(
    () =>
      buildPulseBrief(
        selectedMeals,
        admin
          ? `Trainer-selected ${workoutFocus} workout and nutrition plan for StryvFit+ client planning.`
          : 'Trainer-recommended Ideal Nutrition meals for a weekly StryvFit+ plan.'
      ),
    [admin, selectedMeals, workoutFocus]
  );
  const adminPlanSnapshot = useMemo<MealPrepPlanSnapshot>(
    () => ({
      selectedMeals,
      totals,
      workoutFocus,
      brief: pulseContext,
    }),
    [pulseContext, selectedMeals, totals, workoutFocus]
  );

  useEffect(() => {
    if (admin) onAdminPlanSnapshot?.(adminPlanSnapshot);
  }, [admin, adminPlanSnapshot, onAdminPlanSnapshot]);

  function toggleMeal(id: string) {
    onPlanChange?.();
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((mealId) => mealId !== id) : [...current, id]
    );
  }

  async function copyBrief() {
    await navigator.clipboard.writeText(pulseContext);
  }

  async function publishClientRequest(kind: ClientRequestKind, message: string) {
    const cleanMessage = message.trim();
    if (!cleanMessage) return;

    setSendingRequest(kind);
    setRequestError(null);
    try {
      const response = await fetch('/api/client/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          clientName,
          message: cleanMessage,
          meals: selectedMeals.map((meal) => ({
            id: meal.id,
            name: meal.name,
            protein_g: meal.protein_g,
            calories: meal.calories,
            product_url: affiliateUrl(meal.product_url),
          })),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to send request');

      setSentState(kind);
      if (kind === 'trainer-note') setTrainerNote('');
      if (kind === 'meal-plan-change') {
        setChangeRequest('');
        setChangesOpen(false);
      }
      window.setTimeout(() => setSentState(null), 2200);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unable to send request';
      setRequestError(messageText);
      void reportIncident({
        source: 'browserbase',
        severity: 'medium',
        message: messageText,
        context: { kind, clientName },
        admin_action: 'Client request failed from MealPrepPlanner.',
      });
    } finally {
      setSendingRequest(null);
    }
  }

  async function createMealPrepBooking(draft: SchedulerBookingDraft) {
    const res = await fetch('/api/bookings/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      checkoutUrl?: string;
      redirectUrl?: string;
    };

    if (!res.ok) {
      throw new Error(payload.error ?? 'Unable to create meal-prep booking');
    }

    if (payload.checkoutUrl) {
      window.location.assign(payload.checkoutUrl);
      return;
    }

    if (payload.redirectUrl) {
      window.history.replaceState(null, '', historyPathFromRedirectUrl(payload.redirectUrl));
    }

    setBookingSuccess(true);
    window.setTimeout(() => {
      setBookingSuccess(false);
      setBookingOpen(false);
    }, 2100);
  }

  const clientRecommendedMeals = selectedMeals.slice(0, 4);

  return (
    <div className="space-y-5">
      <section
        className={
          admin
            ? 'grid gap-5 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-4 sm:grid-cols-5'
            : 'grid gap-5 rounded-sm border border-gold/15 bg-surface-2/80 p-4 sm:grid-cols-5'
        }
      >
        <div className="sm:col-span-2">
          <p
            className={`font-caption text-[10px] uppercase tracking-[0.16em] ${
              admin ? 'text-[#f24f09]' : 'text-gold'
            }`}
          >
            {admin ? 'StryvAdmin meals' : 'Ideal Nutrition'}
          </p>
          <h2 className={`mt-2 font-section text-3xl leading-none tracking-normal ${admin ? 'text-[#151515]' : ''}`}>
            {admin ? 'Build the plan' : "Today's meal plan"}
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:col-span-3 sm:grid-cols-4">
          {[
            ['Meals', selectedMeals.length],
            ['Cost', money(totals.cost)],
            ['Protein', `${totals.protein}g`],
            ['Calories', totals.calories],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={`relative px-3 py-4 ${
                index % 2 === 1
                  ? 'before:absolute before:inset-y-3 before:left-0 before:w-px before:bg-[linear-gradient(to_bottom,transparent,rgba(242,79,9,0.32),transparent)]'
                  : ''
              } ${
                index > 1
                  ? 'after:absolute after:inset-x-3 after:top-0 after:h-px after:bg-[linear-gradient(to_right,transparent,rgba(242,79,9,0.32),transparent)] sm:after:hidden'
                  : ''
              } sm:before:absolute sm:before:inset-y-3 sm:before:left-0 sm:before:w-px sm:before:bg-[linear-gradient(to_bottom,transparent,rgba(242,79,9,0.32),transparent)] sm:first:before:hidden`}
            >
              <p
                className={`font-caption text-[9px] uppercase tracking-[0.14em] ${
                  admin ? 'text-[#817b72]' : 'text-text-dim'
                }`}
              >
                {label}
              </p>
              <p className={`mt-1 font-headline text-lg ${admin ? 'text-[#151515]' : 'text-text'}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      {admin ? (
        <section className="flex flex-col gap-3 sm:flex-row">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-[#dedbd4] bg-[#fbfaf8] px-3">
            <Search className="h-4 w-4 text-[#817b72]" strokeWidth={1.7} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search meals or macros"
              className="min-w-0 flex-1 bg-transparent font-body text-sm text-[#151515] outline-none placeholder:text-[#817b72]"
            />
          </label>
          <div className="admin-fade-tabs flex overflow-x-auto pb-1">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                aria-pressed={filter === item}
                className={`admin-liquid-button min-h-11 whitespace-nowrap border-0 bg-transparent px-3 font-caption text-[10px] uppercase tracking-[0.14em] shadow-none transition-colors ${
                  filter === item
                    ? 'text-[#f24f09]'
                    : 'text-[#6d675f] hover:text-[#151515]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-sm border border-gold/15 bg-surface-2/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Trainer picks</p>
              <h3 className="mt-1 font-headline text-2xl uppercase text-text">4 meals for today</h3>
            </div>
            <button
              type="button"
              onClick={() => setChangesOpen(true)}
              className="ios-pill min-h-10 rounded-full border border-gold px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-gold transition hover:bg-gold hover:text-bg"
            >
              Changes?
            </button>
          </div>
        </section>
      )}

      {admin ? (
        <section className="py-3">
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">
            Workout flow
          </p>
          <div className="admin-fade-tabs mt-3 flex flex-wrap overflow-hidden">
            {workoutFocuses.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  if (item !== workoutFocus) onPlanChange?.();
                  setWorkoutFocus(item);
                }}
                aria-pressed={workoutFocus === item}
                className={`admin-liquid-button min-h-11 flex-1 basis-1/2 border-0 bg-transparent px-3 font-caption text-[10px] uppercase tracking-[0.14em] shadow-none transition-colors sm:basis-0 ${
                  workoutFocus === item
                    ? 'text-[#f24f09]'
                    : 'text-[#6d675f] hover:text-[#151515]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {admin ? (
        <GoogleScheduler
          title="StryvAdmin planning block"
          description={`Workout focus: ${workoutFocus}. Review Ideal Nutrition selections and prepare the StryvFit+ client plan.`}
          durationMinutes={30}
          context={pulseContext}
          tone="light"
        />
      ) : null}

      {loading ? (
        <div
          className={
            admin
              ? 'flex min-h-56 items-center justify-center rounded-md border border-[#dedbd4] bg-[#fbfaf8]'
              : 'flex min-h-56 items-center justify-center rounded-sm border border-border bg-surface-2'
          }
        >
          <RefreshCw className="h-6 w-6 animate-spin text-gold" strokeWidth={1.6} />
        </div>
      ) : (
        <section className={admin ? 'grid gap-3 md:grid-cols-2' : 'flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 md:grid md:snap-none md:grid-cols-2 md:overflow-visible'}>
          {(admin ? visibleMeals : clientRecommendedMeals).map((meal) => {
            const selected = selectedIds.includes(meal.id);
            return (
              <article
                key={meal.id}
                className={`${admin ? 'grid grid-cols-[112px_1fr] gap-3 rounded-md bg-[#fbfaf8] p-3' : 'flex min-w-[88%] flex-col gap-4 rounded-sm bg-surface-2 p-4 sm:min-w-[70%]'} snap-center border transition-colors md:min-w-0 ${
                  selected
                    ? admin
                      ? 'border-[#f24f09]/70'
                      : 'border-gold/70'
                    : admin
                      ? 'border-[#e6e2da] hover:border-[#f24f09]/45'
                      : 'border-border hover:border-gold/35'
                }`}
              >
                <div
                  className={admin ? 'min-h-36 rounded-md bg-[#eeeae4] bg-cover bg-center' : 'aspect-[4/3] min-h-56 rounded-sm bg-surface-3 bg-cover bg-center'}
                  style={meal.image_url ? { backgroundImage: `url(${meal.image_url})` } : undefined}
                />
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className={admin ? 'font-headline text-base uppercase leading-tight text-[#151515]' : 'font-headline text-2xl uppercase leading-tight text-text'}>
                        {meal.name}
                      </h3>
                      <p className={admin ? 'mt-1 line-clamp-2 font-body text-xs leading-relaxed text-[#6d675f]' : 'mt-2 font-body text-sm leading-relaxed text-text-muted'}>
                        {meal.subtitle}
                      </p>
                    </div>
                    {admin ? (
                      <button
                        type="button"
                        onClick={() => toggleMeal(meal.id)}
                        aria-label={selected ? `Remove ${meal.name}` : `Select ${meal.name}`}
                        aria-pressed={selected}
                        className={`admin-liquid-button flex h-8 w-8 flex-none items-center justify-center rounded-sm border transition-colors ${
                          selected
                            ? 'text-[#f24f09]'
                            : 'text-[#817b72] hover:text-[#f24f09]'
                        }`}
                      >
                        {selected ? <Check className="h-4 w-4" strokeWidth={2} /> : '+'}
                      </button>
                    ) : null}
                  </div>
                  <dl className="mt-4 grid grid-cols-5 gap-1 text-center">
                    {[
                      ['Price', money(meal.price_cents)],
                      ['Cal', meal.calories],
                      ['Pro', `${meal.protein_g}g`],
                      ['Carb', `${meal.carbs_g}g`],
                      ['Fat', `${meal.fat_g}g`],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-sm px-1 py-2.5 ${admin ? 'bg-[#f5f2ed]' : 'bg-bg/70'}`}>
                        <dt
                          className={`font-caption text-[8px] uppercase tracking-[0.1em] ${
                            admin ? 'text-[#817b72]' : 'text-text-dim'
                          }`}
                        >
                          {label}
                        </dt>
                        <dd className={`mt-0.5 font-body text-[11px] ${admin ? 'text-[#151515]' : 'text-text'}`}>
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <a
                    href={affiliateUrl(meal.product_url)}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-3 inline-flex items-center gap-1 font-caption text-[9px] uppercase tracking-[0.14em] ${
                      admin ? 'text-[#817b72] hover:text-[#f24f09]' : 'text-text-dim hover:text-gold'
                    }`}
                  >
                    Ideal Nutrition <ExternalLink className="h-3 w-3" strokeWidth={1.7} />
                  </a>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {!admin ? (
        <section className="overflow-hidden rounded-sm bg-transparent">
          <button
            type="button"
            onClick={() => setBookingOpen((open) => !open)}
            className="relative flex min-h-14 w-full items-center justify-between gap-4 px-1 text-left before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(to_right,transparent,rgba(242,79,9,0.32),transparent)] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[linear-gradient(to_right,transparent,rgba(242,79,9,0.32),transparent)]"
          >
            <span className="inline-flex items-center gap-3">
              <CalendarDays className="h-4 w-4 text-gold" strokeWidth={1.7} />
              <span>
                <span className="block font-caption text-[10px] uppercase tracking-[0.16em] text-gold">
                  Schedule
                </span>
                <span className="mt-1 block font-headline text-xl uppercase text-text">
                  {bookingOpen ? 'Choose a block' : 'Book a new session later'}
                </span>
              </span>
            </span>
            <ChevronDown
              className={`h-5 w-5 text-gold transition-transform ${bookingOpen ? 'rotate-180' : ''}`}
              strokeWidth={1.8}
            />
          </button>
          {bookingOpen ? (
            <div className="pt-4">
              <GoogleScheduler
                title="StryvFit+ meal prep check-in"
                description="Review Ideal Nutrition picks and set the weekly meal-prep rhythm."
                durationMinutes={30}
                context={pulseContext}
                serviceType={'meal_prep' as BookingServiceType}
                onBookSession={createMealPrepBooking}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {admin ? (
        <section className="rounded-sm border border-gold/20 bg-bg/95 p-3 shadow-glass">
          <button
            type="button"
            onClick={copyBrief}
            disabled={selectedMeals.length === 0}
            className="ios-pill inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-gold px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg disabled:opacity-50"
          >
            <Check size={16} /> Copy admin brief
          </button>
        </section>
      ) : (
        <section className="rounded-sm border border-gold/20 bg-surface-2/90 p-4 shadow-glass">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-gold" />
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Notes for your trainer</p>
          </div>
          <textarea
            value={trainerNote}
            onChange={(event) => setTrainerNote(event.target.value)}
            className="mt-3 min-h-28 w-full resize-none rounded-sm border border-border bg-bg/70 p-3 font-body text-sm leading-relaxed text-text outline-none placeholder:text-text-dim focus:border-gold"
            placeholder="Energy, appetite, soreness, food preferences, or anything your trainer should know."
          />
          <button
            type="button"
            onClick={() => void publishClientRequest('trainer-note', trainerNote)}
            disabled={!trainerNote.trim() || sendingRequest === 'trainer-note'}
            className="ios-pill mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gold px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg transition hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-45"
          >
            {sendingRequest === 'trainer-note' ? 'Sending' : 'Send note'}
          </button>
          {sentState === 'trainer-note' ? (
            <p className="mt-2 font-body text-xs text-gold">Sent to your trainer with suggested next steps.</p>
          ) : null}
          {requestError ? <p className="mt-2 font-body text-xs text-gold">{requestError}</p> : null}
        </section>
      )}

      {changesOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/60 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <section className="w-full max-w-lg rounded-lg border border-gold/25 bg-surface-2 p-4 shadow-glass-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Meal plan changes</p>
                <h3 className="mt-1 font-section text-3xl leading-none text-text">Request a swap</h3>
              </div>
              <button
                type="button"
                onClick={() => setChangesOpen(false)}
                aria-label="Close meal change request"
                className="ios-pill flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-muted hover:border-gold hover:text-gold"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 font-body text-sm leading-relaxed text-text-muted">
              Tell your trainer what you want changed. They will review it against your approved meal plan.
            </p>
            <textarea
              value={changeRequest}
              onChange={(event) => setChangeRequest(event.target.value)}
              className="mt-4 min-h-32 w-full resize-none rounded-sm border border-border bg-bg/70 p-3 font-body text-sm leading-relaxed text-text outline-none placeholder:text-text-dim focus:border-gold"
              placeholder="Example: Can we swap the salmon meal? I need lower dairy this week."
            />
            <button
              type="button"
              onClick={() => void publishClientRequest('meal-plan-change', changeRequest)}
              disabled={!changeRequest.trim() || sendingRequest === 'meal-plan-change'}
              className="ios-pill mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gold px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg transition hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-45"
            >
              {sendingRequest === 'meal-plan-change' ? 'Sending' : 'Send change request'}
            </button>
            {requestError ? <p className="mt-2 font-body text-xs text-gold">{requestError}</p> : null}
          </section>
        </div>
      ) : null}

      {bookingSuccess ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/72 p-6 backdrop-blur-md">
          <section className="max-w-sm text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold text-bg shadow-[0_0_44px_rgba(242,79,9,0.44)]">
              <Check className="h-8 w-8" strokeWidth={2.2} />
            </div>
            <h3 className="mt-5 font-section text-4xl leading-none text-text">You&apos;re all done for today.</h3>
            <p className="mt-3 font-body text-sm leading-relaxed text-text-muted">
              See you next session!
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
