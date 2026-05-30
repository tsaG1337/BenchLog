/**
 * Plans Library — drawing-PDF viewer with per-builder annotations.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  AppShell header                                                │
 *   ├──────────────┬──────────────────────────────────────────────────┤
 *   │  Sidebar     │  PDF viewer                                      │
 *   │   • pinned   │   (react-pdf <Document><Page/></Document>)       │
 *   │   • search   │                                                  │
 *   │   • tree     │   Annotation overlay (text notes + freehand)     │
 *   │              │                                                  │
 *   └──────────────┴──────────────────────────────────────────────────┘
 *
 * Sub-components live in src/components/plans/. This file is the page
 * shell — it owns the active-file/page state and orchestrates between
 * Upload, Sidebar, Reader, and Annotations.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell, MIcon } from '@/components/AppShell';
import { toast } from 'sonner';
import {
  fetchGeneralSettings,
  listPlans, deletePlan, updatePlan, type PlanFile,
} from '@/lib/api';
import { getPlanSections, parsePlanFilename, getPlanSection, type PlanSection } from '@/lib/aircraft';
import { PlanUploadDialog } from '@/components/plans/PlanUploadDialog';
import { PlanSidebar } from '@/components/plans/PlanSidebar';
import { PlanReader } from '@/components/plans/PlanReader';
import { indexPlanFile } from '@/lib/plans/indexPlan';

const LAST_FILE_KEY = 'plans:lastFileId';
const LAST_PAGE_KEY = 'plans:lastPage';

export default function PlansPage() {
  const { fileId } = useParams<{ fileId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusPhase = searchParams.get('phase') || null;
  const queryPage = Number(searchParams.get('page'));
  const [projectName, setProjectName] = useState('Build Tracker');
  const [aircraftSlug, setAircraftSlug] = useState('vans-rv10');
  const [files, setFiles] = useState<PlanFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  // Drawer is open by default until the user has selected a file —
  // that way the empty state surfaces the library, but as soon as a
  // file is being read the drawer collapses to maximise the canvas.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Sections catalog for the active aircraft (drives sidebar grouping).
  const sections = useMemo(() => getPlanSections(aircraftSlug), [aircraftSlug]);

  // Resolve the currently-viewed file from URL → state. If the URL has no
  // fileId, restore the last-viewed file from localStorage.
  const activeFile = useMemo(() => {
    if (fileId) return files.find(f => f.id === fileId) || null;
    const saved = localStorage.getItem(LAST_FILE_KEY);
    if (saved) return files.find(f => f.id === saved) || null;
    return null;
  }, [fileId, files]);

  // Load settings + plan list on mount.
  useEffect(() => {
    fetchGeneralSettings()
      .then(s => {
        setProjectName(s.projectName || 'Build Tracker');
        setAircraftSlug(s.aircraftType || 'vans-rv10');
      })
      .catch(() => {});
    refresh();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listPlans();
      setFiles(list);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  // Persist + restore last viewed file/page.
  useEffect(() => {
    if (activeFile) {
      localStorage.setItem(LAST_FILE_KEY, activeFile.id);
      // URL param wins over localStorage so palette deep-links land on the
      // right sheet+page even if the user last viewed a different page.
      const target = queryPage > 0
        ? queryPage
        : Number(localStorage.getItem(`${LAST_PAGE_KEY}:${activeFile.id}`));
      setPageNumber(target > 0 ? target : 1);
      setSidebarOpen(false);
    }
  }, [activeFile?.id, queryPage]);

  useEffect(() => {
    if (activeFile) {
      localStorage.setItem(`${LAST_PAGE_KEY}:${activeFile.id}`, String(pageNumber));
    }
  }, [activeFile?.id, pageNumber]);

  const handleSelectFile = useCallback((id: string) => {
    navigate(`/plans/${id}`, { replace: false });
  }, [navigate]);

  const handleTogglePin = useCallback(async (id: string, pinned: boolean) => {
    try {
      const updated = await updatePlan(id, { pinned });
      setFiles(prev => prev.map(f => f.id === id ? updated : f));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update');
    }
  }, []);

  const handleAssign = useCallback(async (id: string, section: PlanSection) => {
    try {
      const updated = await updatePlan(id, {
        sectionId: section.id,
        sectionTitle: section.title,
        phase: section.phase,
      });
      setFiles(prev => prev.map(f => f.id === id ? updated : f));
      toast.success(`Assigned to ${section.title}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign');
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this plan PDF and its annotations? This cannot be undone.')) return;
    try {
      await deletePlan(id);
      setFiles(prev => prev.filter(f => f.id !== id));
      if (activeFile?.id === id) {
        localStorage.removeItem(LAST_FILE_KEY);
        navigate('/plans', { replace: true });
      }
      toast.success('Deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  }, [activeFile?.id, navigate]);

  // After uploads land, run the filename parser on each file and patch
  // the server-side row with the detected section/phase.
  const handleUploaded = useCallback(async (uploaded: PlanFile[]) => {
    const unrecognized: PlanFile[] = [];
    const patched: PlanFile[] = [];
    for (const f of uploaded) {
      const parsed = parsePlanFilename(aircraftSlug, f.originalName);
      const section = parsed ? getPlanSection(aircraftSlug, parsed.sectionId) : undefined;
      if (section) {
        try {
          const updated = await updatePlan(f.id, {
            sectionId: section.id,
            sectionTitle: section.title,
            phase: section.phase,
            description: parsed?.description || '',
          });
          patched.push(updated);
        } catch {
          patched.push(f);
        }
      } else {
        unrecognized.push(f);
      }
    }
    setFiles(prev => [...prev, ...patched, ...unrecognized]);
    // Index in the background — don't block the toast/UI. We don't await
    // these promises; failures just leave the file un-indexed, which the
    // user can recover from later by re-uploading or hitting a manual
    // re-index control if one is added.
    for (const f of [...patched, ...unrecognized]) {
      indexPlanFile(f.id, aircraftSlug).catch(err => {
        console.warn(`[plans] index failed for ${f.originalName}:`, err);
      });
    }
    if (unrecognized.length === 0) {
      toast.success(`Uploaded ${patched.length} file${patched.length === 1 ? '' : 's'}, all auto-classified.`);
    } else {
      toast.message(
        `Uploaded ${uploaded.length} file${uploaded.length === 1 ? '' : 's'} — ${unrecognized.length} need manual assignment.`
      );
    }
  }, [aircraftSlug]);

  // Header actions: library toggle (only useful when a file is being read —
  // until then the drawer is open and the empty state surfaces it) +
  // upload button.
  const headerRight = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setSidebarOpen(s => !s)}
        title={sidebarOpen ? 'Close library' : 'Open library'}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted transition"
      >
        <MIcon name={sidebarOpen ? 'menu_open' : 'menu_book'} className="text-base" />
        Library
      </button>
      <button
        onClick={() => setUploadOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition"
      >
        <MIcon name="upload" className="text-base" /> Upload PDFs
      </button>
    </div>
  );

  return (
    <AppShell
      activePage="plans"
      projectName={projectName}
      headerRight={headerRight}
      fullWidth
      // Compact header when actually reading a PDF (h-12 on mobile, h-16
      // on desktop). Empty / library-picker views still get the taller
      // bar where the headerRight buttons need room to breathe.
      compactHeaderOnMobile={!!activeFile}
    >
      {/* Single full-width canvas with the library drawer overlaying it
          when open. AppShell with fullWidth gives <main> px-0 pb-0 so the
          canvas runs edge-to-edge of the available area (after the fixed
          icon rail). */}
      {/* AppShell's <header> is h-16 desktop / h-12 mobile when compact;
          <main> applies pt-20 / pt-16 — a 16px "breathing room" gap.
          We pull up by -mt-4 (-16px) so the canvas sits flush against
          the header. h-dvh on mobile uses the dynamic viewport so the
          PDF grows as Safari hides the URL bar; h-[calc(100vh-4rem)] on
          desktop matches the header height. */}
      <div className="relative -mt-4 bg-muted/20 overflow-hidden h-[calc(100dvh-3rem)] md:h-[calc(100vh-4rem)]">
        {activeFile ? (
          <PlanReader
            key={activeFile.id}
            file={activeFile}
            pageNumber={pageNumber}
            onPageChange={setPageNumber}
            onOpenLibrary={() => setSidebarOpen(true)}
            aircraftSlug={aircraftSlug}
          />
        ) : (
          <EmptyState
            onUpload={() => setUploadOpen(true)}
            onOpenLibrary={() => setSidebarOpen(true)}
            hasFiles={files.length > 0}
          />
        )}
        <PlanSidebar
          files={files}
          sections={sections}
          loading={loading}
          activeFileId={activeFile?.id || null}
          onSelectFile={handleSelectFile}
          onTogglePin={handleTogglePin}
          onAssign={handleAssign}
          onDelete={handleDelete}
          aircraftSlug={aircraftSlug}
          focusPhase={focusPhase}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
      <PlanUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploaded}
        aircraftSlug={aircraftSlug}
        existingFiles={files}
      />
    </AppShell>
  );
}

function EmptyState({
  onUpload, onOpenLibrary, hasFiles,
}: {
  onUpload: () => void;
  onOpenLibrary: () => void;
  hasFiles: boolean;
}) {
  return (
    <div className="h-full flex items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-4">
        <MIcon name="menu_book" className="text-6xl text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">
          {hasFiles ? 'Pick a drawing from the library' : 'No plans uploaded yet'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {hasFiles
            ? 'Open the library to pick a section. Pin the sheets you are actively working on — they jump to the top of the list.'
            : 'Drop your aircraft plan PDFs here to get started. Filenames matching your manufacturer\'s pattern (e.g. "18_10.pdf") are sorted automatically; the rest you can assign with one click.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {hasFiles && (
            <button
              onClick={onOpenLibrary}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted transition"
            >
              <MIcon name="menu_book" className="text-base" /> Open library
            </button>
          )}
          <button
            onClick={onUpload}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
          >
            <MIcon name="upload" className="text-base" />
            {hasFiles ? 'Upload more' : 'Upload your first plan set'}
          </button>
        </div>
      </div>
    </div>
  );
}
