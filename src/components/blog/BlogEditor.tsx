import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BlogPost, createBlogPost, updateBlogPost } from '@/lib/api';
import { TipTapEditor } from './editor/TipTapEditor';
import { useAutoSave, SaveStatus } from './editor/useAutoSave';
import { toast } from 'sonner';
import { ArrowLeft, Save, Loader2, Cloud, CloudOff, FileText } from 'lucide-react';
import type { JSONContent } from '@tiptap/react';
import { WorkPackagePicker } from '@/components/WorkPackagePicker';

interface BlogEditorProps {
  post?: BlogPost;
  onSave: () => void;
  onCancel: () => void;
}

const STATUS_DISPLAY: Record<SaveStatus, { label: string; Icon: typeof Cloud }> = {
  idle:   { label: '',           Icon: Cloud },
  saving: { label: 'Saving...', Icon: Cloud },
  saved:  { label: 'Saved',     Icon: Cloud },
  draft:  { label: 'Draft',     Icon: FileText },
  error:  { label: 'Save failed', Icon: CloudOff },
};

export function BlogEditor({ post, onSave, onCancel }: BlogEditorProps) {
  const [title, setTitle] = useState(post?.title || '');
  const [section, setSection] = useState(post?.section || 'other');
  const [plansSection, setPlansSection] = useState(post?.plansSection || '');
  const [saving, setSaving] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  // Store the serialized content string — initialized from existing post so save never wipes content
  const contentRef = useRef<string>(post?.content || '');

  const autoSave = useAutoSave({
    postId: post?.id,
    title,
    section,
  });

  // Check for draft on mount
  useEffect(() => {
    const draft = autoSave.getDraft();
    if (draft && draft.ts > Date.now() - 24 * 60 * 60 * 1000) {
      // There's a recent draft — offer to restore
      setDraftPrompt(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestoreDraft = useCallback(() => {
    const draft = autoSave.getDraft();
    if (draft) {
      setTitle(draft.title || title);
      setSection(draft.section || section);
      // Content will be set via initialContent — we need to force re-render
      contentRef.current = draft.content;
      setEditorKey(k => k + 1);
    }
    setDraftPrompt(false);
  }, [autoSave, title, section]);

  const handleDismissDraft = useCallback(() => {
    autoSave.clearDraft();
    setDraftPrompt(false);
  }, [autoSave]);

  const handleUpdate = useCallback((json: JSONContent) => {
    const serialized = JSON.stringify(json);
    contentRef.current = serialized;
    autoSave.save(json);
  }, [autoSave]);

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    const content = contentRef.current;
    setSaving(true);
    try {
      if (post) {
        await updateBlogPost(post.id, { title, content, section: section || undefined, plansSection: plansSection || '' });
      } else {
        await createBlogPost({ title, content, section: section || undefined, plansSection: plansSection || '' });
      }
      autoSave.clearDraft();
      toast.success(post ? 'Post updated' : 'Post published');
      onSave();
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const { label: statusLabel, Icon: StatusIcon } = STATUS_DISPLAY[autoSave.status];

  return (
    <div className="space-y-4">
      {/* Draft recovery prompt */}
      {draftPrompt && (
        <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
          <FileText className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="flex-1 text-foreground">An unsaved draft was found. Restore it?</span>
          <Button size="sm" variant="outline" onClick={handleDismissDraft}>Discard</Button>
          <Button size="sm" onClick={handleRestoreDraft}>Restore</Button>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-lg font-bold text-foreground flex-1">{post ? 'Edit Post' : 'New Post'}</h2>

        {/* Auto-save status */}
        {statusLabel && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusIcon className="w-3.5 h-3.5" />
            {statusLabel}
          </span>
        )}

        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {post ? 'Save' : 'Publish'}
        </Button>
      </div>

      <Input
        placeholder="Post title..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="text-lg font-semibold"
      />

      <WorkPackagePicker
        compact
        section={section}
        onSectionChange={setSection}
        plansSection={plansSection}
        onPlansSectionChange={setPlansSection}
      />

      {/* TipTap Editor */}
      <div className="rounded-lg bg-background overflow-hidden">
        <TipTapEditor
          key={editorKey}
          initialContent={
            editorKey > 0 && contentRef.current
              ? contentRef.current
              : post?.content
          }
          onUpdate={handleUpdate}
        />
      </div>
    </div>
  );
}
