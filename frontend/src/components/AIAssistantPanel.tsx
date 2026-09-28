/**
 * Context-aware AI reporting assistant (human-in-the-loop).
 * Flow: study context → correct template → clinician notes → polished draft
 * → clinician reviews → Apply to editor → normal finalize flow.
 * The AI never sees images and never finalizes anything by itself.
 */
import React, { useEffect, useState } from 'react';
import { api, AIStudyContext, AIReportTemplate, AIPreviousReport } from '../api/apiClient';
import { Sparkles, Loader2, AlertCircle, ChevronDown, ClipboardCheck, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

interface Props {
  patientId: string;
  requestId: string;
  currentFindings: string;
  onApply: (findings: string, impression: string) => void;
}

/** Strip light Markdown so pasted text reads cleanly in the rich editor. */
function toPlain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,3}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
}

function splitPolished(markdown: string): { findings: string; impression: string } {
  const text = markdown || '';
  const impMatch = text.split(/##\s*impression/i);
  if (impMatch.length >= 2) {
    const findings = impMatch[0].replace(/^##\s*findings/i, '').trim();
    return { findings: toPlain(findings), impression: toPlain(impMatch.slice(1).join('\n')) };
  }
  return { findings: toPlain(text), impression: '' };
}

export default function AIAssistantPanel({ patientId, requestId, currentFindings, onApply }: Props) {
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<AIStudyContext | null>(null);
  const [template, setTemplate] = useState<AIReportTemplate | null>(null);
  const [skeleton, setSkeleton] = useState<string | null>(null);
  const [modelDisabled, setModelDisabled] = useState(false);
  const [previous, setPrevious] = useState<AIPreviousReport[]>([]);
  const [showPrevious, setShowPrevious] = useState(false);
  const [notes, setNotes] = useState(currentFindings || '');
  const [includePrevious, setIncludePrevious] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [polished, setPolished] = useState<{ findings: string; impression: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setPolished(null);
        const [ctx, draft, prev] = await Promise.all([
          api.ai.context(patientId, requestId),
          api.ai.draft(patientId, requestId),
          api.ai.previousReports(patientId, requestId, 5).catch(() => [] as AIPreviousReport[]),
        ]);
        if (cancelled) return;
        setContext(ctx);
        setTemplate(draft.template);
        setSkeleton(draft.skeleton);
        setModelDisabled(draft.modelDisabled);
        setPrevious(prev);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'AI assistant unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, requestId]);

  // Keep notes in sync if the editor already has findings when the panel opens
  useEffect(() => {
    if (currentFindings && !notes) setNotes(currentFindings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFindings]);

  const handlePolish = async () => {
    if (!notes.trim()) {
      toast.error('Enter your observation notes first — the AI only organizes what you provide.');
      return;
    }
    try {
      setPolishing(true);
      setError(null);
      const res = await api.ai.polish(patientId, requestId, notes.trim(), includePrevious);
      setPolished(splitPolished(res.polished));
      toast.success('Polished draft ready — review before applying');
    } catch (err: any) {
      const msg = err.message || 'Polishing failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setPolishing(false);
    }
  };

  const handleApply = () => {
    if (!polished) return;
    onApply(polished.findings, polished.impression);
    toast.success('Applied to editor — review and finalize as usual');
  };

  if (loading) {
    return (
      <div className="glass-panel p-6 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <p className="text-xs text-muted">Understanding study context...</p>
      </div>
    );
  }

  if (error && !context) {
    return (
      <div className="glass-panel p-6 flex items-start gap-2.5 text-xs text-red-400">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>AI assistant unavailable: {error}</span>
      </div>
    );
  }

  const age = context?.patientAge ?? '?';
  const sex = context?.patientSex ?? '';

  return (
    <div className="glass-panel p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          AI Reporting Assistant
        </h2>
        {template && (
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded border',
            template.matchLevel === 'exact'
              ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
              : 'text-amber-400 border-amber-400/30 bg-amber-400/10'
          )}>
            {template.matchLevel === 'exact' ? 'Exact template' : 'Closest template'}
          </span>
        )}
      </div>

      {context && (
        <div className="text-[11px] text-muted leading-relaxed p-3 rounded-xl bg-white/[0.03] border border-white/10">
          <span className="text-white/90 font-semibold">
            {age}-year-old {sex} · {context.modality} · {context.examination}
          </span>
          {context.clinicalHistory && <div className="mt-1">History: {context.clinicalHistory}</div>}
        </div>
      )}

      {template && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
            Report structure: {template.title}
          </p>
          {skeleton ? (
            <pre className="text-[11px] whitespace-pre-wrap text-white/80 p-3 rounded-xl bg-black/30 border border-white/10 max-h-48 overflow-y-auto">{skeleton}</pre>
          ) : (
            <ul className="space-y-1.5">
              {template.sections.map((s) => (
                <li key={s.key} className="text-[11px] p-2 rounded-lg bg-white/[0.03] border border-white/10">
                  <span className="text-white/90 font-semibold">{s.title}</span>
                  <span className="text-muted"> — {s.placeholder}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-muted mt-2 italic">{template.impressionGuidance}</p>
        </div>
      )}

      {previous.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPrevious(!showPrevious)}
            className="text-[11px] font-semibold text-muted hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showPrevious && 'rotate-180')} />
            {previous.length} previous report{previous.length > 1 ? 's' : ''} as background
          </button>
          {showPrevious && (
            <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
              {previous.map((p) => (
                <div key={p.id} className="text-[11px] p-2 rounded-lg bg-white/[0.03] border border-white/10">
                  <span className="text-white/80 font-semibold">{p.impression}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5 block">
          Your observation notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={'e.g.\nUterus normal size.\nEndometrium 7 mm.\nBoth ovaries normal.\nNo free fluid.'}
          rows={5}
          className="w-full bg-black/30 border border-white/15 focus:border-primary rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none transition-colors"
        />
        {previous.length > 0 && (
          <label className="mt-2 flex items-center gap-2 text-[11px] text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={includePrevious}
              onChange={(e) => setIncludePrevious(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            Use previous reports as background
          </label>
        )}
        <button
          type="button"
          onClick={handlePolish}
          disabled={polishing || modelDisabled || !notes.trim()}
          title={modelDisabled ? 'AI model not configured — ask admin to set GEMINI_API_KEY' : undefined}
          className="mt-3 glass-btn bg-primary text-black font-bold w-full py-2.5 flex items-center justify-center gap-2 hover:bg-primary/85 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer text-xs"
        >
          {polishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>{polishing ? 'Polishing...' : 'Polish into professional report'}</span>
        </button>
        {modelDisabled && (
          <p className="mt-2 text-[10px] text-amber-400/90 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
            AI model not configured — template structure above still works; polishing needs GEMINI_API_KEY on the backend.
          </p>
        )}
        {error && (
          <p className="mt-2 text-[10px] text-red-400 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            {error}
          </p>
        )}
      </div>

      {polished && (
        <div className="space-y-3 p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Draft for your review</p>
          <div className="text-[11px] text-white/85 whitespace-pre-wrap max-h-56 overflow-y-auto">
            {polished.findings}
            {polished.impression && `\n\nImpression:\n${polished.impression}`}
          </div>
          <button
            type="button"
            onClick={handleApply}
            className="glass-btn bg-emerald-400 text-black font-bold w-full py-2.5 flex items-center justify-center gap-2 hover:bg-emerald-300 transition-all active:scale-[0.99] cursor-pointer text-xs"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Apply to editor (you still review & finalize)</span>
          </button>
        </div>
      )}
    </div>
  );
}
