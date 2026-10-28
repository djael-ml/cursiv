import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Code, Highlighter, Italic, Link2, Strikethrough } from 'lucide-react';

export interface SelectionRangeSpec {
  start: number;
  end: number;
  direction?: 'forward' | 'backward' | 'none';
}

interface InlinePageInputProps {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  initialCaretOffset?: number | null;
  initialSelection?: SelectionRangeSpec | null;
  externalCaretVersion?: number;
  motionBlur?: boolean;
  smartTypography?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onChange: (nextValue: string, caretOffset: number) => void;
  onCursorChange?: (caretOffset: number) => void;
  onKeyDown?: (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    setProgrammaticSelection: (
      start: number,
      end: number,
      direction?: 'forward' | 'backward' | 'none'
    ) => void
  ) => void;
}

interface CaretCoords {
  x: number;
  y: number;
  height: number;
  visible: boolean;
}

function applySmartTypographyTransforms(
  text: string,
  caret: number
): { text: string; caret: number } {
  const before = text.slice(0, caret);
  const after = text.slice(caret);

  const rules: Array<[RegExp, string]> = [
    [/\.\.\.$/, '…'],
    [/->$/, '→'],
    [/<-$/, '←'],
    [/=>$/, '⇒'],
    [/!=$/, '≠'],
    [/>=$/, '≥'],
    [/<=$/, '≤'],
    [/(^|\s)--(\s)$/, '$1—$2'],
  ];

  for (const [regex, replacement] of rules) {
    if (regex.test(before)) {
      const nextBefore = before.replace(regex, replacement);
      return {
        text: nextBefore + after,
        caret: nextBefore.length,
      };
    }
  }

  return { text, caret };
}

/**
 * Renders inline Markdown tokens with 1:1 identical character advance width
 * so the transparent textarea overlay and Word gliding caret stay 100% aligned,
 * while styling bold, italic, code, highlight, strikethrough, and subtle syntax markers.
 */
function renderMetricLockedMarkdown(
  text: string,
  caretOffset: number | null,
  justTypedIndex: number | null
): React.ReactNode {
  if (!text) return null;

  const pattern =
    /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|==[^=\n]+==|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\$[^$\n]+\$)/g;

  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  const renderCharRange = (
    slice: string,
    startOffset: number,
    extraClass = '',
    extraStyle?: React.CSSProperties
  ) => {
    if (
      justTypedIndex !== null &&
      justTypedIndex >= startOffset &&
      justTypedIndex < startOffset + slice.length
    ) {
      const rel = justTypedIndex - startOffset;
      const before = slice.slice(0, rel);
      const typedChar = slice[rel];
      const after = slice.slice(rel + 1);
      return (
        <span key={startOffset} className={extraClass} style={extraStyle}>
          {before}
          <span key={`glide-${justTypedIndex}-${typedChar}`} className="cursiv-char-glide">
            {typedChar}
          </span>
          {after}
        </span>
      );
    }
    return (
      <span key={startOffset} className={extraClass} style={extraStyle}>
        {slice}
      </span>
    );
  };

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIdx) {
      const plain = text.slice(lastIdx, match.index);
      nodes.push(renderCharRange(plain, lastIdx));
    }

    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    const isCursorInside =
      caretOffset !== null && caretOffset >= start && caretOffset <= end;
    const markerClass = isCursorInside ? 'opacity-45' : 'opacity-25';

    if (raw.startsWith('**') && raw.endsWith('**') && raw.length > 4) {
      nodes.push(
        <span key={start}>
          <span className={markerClass}>**</span>
          {renderCharRange(raw.slice(2, -2), start + 2, '', {
            textShadow: '0.028em 0 0 currentColor, -0.015em 0 0 currentColor',
          })}
          <span className={markerClass}>**</span>
        </span>
      );
    } else if (raw.startsWith('*') && raw.endsWith('*') && raw.length > 2) {
      nodes.push(
        <span key={start}>
          <span className={markerClass}>*</span>
          {renderCharRange(raw.slice(1, -1), start + 1, 'italic')}
          <span className={markerClass}>*</span>
        </span>
      );
    } else if (raw.startsWith('~~') && raw.endsWith('~~') && raw.length > 4) {
      nodes.push(
        <span key={start}>
          <span className={markerClass}>~~</span>
          {renderCharRange(raw.slice(2, -2), start + 2, 'line-through opacity-75')}
          <span className={markerClass}>~~</span>
        </span>
      );
    } else if (raw.startsWith('==') && raw.endsWith('==') && raw.length > 4) {
      nodes.push(
        <span key={start}>
          <span className={markerClass}>==</span>
          {renderCharRange(raw.slice(2, -2), start + 2, 'rounded-xs', {
            backgroundColor: 'var(--highlight-bg)',
          })}
          <span className={markerClass}>==</span>
        </span>
      );
    } else if (raw.startsWith('`') && raw.endsWith('`') && raw.length > 2) {
      nodes.push(
        <span key={start}>
          <span className={markerClass}>`</span>
          {renderCharRange(raw.slice(1, -1), start + 1, 'rounded-xs', {
            backgroundColor: 'var(--code-bg-color)',
            color: 'var(--primary-color)',
          })}
          <span className={markerClass}>`</span>
        </span>
      );
    } else {
      nodes.push(
        renderCharRange(raw, start, '', {
          color: 'var(--primary-color)',
        })
      );
    }

    lastIdx = end;
  }

  if (lastIdx < text.length) {
    nodes.push(renderCharRange(text.slice(lastIdx), lastIdx));
  }

  return nodes;
}

export const InlinePageInput: React.FC<InlinePageInputProps> = ({
  value,
  placeholder,
  multiline = true,
  autoFocus = true,
  initialCaretOffset = null,
  initialSelection = null,
  externalCaretVersion = 0,
  motionBlur = true,
  smartTypography = true,
  className = '',
  style,
  onChange,
  onCursorChange,
  onKeyDown,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const prevValueRef = useRef<string>(value);
  const motionTimerRef = useRef<number | null>(null);
  const pendingSelectionRef = useRef<SelectionRangeSpec | null>(null);
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;

  const [selRange, setSelRange] = useState<SelectionRangeSpec>(() => {
    if (initialSelection) {
      const s = Math.min(value.length, Math.max(0, initialSelection.start));
      const e = Math.min(value.length, Math.max(0, initialSelection.end));
      return {
        start: Math.min(s, e),
        end: Math.max(s, e),
        direction: initialSelection.direction || 'forward',
      };
    }
    const pos =
      initialCaretOffset !== null
        ? Math.min(value.length, Math.max(0, initialCaretOffset))
        : value.length;
    return { start: pos, end: pos, direction: 'none' };
  });

  const caretOffset =
    selRange.direction === 'backward' ? selRange.start : selRange.end;
  const hasSelection = selRange.start !== selRange.end;

  const [justTypedIndex, setJustTypedIndex] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isCaretMoving, setIsCaretMoving] = useState<boolean>(false);
  const [caretCoords, setCaretCoords] = useState<CaretCoords>({
    x: 0,
    y: 2,
    height: 22,
    visible: true,
  });

  const setProgrammaticSelection = useCallback(
    (
      start: number,
      end: number,
      direction: 'forward' | 'backward' | 'none' = 'forward'
    ) => {
      const s = Math.max(0, Math.min(start, end));
      const e = Math.max(s, Math.max(start, end));
      const spec: SelectionRangeSpec = { start: s, end: e, direction };
      pendingSelectionRef.current = spec;
      setSelRange(spec);
      const activePos = direction === 'backward' ? s : e;
      onCursorChangeRef.current?.(activePos);
    },
    []
  );

  // Mount-only (or explicit externalCaretVersion) focus and selection placement.
  // Never re-runs on normal cursor movement so mouse & Shift+Arrow selections are never collapsed!
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !autoFocus) return;
    el.focus({ preventScroll: true });

    if (initialSelection) {
      const s = Math.min(el.value.length, Math.max(0, initialSelection.start));
      const e = Math.min(el.value.length, Math.max(0, initialSelection.end));
      const start = Math.min(s, e);
      const end = Math.max(s, e);
      const dir = initialSelection.direction || 'forward';
      el.setSelectionRange(start, end, dir);
      setSelRange({ start, end, direction: dir });
      return;
    }

    const targetPos =
      initialCaretOffset !== null
        ? Math.min(el.value.length, Math.max(0, initialCaretOffset))
        : el.value.length;
    el.setSelectionRange(targetPos, targetPos);
    setSelRange({ start: targetPos, end: targetPos, direction: 'none' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, externalCaretVersion]);

  // Detect newly typed single character for Word-like character materialize animation
  useEffect(() => {
    if (value.length === prevValueRef.current.length + 1 && caretOffset > 0) {
      setJustTypedIndex(caretOffset - 1);
      const timer = window.setTimeout(() => setJustTypedIndex(null), 130);
      prevValueRef.current = value;
      return () => window.clearTimeout(timer);
    }
    prevValueRef.current = value;
  }, [value, caretOffset]);

  // Auto-resize textarea height ONLY when value changes, and apply any pending programmatic selection
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    if (pendingSelectionRef.current) {
      const pending = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      const clampedStart = Math.min(value.length, Math.max(0, pending.start));
      const clampedEnd = Math.min(value.length, Math.max(clampedStart, pending.end));
      el.setSelectionRange(clampedStart, clampedEnd, pending.direction || 'forward');
    }

    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 26)}px`;
  }, [value]);

  // Measure exact sub-pixel (x, y, height) of caret in mirror layer without mutating selection state
  const measureCaretDomCoords = useCallback(() => {
    const el = textareaRef.current;
    const mirror = mirrorRef.current;
    const marker = markerRef.current;
    if (!el || !mirror || !marker) return;

    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const computedLineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 24;
    const caretH = Math.max(18, Math.min(42, computedLineHeight * 0.82));
    const yOffset = Math.max(0, (computedLineHeight - caretH) / 2);

    const nextX = Math.max(0, markerRect.left - mirrorRect.left);
    const nextY = Math.max(0, markerRect.top - mirrorRect.top + yOffset);

    setCaretCoords((prev) => {
      if (
        Math.abs(prev.x - nextX) < 0.25 &&
        Math.abs(prev.y - nextY) < 0.25 &&
        Math.abs(prev.height - caretH) < 0.25 &&
        prev.visible
      ) {
        return prev;
      }
      return {
        x: nextX,
        y: nextY,
        height: caretH,
        visible: true,
      };
    });
  }, []);

  useLayoutEffect(() => {
    measureCaretDomCoords();
  }, [value, caretOffset, measureCaretDomCoords]);

  // Sync selection state from user interaction on the native <textarea>
  const syncSelectionFromDom = useCallback(() => {
    const el = textareaRef.current;
    if (!el || pendingSelectionRef.current) return;

    const selStart = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? 0;
    const dir = (el.selectionDirection || 'none') as 'forward' | 'backward' | 'none';
    const activeCaret = dir === 'backward' ? selStart : selEnd;

    setSelRange((prev) => {
      if (prev.start === selStart && prev.end === selEnd && prev.direction === dir) {
        return prev;
      }
      return { start: selStart, end: selEnd, direction: dir };
    });

    onCursorChangeRef.current?.(activeCaret);

    if (motionBlur) {
      setIsCaretMoving(true);
      if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
      motionTimerRef.current = window.setTimeout(() => setIsCaretMoving(false), 90);
    }

    requestAnimationFrame(measureCaretDomCoords);
  }, [motionBlur, measureCaretDomCoords]);

  const wrapSelectionWith = (prefix: string, suffix = prefix) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return;
    const selected = value.slice(start, end);
    const wrapped = `${prefix}${selected}${suffix}`;
    const nextVal = value.slice(0, start) + wrapped + value.slice(end);
    const nextStart = start + prefix.length;
    const nextEnd = end + prefix.length;
    setProgrammaticSelection(nextStart, nextEnd, 'forward');
    onChange(nextVal, nextEnd);
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
    });
  };

  const beforeCaretText = value.slice(0, caretOffset);
  const afterCaretText = value.slice(caretOffset);

  return (
    <div className={`relative w-full ${className}`} style={style}>
      {/* Contextual Mini Selection Toolbar right above selected text */}
      {isFocused && hasSelection && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            left: `${Math.max(0, Math.min(caretCoords.x, 320))}px`,
            top: `${Math.max(-38, caretCoords.y - 38)}px`,
            borderColor: 'var(--border-color)',
            color: 'var(--text-color)',
          }}
          className="no-print no-export cursiv-popup-anim cursiv-glass-toolbar absolute z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-lg shadow-xl border text-xs"
        >
          <button
            type="button"
            onClick={() => wrapSelectionWith('**')}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Gras (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wrapSelectionWith('*')}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Italique (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wrapSelectionWith('~~')}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Barré"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wrapSelectionWith('==')}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Surligner"
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wrapSelectionWith('`')}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Code inline"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => wrapSelectionWith('[', '](https://)')}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
            title="Lien (Ctrl+K)"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Hidden Mirror Layer for Sub-Pixel Word Gliding Caret Measurement */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-wrap break-words overflow-hidden"
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
          tabSize: 4,
        }}
      >
        <span>{beforeCaretText}</span>
        <span ref={markerRef} className="inline-block w-0 overflow-hidden">
          &#8203;
        </span>
        <span>{afterCaretText || ' '}</span>
      </div>

      {/* 2. Transparent Native Input Layer (z-10: receives all mouse/keyboard events and paints ::selection underneath z-20 text) */}
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onFocus={() => {
          setIsFocused(true);
          syncSelectionFromDom();
        }}
        onBlur={() => setIsFocused(false)}
        onPaste={(e) => {
          const el = textareaRef.current;
          if (!el) return;
          const start = el.selectionStart ?? 0;
          const end = el.selectionEnd ?? 0;
          if (start !== end) {
            const pasted = e.clipboardData.getData('text/plain').trim();
            if (/^https?:\/\/\S+$/i.test(pasted)) {
              e.preventDefault();
              const selected = value.slice(start, end);
              const linked = `[${selected}](${pasted})`;
              const nextVal = value.slice(0, start) + linked + value.slice(end);
              const nextPos = start + linked.length;
              setProgrammaticSelection(nextPos, nextPos, 'forward');
              onChange(nextVal, nextPos);
            }
          }
        }}
        onChange={(e) => {
          let nextVal = e.target.value;
          if (!multiline) {
            nextVal = nextVal.replace(/\n/g, ' ');
          }
          let nextPos = e.target.selectionStart ?? nextVal.length;
          if (smartTypography && nextVal.length >= value.length) {
            const transformed = applySmartTypographyTransforms(nextVal, nextPos);
            if (transformed.text !== nextVal) {
              nextVal = transformed.text;
              nextPos = transformed.caret;
              setProgrammaticSelection(nextPos, nextPos, 'none');
            }
          }
          if (!pendingSelectionRef.current) {
            setSelRange({ start: nextPos, end: nextPos, direction: 'none' });
          }
          onChange(nextVal, nextPos);
        }}
        onSelect={syncSelectionFromDom}
        onKeyUp={syncSelectionFromDom}
        onMouseUp={syncSelectionFromDom}
        onMouseMove={(e) => {
          if (e.buttons === 1) syncSelectionFromDom();
        }}
        onClick={syncSelectionFromDom}
        onKeyDown={(e) => {
          onKeyDown?.(e, setProgrammaticSelection);
          if (!e.defaultPrevented) {
            requestAnimationFrame(syncSelectionFromDom);
          }
        }}
        className="no-export cursiv-transparent-textarea absolute inset-0 z-10 w-full h-full bg-transparent border-0 outline-none resize-none overflow-hidden p-0 m-0"
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
          tabSize: 4,
        }}
      />

      {/* 3. Visible Direct-on-Page Formatted Layer (z-20 with pointer-events-none so text sits cleanly above ::selection) */}
      <div
        aria-hidden="true"
        className="pointer-events-none relative z-20 whitespace-pre-wrap break-words min-h-[1.6em]"
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
          tabSize: 4,
        }}
      >
        {value ? (
          renderMetricLockedMarkdown(value, caretOffset, justTypedIndex)
        ) : (
          <span
            className="opacity-30 select-none font-normal"
            style={{ color: 'var(--meta-content-color)' }}
          >
            {placeholder || ''}
          </span>
        )}
      </div>

      {/* 4. Microsoft Word Smooth-Gliding Caret (with optional Kinetic Motion Blur) */}
      {isFocused && !hasSelection && (
        <div
          aria-hidden="true"
          className={`cursiv-word-caret ${
            motionBlur && isCaretMoving ? 'cursiv-word-caret-motion-blur' : ''
          } pointer-events-none absolute left-0 top-0 z-30`}
          style={{
            height: `${caretCoords.height}px`,
            transform: `translate3d(${caretCoords.x}px, ${caretCoords.y}px, 0)`,
          }}
        />
      )}
    </div>
  );
};
