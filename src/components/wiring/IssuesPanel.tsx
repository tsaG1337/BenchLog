import { AlertTriangle, XCircle } from 'lucide-react';
import { useWiring } from '@/lib/wiring/store';
import { LintIssue } from '@/lib/wiring/lint';

export function IssuesPanel({ issues }: { issues: LintIssue[] }) {
  const selectOnly = useWiring(s => s.selectOnly);

  if (issues.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No issues. Diagram passes basic lint checks.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {issues.map(issue => (
        <li key={issue.id} className="p-3 text-xs hover:bg-accent/30 cursor-pointer"
            onClick={() => {
              if (issue.deviceId) selectOnly([issue.deviceId], []);
              else if (issue.wireId) selectOnly([], [issue.wireId]);
              else if (issue.netLabelId) selectOnly([], [], [], [issue.netLabelId]);
            }}>
          <div className="flex items-start gap-2">
            {issue.severity === 'error'
              ? <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground">{issue.title}</div>
              <div className="text-muted-foreground mt-0.5">{issue.detail}</div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
