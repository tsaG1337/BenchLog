/**
 * Wizard Step 1 — project name + aircraft (manufacturer → model).
 *
 * Cascading dropdowns: switching the manufacturer auto-selects its
 * first model. Same pattern SettingsDialog uses for the same control;
 * intentionally kept consistent so the user re-encounters a familiar
 * widget when they later visit Settings.
 */
import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  listManufacturers, listModels, getManufacturer, getAircraft,
} from '@/lib/aircraft';
import type { WizardForm } from './OnboardingWizard';

interface Props {
  form: WizardForm;
  onChange: (next: WizardForm) => void;
}

export function WizardStepIdentity({ form, onChange }: Props) {
  const manufacturers = useMemo(() => listManufacturers(), []);
  const models = useMemo(() => listModels(form.manufacturerId), [form.manufacturerId]);

  // When the manufacturer changes we pick its first model and also
  // re-default targetHours to that model's recommended value. The
  // user can still override in Step 2; this just removes one click
  // for the common case (pick aircraft → defaults follow).
  const handleManufacturerChange = (manufacturerId: string) => {
    const firstModel = listModels(manufacturerId)[0];
    if (!firstModel) return; // shouldn't happen — every registered manuf has ≥1 model
    const aircraft = getAircraft(`${manufacturerId}-${firstModel.id}`);
    onChange({
      ...form,
      manufacturerId,
      modelId: firstModel.id,
      targetHours: aircraft?.model.targetHours ?? form.targetHours,
    });
  };

  const handleModelChange = (modelId: string) => {
    const aircraft = getAircraft(`${form.manufacturerId}-${modelId}`);
    onChange({
      ...form,
      modelId,
      targetHours: aircraft?.model.targetHours ?? form.targetHours,
    });
  };

  // Helper text only shown when an actual aircraft is selected — keeps
  // the form quiet when defaults haven't been touched yet.
  const manufacturerLabel = getManufacturer(form.manufacturerId)?.label;
  const modelLabel = models.find(m => m.id === form.modelId)?.label;
  const aircraftFullLabel = manufacturerLabel && modelLabel ? `${manufacturerLabel} ${modelLabel}` : null;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="wp-project-name" className="text-xs font-medium">
          What’s it called?
        </Label>
        <Input
          id="wp-project-name"
          value={form.projectName}
          onChange={e => onChange({ ...form, projectName: e.target.value })}
          placeholder="My RV-10"
          autoFocus
        />
        <p className="text-[11px] text-muted-foreground">
          Shows up in the header and the MQTT topic. Anything works — your name, the registration, “Build”.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">What kind?</Label>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.manufacturerId}
            onChange={e => handleManufacturerChange(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Manufacturer"
          >
            {manufacturers.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <select
            value={form.modelId}
            onChange={e => handleModelChange(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-muted/50 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Model"
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        {aircraftFullLabel && (
          <p className="text-[11px] text-muted-foreground">
            Drives your kit manifest, plan-filename parser, service-bulletin catalog, and the default work-package tree.
          </p>
        )}
      </div>
    </div>
  );
}
