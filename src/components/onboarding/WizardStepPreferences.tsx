/**
 * Wizard Step 2 — target hours, home currency, time format.
 *
 * All three editable later in Settings. The point of asking now is
 * partly to set expectations (the dashboard's finish-date projection
 * uses targetHours) and partly to put EUR-vs-USD in front of the
 * user once, instead of letting them notice the wrong default later.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WizardForm } from './OnboardingWizard';
import type { CURRENCIES } from '@/lib/api';

interface Props {
  form: WizardForm;
  onChange: (next: WizardForm) => void;
  currencies: typeof CURRENCIES;
}

export function WizardStepPreferences({ form, onChange, currencies }: Props) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="wp-target-hours" className="text-xs font-medium">
          How many hours are you giving yourself?
        </Label>
        <Input
          id="wp-target-hours"
          type="number"
          inputMode="numeric"
          min={1}
          step={50}
          value={form.targetHours}
          onChange={e => onChange({ ...form, targetHours: Number(e.target.value) })}
          autoFocus
        />
        <p className="text-[11px] text-muted-foreground">
          Van’s says ~2,500 for the RV-10. The dashboard projects your finish date against this — change it later if reality disagrees.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wp-currency" className="text-xs font-medium">
          Currency for expenses
        </Label>
        <select
          id="wp-currency"
          value={form.homeCurrency}
          onChange={e => onChange({ ...form, homeCurrency: e.target.value })}
          className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {currencies.map(c => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name} ({c.symbol})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Time format</Label>
        <div className="flex gap-2">
          {(['24h', '12h'] as const).map(fmt => (
            <button
              key={fmt}
              onClick={() => onChange({ ...form, timeFormat: fmt })}
              className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                form.timeFormat === fmt
                  ? 'bg-primary/15 border-primary text-primary'
                  : 'bg-muted/50 border-border text-muted-foreground hover:border-muted-foreground/50'
              }`}
            >
              {fmt === '24h' ? '24-hour (14:30)' : '12-hour (2:30 PM)'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
