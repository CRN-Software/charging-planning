import {
  buildWeek,
  evaluate,
  planWeek,
  type ModeId,
  type Override,
  type Plan,
  type PlanContext,
  type Question,
  type Week,
} from '@charging/planner';
import { useHouseholdStore } from '~/stores/household';

export interface QuestionOption {
  mode: ModeId;
  plan: Plan;
}
export interface RelevantQuestion extends Question {
  results: QuestionOption[];
}

const planSignature = (p: Plan) =>
  `${p.chosen
    .map((c) => c.id)
    .sort()
    .join()}|${String(p.sim.violation !== null)}`;

/**
 * Plans the rolling week in the browser: it depends on "now", so nothing is computed during SSR
 * (`week` stays null until mounted and every derived value is null too).
 */
export function usePlan() {
  const store = useHouseholdStore();
  const week = shallowRef<Week | null>(null);
  onMounted(() => {
    week.value = buildWeek(new Date());
  });

  const contextFor = (w: Week, overrides: Record<string, Override>): PlanContext => ({
    household: store.household,
    days: w.days,
    startH: w.startH,
    events: w.instantiate(store.events),
    manualCharges: w.instantiate(store.manualCharges),
    settings: store.settings,
    overrides,
    gaps: store.gaps,
  });

  const plan = computed(() =>
    week.value ? planWeek(contextFor(week.value, store.overrides)) : null,
  );
  const baseline = computed(() =>
    week.value ? evaluate(contextFor(week.value, store.overrides), []) : null,
  );

  /** Only the questions whose answer changes the charging plan (plus missing addresses). */
  const questions = computed<RelevantQuestion[]>(() => {
    const w = week.value;
    if (!w || !plan.value) return [];
    return plan.value.questions
      .map((q) => ({
        ...q,
        results: q.modes.map((mode) => ({
          mode,
          plan: planWeek(
            contextFor(w, { ...store.overrides, [q.group]: { ...store.overrides[q.group], mode } }),
          ),
        })),
      }))
      .filter((q) => new Set(q.results.map((r) => planSignature(r.plan))).size > 1);
  });

  const pending = computed(() => new Set(questions.value.map((q) => q.group)));

  return { week, plan, baseline, questions, pending };
}
