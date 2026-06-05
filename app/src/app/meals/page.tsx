import { AppShell } from '@/components/layout/AppShell';
import { MealPrepPlanner } from '@/components/meals/MealPrepPlanner';
import { requireFirstSessionBooked } from '@/lib/auth';

export default async function MealsPage() {
  await requireFirstSessionBooked();
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-section text-3xl tracking-normal">MEAL PREP</h1>
        <p className="font-body text-sm text-text-muted mt-1">
          Ideal Nutrition picks for your weekly training rhythm.
        </p>
      </header>
      <MealPrepPlanner />
    </AppShell>
  );
}
