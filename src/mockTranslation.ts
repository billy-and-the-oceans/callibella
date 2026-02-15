import type { InteractiveDoc, Span, TranslationJob, TranslationSegment, Variant } from './bokaTypes';
import type { RegisterId } from './registers';

function split_into_segments(text: string): string[] {
  const t = text.trim();
  if (!t) return [];

  const rough = t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rough.length > 0) return rough;
  return [t];
}

function make_variants(span_id: string, source: string): Variant[] {
  const mk = (register: RegisterId, text: string, note?: string, difficulty?: number): Variant => ({
    id: `${span_id}-${register}`,
    register,
    text,
    note,
    difficulty,
  });

  const base = source.trim();
  const cap = base ? base[0].toUpperCase() + base.slice(1) : base;

  return [
    mk('neutral', base, undefined, 1),
    mk('formal', cap, 'Slightly elevated', 2),
    mk('casual', base.toLowerCase(), 'Relaxed', 1),
    mk('colloquial', `${base}…`, 'Conversational', 2),
    mk('literary', `${cap}`, 'Tone shift', 3),
    mk('vulgar', `${base} (raw)`, 'Restricted', 4),
  ];
}

function inject_single_span(segment_id: string, base_text: string): { tokens: string[]; span: Span } {
  const words = base_text.split(/\s+/).filter(Boolean);
  const chosen = words.length > 0 ? words[Math.min(2, words.length - 1)] : base_text;
  const span_id = `span-${segment_id}`;

  const idx = base_text.indexOf(chosen);
  if (idx < 0 || !chosen) {
    return {
      tokens: [base_text],
      span: {
        id: span_id,
        sourceText: base_text,
        variants: make_variants(span_id, base_text),
        activeVariantIndex: 0,
      },
    };
  }

  const before = base_text.slice(0, idx);
  const after = base_text.slice(idx + chosen.length);

  return {
    tokens: [before, after],
    span: {
      id: span_id,
      sourceText: chosen,
      variants: make_variants(span_id, chosen),
      activeVariantIndex: 0,
    },
  };
}

export function start_mock_translation(args: {
  storyText: string;
  onJob: (job: TranslationJob) => void;
  onDoc: (doc: InteractiveDoc | null) => void;
}): { cancel: () => void } {
  const { storyText, onJob, onDoc } = args;

  const seg_texts = split_into_segments(storyText);
  const segs: TranslationSegment[] = seg_texts.map((s, i) => ({
    id: `seg-${i + 1}`,
    source: s,
    baseText: undefined,
    baseStage: 'pending',
    spanStage: 'pending',
    variantCount: 0,
  }));

  const job_id = `job-${Date.now()}`;
  let cancelled = false;

  const timers: Array<number> = [];

  let job: TranslationJob = {
    id: job_id,
    segments: segs,
    ready: false,
  };

  onDoc(null);
  onJob(job);

  const update_job = (mut: (j: TranslationJob) => void) => {
    if (cancelled) return;
    const next: TranslationJob = {
      ...job,
      segments: job.segments.map((s) => ({ ...s })),
    };
    mut(next);
    job = next;
    onJob(next);
  };

  segs.forEach((_, i) => {
    timers.push(
      window.setTimeout(() => {
        update_job((j) => {
          const seg = j.segments[i];
          if (!seg) return;
          seg.baseStage = 'ready';
          seg.baseText = `«${seg.source}»`;
        });
      }, 500 + i * 650),
    );
  });

  timers.push(
    window.setTimeout(() => {
      update_job((j) => {
        j.segments.forEach((seg) => {
          seg.spanStage = 'ready';
          seg.variantCount = 6;
        });
        j.ready = true;
      });

      const tokens: Array<{ type: 'text'; value: string } | { type: 'span'; spanId: string }> = [];
      const spans: Record<string, Span> = {};

      job.segments.forEach((seg, i) => {
        const base = seg.baseText ?? seg.source;
        const { tokens: around, span } = inject_single_span(seg.id, base);
        spans[span.id] = span;

        tokens.push({ type: 'text', value: around[0] });
        tokens.push({ type: 'span', spanId: span.id });
        tokens.push({ type: 'text', value: around[1] });

        if (i < job.segments.length - 1) {
          tokens.push({ type: 'text', value: '\n\n' });
        }
      });

      onDoc({ tokens, spans });
    }, 500 + segs.length * 650 + 600),
  );

  return {
    cancel: () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    },
  };
}
