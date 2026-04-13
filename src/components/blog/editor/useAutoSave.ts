import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { updateBlogPost } from '@/lib/api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'draft' | 'error';

// Scope draft keys by hostname to prevent cross-tenant data leakage on shared origins
const _host = typeof window !== 'undefined' ? window.location.hostname : '';
const DRAFT_KEY_NEW = `blog-draft-new-${_host}`;
const draftKeyFor = (postId: string) => `blog-draft-${_host}-${postId}`;

interface UseAutoSaveOptions {
  /** Existing post ID — undefined for new posts */
  postId?: string;
  /** Current title */
  title: string;
  /** Current section */
  section: string;
  /** Debounce interval in ms */
  debounceMs?: number;
}

export function useAutoSave({ postId, title, section, debounceMs = 2000 }: UseAutoSaveOptions) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastJsonRef = useRef<string>('');
  const titleRef = useRef(title);
  const sectionRef = useRef(section);
  titleRef.current = title;
  sectionRef.current = section;

  /** Save content (debounced). For new posts → localStorage only. For existing → server + localStorage backup. */
  const save = useCallback((json: JSONContent) => {
    const serialized = JSON.stringify(json);

    // Always save to localStorage as crash recovery
    const key = postId ? draftKeyFor(postId) : DRAFT_KEY_NEW;
    try {
      localStorage.setItem(key, JSON.stringify({ title: titleRef.current, section: sectionRef.current, content: serialized, ts: Date.now() }));
    } catch { /* quota exceeded — ignore */ }

    // Skip server save for new posts (no ID yet) or if nothing changed
    if (!postId || serialized === lastJsonRef.current) {
      if (!postId) setStatus('draft');
      return;
    }

    // Debounce server save
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('saving');
    timerRef.current = setTimeout(async () => {
      try {
        await updateBlogPost(postId, { title: titleRef.current, content: serialized, section: sectionRef.current || undefined });
        lastJsonRef.current = serialized;
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, debounceMs);
  }, [postId, debounceMs]); // title and section accessed via refs

  /** Clear the draft from localStorage */
  const clearDraft = useCallback(() => {
    const key = postId ? draftKeyFor(postId) : DRAFT_KEY_NEW;
    try { localStorage.removeItem(key); } catch {}
  }, [postId]);

  /** Check if a draft exists and return its content */
  const getDraft = useCallback((): { title: string; section: string; content: string; ts: number } | null => {
    const key = postId ? draftKeyFor(postId) : DRAFT_KEY_NEW;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, [postId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { status, save, clearDraft, getDraft };
}
