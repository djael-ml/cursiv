import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Code, Highlighter, Italic, Link2, Strikethrough } from 'lucide-react';

interface InlinePageInputProps {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  initialCaretOffset?: number | null;
  motionBlur?: boolean;
  smartTypography?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onChange: (nextValue: string, caretOffset: number) => void;
  onCursorChange?: (caretOffset: number) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
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

  const [caretOffset, setCaretOffset] = useState<number>(() =>
    initialCaretOffset !== null ? Math.min(value.length, Math.max(0, initialCaretOffset)) : value.length
  );
  const [justTypedIndex, setJustTypedIndex] = useState<number | null>(null);
  const [hasSelection, setHasSelection] = useState<boolean>(false);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isCaretMoving, setIsCaretMoving] = useState<boolean>(false);
  const [caretCoords, setCaretCoords] = useState<CaretCoords>({
    x: 0,
    y: 2,
    height: 22,
    visible: true,
  });

  // Auto-focus when block becomes active and position caret accurately
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      const el = textareaRef.current;
      el.focus({ preventScroll: true });
      const targetPos =
        initialCaretOffset !== null
          ? Math.min(el.value.length, Math.max(0, initialCaretOffset))
          : el.value.length;
      el.setSelectionRange(targetPos, targetPos);
      setCaretOffset(targetPos);
    }
  }, [autoFocus, initialCaretOffset]);

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

  // Auto-resize textarea height to exact content height & clamp caret if prefix was stripped
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 26)}px`;
    if (caretOffset > value.length) {
      setCaretOffset(value.length);
      el.setSelectionRange(value.length, value.length);
    }
  }, [value, caretOffset]);

  // Measure exact sub-pixel (x, y, height) of caret in mirror layer for Word smooth gliding cursor
  const updateCaretPosition = () => {
    const el = textareaRef.current;
    const mirror = mirrorRef.current;
    const marker = markerRef.current;
    if (!el || !mirror || !marker) return;

    const selStart = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? 0;
    setCaretOffset(selStart);
    setHasSelection(selStart !== selEnd);
    onCursorChange?.(selStart);

    if (motionBlur) {
      setIsCaretMoving(true);
      if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
      motionTimerRef.current = window.setTimeout(() => setIsCaretMoving(false), 90);
    }

    requestAnimationFrame(() => {
      if (!mirrorRef.current || !markerRef.current) return;
      const mirrorRect = mirrorRef.current.getBoundingClientRect();
      const markerRect = markerRef.current.getBoundingClientRect();
      const computedLineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 24;
      const caretH = Math.max(18, Math.min(42, computedLineHeight * 0.82));
      const yOffset = Math.max(0, (computedLineHeight - caretH) / 2);

      setCaretCoords({
        x: Math.max(0, markerRect.left - mirrorRect.left),
        y: Math.max(0, markerRect.top - mirrorRect.top + yOffset),
        height: caretH,
        visible: true,
      });
    });
  };

  useLayoutEffect(() => {
    updateCaretPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, caretOffset]);

  const wrapSelectionWith = (prefix: string, suffix = prefix) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return;
    const selected = value.slice(start, end);
    const wrapped = `${prefix}${selected}${suffix}`;
    const nextVal = value.slice(0, start) + wrapped + value.slice(end);
    const nextEnd = start + wrapped.length;
    onChange(nextVal, nextEnd);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
      updateCaretPosition();
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
        }}
      >
        <span>{beforeCaretText}</span>
        <span ref={markerRef} className="inline-block w-0 overflow-hidden">
          &#8203;
        </span>
        <span>{afterCaretText || ' '}</span>
      </div>

      {/* 2. Visible Direct-on-Page Formatted Layer (Zero Box, Zero Duplicate) */}
      <div
        aria-hidden="true"
        className="pointer-events-none relative z-10 whitespace-pre-wrap break-words min-h-[1.6em]"
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
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

      {/* 3. Microsoft Word Smooth-Gliding Caret (with optional Kinetic Motion Blur) */}
      {isFocused && !hasSelection && (
        <div
          aria-hidden="true"
          className={`cursiv-word-caret ${
            motionBlur && isCaretMoving ? 'cursiv-word-caret-motion-blur' : ''
          } pointer-events-none absolute left-0 top-0 z-20`}
          style={{
            height: `${caretCoords.height}px`,
            transform: `translate3d(${caretCoords.x}px, ${caretCoords.y}px, 0)`,
          }}
        />
      )}

      {/* 4. Transparent Native Input Overlay (Handles Typing, IME, Smart Paste & Mouse Selection) */}
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onFocus={() => {
          setIsFocused(true);
          updateCaretPosition();
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
              setCaretOffset(nextPos);
              onChange(nextVal, nextPos);
              requestAnimationFrame(() => {
                el.setSelectionRange(nextPos, nextPos);
                updateCaretPosition();
              });
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
            nextVal = transformed.text;
            nextPos = transformed.caret;
          }
          setCaretOffset(nextPos);
          onChange(nextVal, nextPos);
        }}
        onSelect={updateCaretPosition}
        onKeyUp={updateCaretPosition}
        onMouseUp={updateCaretPosition}
        onClick={updateCaretPosition}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          requestAnimationFrame(updateCaretPosition);
        }}
        className="no-export cursiv-transparent-textarea absolute inset-0 z-30 w-full h-full bg-transparent border-0 outline-none resize-none overflow-hidden p-0 m-0"
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
        }}
      />
    </div>
  );
};
