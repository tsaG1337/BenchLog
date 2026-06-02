/**
 * OnboardingWizard — the mandatory two-step modal that captures the
 * minimum a new tenant needs before the rest of the app can behave
 * sensibly: project name, aircraft, and a few preferences.
 *
 * Mounted by OnboardingGate; only renders when the server says
 * `wizardCompleted: false`. The Dialog is non-dismissible — no X
 * button, no Esc-to-close, no click-outside-to-close — because
 * skipping it would leave us guessing about the aircraft type, and
 * that's the value driving work packages, plan parsing, kit manifest,
 * and inventory targets.
 *
 * Tone: dry, plain. Builders skim this once at 11pm with coffee. No
 * confetti, no "welcome to your journey" copy.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useOnboardingStatus } from '@/contexts/OnboardingContext';
import { submitOnboardingWizard, CURRENCIES } from '@/lib/api';
import { getAircraft, aircraftId } from '@/lib/aircraft';
import { WizardStepIdentity } from './WizardStepIdentity';
import { WizardStepPreferences } from './WizardStepPreferences';

export interface WizardForm {
  projectName: string;
  manufacturerId: string;
  modelId: string;
  targetHours: number;
  homeCurrency: string;
  timeFormat: '12h' | '24h';
}

const INITIAL: WizardForm = {
  projectName: '',
  // Sensible defaults that the user actively confirms or changes on
  // Step 1 — better than leaving the dropdowns empty and making them
  // pick from "select one" twice.
  manufacturerId: 'vans',
  modelId: 'rv10',
  // 2500 is the RV-10's target; we re-default this whenever the
  // user picks a different model.
  targetHours: 2500,
  // EUR over USD is opinionated but matches the project's origin.
  // User can change it on Step 2 in two clicks.
  homeCurrency: 'EUR',
  timeFormat: '24h',
};

export function OnboardingWizard() {
  const { setWizardCompleted } = useOnboardingStatus();
  const [step, setStep] = useState<0 | 1>(0);
  const [form, setForm] = useState<WizardForm>(INITIAL);
  const [submitting, setSubmitting] = useState(false);

  // Available currencies for the Step 2 dropdown. CURRENCIES from the
  // api module is the canonical list — same one the Expenses page uses.
  const currencies = useMemo(() => CURRENCIES, []);

  // Step 1 valid when: project name non-empty + aircraft is in the registry.
  const aircraftSlug = aircraftId(form.manufacturerId, form.modelId);
  const aircraft = useMemo(() => getAircraft(aircraftSlug), [aircraftSlug]);
  const step1Valid = !!form.projectName.trim() && !!aircraft;

  // Step 2 valid when: target hours positive, currency present.
  const step2Valid = Number.isFinite(form.targetHours) && form.targetHours > 0 && !!form.homeCurrency;

  const handleNext = () => {
    if (step === 0 && step1Valid) setStep(1);
  };

  const handleBack = () => {
    if (step === 1) setStep(0);
  };

  const handleFinish = async () => {
    if (!step2Valid) return;
    setSubmitting(true);
    try {
      await submitOnboardingWizard({
        projectName: form.projectName.trim(),
        aircraftType: aircraftSlug,
        targetHours: form.targetHours,
        homeCurrency: form.homeCurrency,
        timeFormat: form.timeFormat,
      });
      setWizardCompleted();
      toast.success('All set. Go build something.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not save setup');
      setSubmitting(false);
    }
    // No setSubmitting(false) on success — the wizard unmounts.
  };

  return (
    <Dialog open={true} onOpenChange={() => { /* non-dismissible */ }}>
      <DialogContent
        className="max-w-lg gap-0 p-0 overflow-hidden"
        // Strip the built-in close button and the dismiss-on-overlay-click.
        // Step 1 is the smallest the wizard can be; we don't want anyone
        // bypassing it.
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
        hideClose
      >
        {/* Progress + header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <Progress value={step === 0 ? 50 : 100} className="h-1 mb-4" />
          <DialogTitle className="text-lg font-semibold">
            {step === 0 ? 'Tell us what you’re building' : 'A couple of preferences'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {step === 0
              ? 'Two screens, then you’re in. You can change any of this later in Settings.'
              : 'None of this is load-bearing — sensible defaults, all editable later.'}
          </DialogDescription>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === 0 ? (
            <WizardStepIdentity form={form} onChange={setForm} />
          ) : (
            <WizardStepPreferences form={form} onChange={setForm} currencies={currencies} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-muted/30">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            Step {step + 1} of 2
          </span>
          <div className="flex gap-2">
            {step === 1 && (
              <Button variant="outline" size="sm" onClick={handleBack} disabled={submitting}>
                Back
              </Button>
            )}
            {step === 0 ? (
              <Button size="sm" onClick={handleNext} disabled={!step1Valid}>
                Next
              </Button>
            ) : (
              <Button size="sm" onClick={handleFinish} disabled={!step2Valid || submitting}>
                {submitting ? 'Saving…' : 'Let’s go'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
