import { useState, useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSections } from '@/contexts/SectionsContext';
import { BlogPost, createBlogPost, updateBlogPost, uploadImages } from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Save, ImagePlus, Loader2 } from 'lucide-react';

interface BlogEditorProps {
  post?: BlogPost;
  onSave: () => void;
  onCancel: () => void;
}

export function BlogEditor({ post, onSave, onCancel }: BlogEditorProps) {
  const { sections } = useSections();
  const [title, setTitle] = useState(post?.title || '');
  const [content, setContent] = useState(post?.content || '');
  const [section, setSection] = useState(post?.section || 'other');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const modules = useMemo(() => ({
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['blockquote', 'link'],
      ['clean'],
    ],
  }), []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    try {
      const urls = await uploadImages('blog-' + Date.now(), files);
      // Insert images into content
      const imgHtml = urls.map(url => `<p><img src="${url}" /></p>`).join('');
      setContent(prev => prev + imgHtml);
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      if (post) {
        await updateBlogPost(post.id, { title, content, section: section || undefined });
      } else {
        await createBlogPost({ title, content, section: section || undefined });
      }
      toast.success(post ? 'Post updated' : 'Post published');
      onSave();
    } catch (err: any) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-lg font-bold text-foreground flex-1">{post ? 'Edit Post' : 'New Post'}</h2>
        <label className="cursor-pointer">
          <Button variant="outline" size="sm" asChild disabled={uploading}>
            <span className="flex items-center gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              Add Image
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            </span>
          </Button>
        </label>
        <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {post ? 'Update' : 'Publish'}
        </Button>
      </div>

      <Input
        placeholder="Post title..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="text-lg font-semibold"
      />

      <Select value={section} onValueChange={setSection}>
        <SelectTrigger>
          <SelectValue placeholder="Select section (optional)" />
        </SelectTrigger>
        <SelectContent>
          
          {sections.map(sec => (
            <SelectItem key={sec.id} value={sec.id}>
              {sec.icon} {sec.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="blog-editor-quill">
        <ReactQuill
          theme="snow"
          value={content}
          onChange={setContent}
          modules={modules}
          placeholder="Write your build log entry..."
        />
      </div>
    </div>
  );
}
