import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink } from 'lucide-react';

const VERSION = import.meta.env.VITE_APP_VERSION || 'dev';
const GITHUB_URL = 'https://github.com/tsag1337/benchlog';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>About Benchlog</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono text-foreground">{VERSION}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">License</span>
            <span className="text-foreground">PolyForm Noncommercial 1.0</span>
          </div>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md border border-border bg-secondary hover:bg-secondary/80 text-sm text-foreground transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
            View on GitHub
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
