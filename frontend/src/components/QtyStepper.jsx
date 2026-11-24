import { Minus, Plus } from "lucide-react";

export const QtyStepper = ({ value, onChange, testId, min = 1 }) => (
  <div className="inline-flex items-center rounded-full border bg-background">
    <button type="button" aria-label="Weniger" data-testid={`${testId}-minus`} disabled={value <= min}
      onClick={() => onChange(value - 1)} className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-secondary disabled:opacity-40">
      <Minus className="h-4 w-4" />
    </button>
    <span className="tabular w-7 text-center font-semibold" data-testid={`${testId}-value`}>{value}</span>
    <button type="button" aria-label="Mehr" data-testid={`${testId}-plus`} disabled={value >= 20}
      onClick={() => onChange(value + 1)} className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-secondary disabled:opacity-40">
      <Plus className="h-4 w-4" />
    </button>
  </div>
);
