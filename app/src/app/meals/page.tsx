import { AppShell } from '@/components/layout/AppShell';
import { MealPrepPlanner } from '@/components/meals/MealPrepPlanner';
import { requireFirstSessionBooked } from '@/lib/auth';
import { listClientMealPlans, type AdminMealPlan } from '@/lib/adminMealPlans';

export const dynamic = 'force-dynamic';

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatMealPlanDate(value: string | null): string {
  if (!value) return 'Recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function PublishedMealPlans({
  error,
  mealPlans,
}: {
  error: string | null;
  mealPlans: AdminMealPlan[];
}) {
  if (error) {
    return (
      <section className="mb-5 rounded-sm border border-border bg-surface-2 p-4">
        <p className="font-caption text-[11px] uppercase tracking-[0.16em] text-gold">Coach meal plans</p>
        <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">{error}</p>
      </section>
    );
  }

  if (mealPlans.length === 0) {
    return (
      <section className="mb-5 rounded-sm border border-border bg-surface-2 p-4">
        <p className="font-caption text-[11px] uppercase tracking-[0.16em] text-gold">Coach meal plans</p>
        <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
          Your coach has not posted a meal plan for this profile yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-5 space-y-3">
      <p className="font-caption text-[11px] uppercase tracking-[0.16em] text-gold">Coach meal plans</p>
      {mealPlans.map((plan) => (
        <article key={plan.id} className="rounded-sm border border-border bg-surface-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-section text-2xl tracking-normal text-text">{plan.title}</h2>
              <p className="mt-1 font-body text-sm leading-relaxed text-text-muted">{plan.summary}</p>
            </div>
            <p className="font-caption text-[10px] uppercase tracking-[0.14em] text-text-dim">
              {formatMealPlanDate(plan.publishedAt ?? plan.updatedAt)}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">Meals</p>
              <p className="mt-1 font-headline text-xl text-text">{plan.meals.length}</p>
            </div>
            <div>
              <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">Protein</p>
              <p className="mt-1 font-headline text-xl text-text">{plan.totals.proteinG}g</p>
            </div>
            <div>
              <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">Calories</p>
              <p className="mt-1 font-headline text-xl text-text">{plan.totals.calories}</p>
            </div>
            <div>
              <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">Cost</p>
              <p className="mt-1 font-headline text-xl text-text">{formatMoney(plan.totals.costCents)}</p>
            </div>
          </div>
          {plan.brief ? <p className="mt-4 font-body text-sm leading-relaxed text-text-muted">{plan.brief}</p> : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {plan.meals.slice(0, 4).map((meal) => (
              <div key={`${plan.id}:${meal.id}`} className="rounded-sm border border-border bg-bg/60 p-3">
                <p className="font-headline text-base uppercase leading-none text-text">{meal.name}</p>
                <p className="mt-1 font-body text-xs text-text-muted">
                  {meal.proteinG}g protein / {meal.calories} cal
                </p>
                {meal.productUrl ? (
                  <a
                    href={meal.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex font-caption text-[9px] uppercase tracking-[0.14em] text-gold underline"
                  >
                    View meal
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

export default async function MealsPage() {
  const appUser = await requireFirstSessionBooked();
  let mealPlans: AdminMealPlan[] = [];
  let mealPlansError: string | null = null;

  try {
    mealPlans = await listClientMealPlans(appUser, 5);
  } catch {
    mealPlansError = 'Coach meal plans are unavailable right now. Please check back shortly.';
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-section text-3xl tracking-normal">MEAL PREP</h1>
        <p className="font-body text-sm text-text-muted mt-1">
          Ideal Nutrition picks for your weekly training rhythm.
        </p>
      </header>
      <PublishedMealPlans mealPlans={mealPlans} error={mealPlansError} />
      <MealPrepPlanner clientName={appUser.full_name ?? appUser.email} />
    </AppShell>
  );
}
