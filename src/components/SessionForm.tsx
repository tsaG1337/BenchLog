import { useRef, useState, useEffect } from 'react';
import { useSections } from '@/contexts/SectionsContext';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Mic } from 'lucide-react';
import { SessionImages } from '@/components/SessionImages';
import { toast } from 'sonner';

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

interface SessionFormProps {
  section: string;
  onSectionChange: (s: string) => void;
  plansPage: string;
  onPlansPageChange: (v: string) => void;
  plansSection: string;
  onPlansSectionChange: (v: string) => void;
  plansStep: string;
  onPlansStepChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  pendingImageUrls: string[];
  onPendingImageUrlsChange: (urls: string[]) => void;
  activeSessionId?: string;
  demoMode?: boolean;
}

export function SessionForm({
  section, onSectionChange,
  plansPage, onPlansPageChange,
  plansSection, onPlansSectionChange,
  plansStep, onPlansStepChange,
  notes, onNotesChange,
  pendingImageUrls, onPendingImageUrlsChange,
  activeSessionId,
  demoMode,
}: SessionFormProps) {
  const { sections } = useSections();
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);
  const sessionId = activeSessionId || 'pending';

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const toggleListening = () => {
    if (!SpeechRecognitionAPI) {
      toast.error('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (final) {
        onNotesChange((notes ? notes + ' ' : '') + final.trim());
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };
    recognition.onend = () => { setIsListening(false); setInterimText(''); };
    recognition.onerror = (e: any) => {
      if (e.error !== 'aborted') toast.error('Microphone error: ' + e.error);
      setIsListening(false);
      setInterimText('');
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm text-muted-foreground mb-3 block">Assembly Section</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => onSectionChange(s.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-all border ${
                section === s.id
                  ? 'bg-primary/15 border-primary text-primary'
                  : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/50'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm text-muted-foreground mb-3 block">Plans Reference</Label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Section</Label>
            <Input
              placeholder="e.g. 5"
              value={plansSection}
              onChange={(e) => onPlansSectionChange(e.target.value)}
              className="bg-secondary border-border font-mono"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Page</Label>
            <Input
              placeholder="e.g. 8"
              value={plansPage}
              onChange={(e) => onPlansPageChange(e.target.value)}
              className="bg-secondary border-border font-mono"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground/70 mb-1 block">Step</Label>
            <Input
              placeholder="e.g. 3"
              value={plansStep}
              onChange={(e) => onPlansStepChange(e.target.value)}
              className="bg-secondary border-border font-mono"
            />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm text-muted-foreground">Session Notes</Label>
          {SpeechRecognitionAPI && (
            <button
              type="button"
              onClick={toggleListening}
              title={isListening ? 'Stop recording' : 'Dictate notes'}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all ${
                isListening
                  ? 'border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : 'border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
              }`}
            >
              {isListening ? (
                <>
                  <span className="flex items-end gap-[3px] h-4">
                    {[0.4, 0.7, 1, 0.7, 0.4].map((scale, i) => (
                      <span
                        key={i}
                        className="w-[3px] rounded-full bg-red-500 animate-bounce"
                        style={{
                          height: `${scale * 100}%`,
                          animationDelay: `${i * 0.1}s`,
                          animationDuration: `${0.5 + i * 0.1}s`,
                        }}
                      />
                    ))}
                  </span>
                  <span className="text-xs font-medium">Stop</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span className="text-xs">Dictate</span>
                </>
              )}
            </button>
          )}
        </div>
        <Textarea
          placeholder="What did you work on? Any issues, rivets drilled, parts clecoed..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className={`bg-secondary border-border min-h-[80px] ${isListening ? 'border-red-500/50' : ''}`}
        />
        {interimText && (
          <p className="mt-1.5 text-xs text-muted-foreground italic px-1">{interimText}…</p>
        )}
      </div>

      {!demoMode && (
        <div>
          <Label className="text-sm text-muted-foreground mb-2 block">Photos</Label>
          <SessionImages
            sessionId={sessionId}
            imageUrls={pendingImageUrls}
            onImagesChange={onPendingImageUrlsChange}
            editable
          />
        </div>
      )}
    </div>
  );
}
