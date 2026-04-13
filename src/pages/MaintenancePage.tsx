import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-6">
          <Wrench className="w-10 h-10 text-amber-500" />
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-2">
          Hangar Maintenance
        </h1>
        <p className="text-lg text-muted-foreground mb-6">
          We're performing some scheduled maintenance on BenchLog.
        </p>

        <div className="bg-card border border-border rounded-xl p-6 text-left space-y-3">
          <p className="text-sm text-muted-foreground">
            The crew chief has grounded all flights while we inspect the systems. Don't worry — your build hours are safe and sound.
          </p>
          <p className="text-sm text-muted-foreground">
            Please check back shortly. We'll be back in the air before you know it.
          </p>
        </div>

        <p className="text-xs text-muted-foreground/60 mt-6">
          Admin? <Link to="/login" className="underline hover:text-muted-foreground">Log in here</Link>
        </p>
      </div>
    </div>
  );
}
