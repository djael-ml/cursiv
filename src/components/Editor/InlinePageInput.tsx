import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Code, Highlighter, Italic, Link2, Strikethrough } from 'lucide-react';

export interface SelectionRangeSpec {
  start: number;
  end: number;
  direction?: 'forward' | 'backward' | 'none';
}

export interface PendingMousePoint {
  clientX: number;
  clientY: number;
  seq: number;
}

interface InlinePageInputProps {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  initialCaretOffset?: number | null;
  initialSelection?: SelectionRangeSpec | null;
  pendingMouseDownPoint?: PendingMousePoint | null;
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

interface ToolbarCoords {
  x: number;
  y: number;
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
 * Resolves the exact character index (0..textLength) inside `hitTestDiv`'s single Text node
 * at viewport coordinates `(clientX, clientY)`. Clamps coordinates to `hitTestDiv` bounds so
 * dragging into the outer page margins still smoothly selects to the start/end of the line.
 */
function getCharOffsetFromPoint(
  hitTestDiv: HTMLDivElement,
  textarea: HTMLTextAreaElement,
  clientX: number,
  clientY: number,
  textLength: number
): number {
  const textNode = hitTestDiv.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    return textLength;
  }

  const rect = hitTestDiv.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return textLength;
  }

  const clampedX = Math.max(rect.left + 1, Math.min(rect.right - 1, clientX));
  const clampedY = Math.max(rect.top + 1, Math.min(rect.bottom - 1, clientY));

  const prevTextareaPE = textarea.style.pointerEvents;
  textarea.style.pointerEvents = 'none';
  hitTestDiv.style.pointerEvents = 'auto';

  let resolvedOffset: number | null = null;
  try {
    const docAny = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const range = docAny.caretRangeFromPoint?.(clampedX, clampedY);
    if (range && hitTestDiv.contains(range.startContainer)) {
      if (range.startContainer === textNode) {
        resolvedOffset = Math.min(textLength, Math.max(0, range.startOffset));
      } else if (range.startContainer === hitTestDiv) {
        resolvedOffset = range.startOffset === 0 ? 0 : textLength;
      }
    }
  } catch {
    resolvedOffset = null;
  } finally {
    hitTestDiv.style.pointerEvents = 'none';
    textarea.style.pointerEvents = prevTextareaPE;
  }

  return resolvedOffset ?? textLength;
}

export const InlinePageInput: React.FC<InlinePageInputProps> = ({
  value,
  placeholder,
  multiline = true,
  autoFocus = true,
  initialCaretOffset = null,
  initialSelection = null,
  pendingMouseDownPoint = null,
  externalCaretVersion = 0,
  smartTypography = true,
  className = '',
  style,
  onChange,
  onCursorChange,
  onKeyDown,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hitTestRef = useRef<HTMLDivElement | null>(null);
  const pendingSelectionRef = useRef<SelectionRangeSpec | null>(null);
  const handledMouseSeqRef = useRef<number | null>(null);
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

  const hasSelection = selRange.start !== selRange.end;
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [toolbarCoords, setToolbarCoords] = useState<ToolbarCoords>({ x: 0, y: 0 });

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

  // Measure selection bounding box inside hitTestRef's single Text node for the floating mini toolbar
  const measureSelectionToolbarCoords = useCallback(
    (start: number, end: number) => {
      const hitTest = hitTestRef.current;
      if (!hitTest || start === end) return;
      const textNode = hitTest.firstChild;
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

      try {
        const maxLen = textNode.textContent?.length ?? 0;
        const range = document.createRange();
        range.setStart(textNode, Math.min(maxLen, Math.max(0, start)));
        range.setEnd(textNode, Math.min(maxLen, Math.max(0, end)));
        const selRect = range.getBoundingClientRect();
        const boxRect = hitTest.getBoundingClientRect();
        if (selRect.width === 0 && selRect.height === 0) return;

        const nextX = Math.max(0, Math.min(boxRect.width - 180, selRect.left - boxRect.left));
        const nextY = Math.max(0, selRect.top - boxRect.top);
        setToolbarCoords({ x: nextX, y: nextY });
      } catch {
        // Ignore range errors
      }
    },
    []
  );

  // Lock textarea height to hitTestRef's natural offsetHeight on every render and resize (without ever setting height='0px'!)
  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    const hitTest = hitTestRef.current;
    if (!el || !hitTest) return;
    const targetH = Math.max(hitTest.offsetHeight, 26);
    if (el.style.height !== `${targetH}px`) {
      el.style.height = `${targetH}px`;
    }
    if (el.scrollTop !== 0) {
      el.scrollTop = 0;
    }
    if (el.scrollLeft !== 0) {
      el.scrollLeft = 0;
    }
  }, []);

  useLayoutEffect(() => {
    syncTextareaHeight();
  });

  useEffect(() => {
    const hitTest = hitTestRef.current;
    if (!hitTest || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      syncTextareaHeight();
    });
    ro.observe(hitTest);
    return () => ro.disconnect();
  }, [syncTextareaHeight]);

  // Handle mouseDown activation (click placement AND live left-to-right / right-to-left drag selection)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    const hitTest = hitTestRef.current;
    if (!el || !hitTest || !pendingMouseDownPoint) return;
    if (handledMouseSeqRef.current === pendingMouseDownPoint.seq) return;
    handledMouseSeqRef.current = pendingMouseDownPoint.seq;

    syncTextareaHeight();
    el.focus({ preventScroll: true });
    setIsFocused(true);

    const anchorOffset = getCharOffsetFromPoint(
      hitTest,
      el,
      pendingMouseDownPoint.clientX,
      pendingMouseDownPoint.clientY,
      el.value.length
    );

    el.setSelectionRange(anchorOffset, anchorOffset, 'none');
    setSelRange({ start: anchorOffset, end: anchorOffset, direction: 'none' });
    onCursorChangeRef.current?.(anchorOffset);

    const onWindowMouseMove = (moveEvent: MouseEvent) => {
      const curEl = textareaRef.current;
      const curHitTest = hitTestRef.current;
      if (!curEl || !curHitTest) return;

      const focusOffset = getCharOffsetFromPoint(
        curHitTest,
        curEl,
        moveEvent.clientX,
        moveEvent.clientY,
        curEl.value.length
      );
      const start = Math.min(anchorOffset, focusOffset);
      const end = Math.max(anchorOffset, focusOffset);
      const dir: 'forward' | 'backward' | 'none' =
        focusOffset < anchorOffset
          ? 'backward'
          : focusOffset > anchorOffset
          ? 'forward'
          : 'none';

      if (document.activeElement !== curEl) {
        curEl.focus({ preventScroll: true });
      }
      curEl.setSelectionRange(start, end, dir);
      setSelRange({ start, end, direction: dir });
      onCursorChangeRef.current?.(focusOffset);
      if (start !== end) {
        measureSelectionToolbarCoords(start, end);
      }
    };

    const onWindowMouseUp = () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      const curEl = textareaRef.current;
      if (curEl) {
        const s = curEl.selectionStart ?? 0;
        const e = curEl.selectionEnd ?? 0;
        if (s !== e) {
          measureSelectionToolbarCoords(s, e);
        }
      }
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [pendingMouseDownPoint, measureSelectionToolbarCoords, syncTextareaHeight]);

  // Mount-only (or explicit externalCaretVersion) focus and selection placement when activated via keyboard
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !autoFocus) return;
    if (
      pendingMouseDownPoint &&
      handledMouseSeqRef.current === pendingMouseDownPoint.seq
    ) {
      return;
    }

    syncTextareaHeight();
    el.focus({ preventScroll: true });
    setIsFocused(true);

    if (initialSelection) {
      const s = Math.min(el.value.length, Math.max(0, initialSelection.start));
      const e = Math.min(el.value.length, Math.max(0, initialSelection.end));
      const start = Math.min(s, e);
      const end = Math.max(s, e);
      const dir = initialSelection.direction || 'forward';
      el.setSelectionRange(start, end, dir);
      setSelRange({ start, end, direction: dir });
      if (start !== end) {
        measureSelectionToolbarCoords(start, end);
      }
      return;
    }

    const targetPos =
      initialCaretOffset !== null
        ? Math.min(el.value.length, Math.max(0, initialCaretOffset))
        : el.value.length;
    el.setSelectionRange(targetPos, targetPos, 'none');
    setSelRange({ start: targetPos, end: targetPos, direction: 'none' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, externalCaretVersion]);

  // Apply any pending programmatic selection (e.g. Tab, Auto-Pair, Ctrl+B/I/K) synchronously on value update
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    if (pendingSelectionRef.current) {
      const pending = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      const clampedStart = Math.min(value.length, Math.max(0, pending.start));
      const clampedEnd = Math.min(value.length, Math.max(clampedStart, pending.end));
      el.setSelectionRange(clampedStart, clampedEnd, pending.direction || 'forward');
      if (clampedStart !== clampedEnd) {
        measureSelectionToolbarCoords(clampedStart, clampedEnd);
      }
    }
  }, [value, measureSelectionToolbarCoords]);

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

    if (selStart !== selEnd) {
      measureSelectionToolbarCoords(selStart, selEnd);
    }
  }, [measureSelectionToolbarCoords]);

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

  return (
    <div
      className={`relative grid w-full ${className}`}
      style={{
        gridTemplateColumns: 'minmax(0, 1fr)',
        ...style,
      }}
    >
      {/* Contextual Mini Selection Toolbar right above selected text */}
      {isFocused && hasSelection && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          style={{
            left: `${Math.max(0, toolbarCoords.x)}px`,
            top: `${Math.max(-40, toolbarCoords.y - 40)}px`,
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

      {/* 1. Grid Auto-Sizer & Single-Text-Node Hit-Test Layer (100% identical metrics to native textarea) */}
      <div
        ref={hitTestRef}
        aria-hidden="true"
        className="pointer-events-none select-none whitespace-pre-wrap break-words min-h-[1.6em] m-0 p-0 border-0"
        style={{
          gridArea: '1 / 1 / 2 / 2',
          opacity: 0,
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          fontStyle: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
          tabSize: 4,
        }}
      >
        {`${value}\u200b`}
      </div>

      {/* 2. Direct Native Visible Textarea (100% Native Caret, 100% Native Click & Drag Selection, Zero Misalignment) */}
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        rows={1}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onScroll={(e) => {
          if (e.currentTarget.scrollTop !== 0) {
            e.currentTarget.scrollTop = 0;
          }
          if (e.currentTarget.scrollLeft !== 0) {
            e.currentTarget.scrollLeft = 0;
          }
        }}
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
        className="no-export cursiv-native-textarea relative z-20 w-full bg-transparent border-0 outline-none resize-none overflow-hidden p-0 m-0"
        style={{
          gridArea: '1 / 1 / 2 / 2',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          fontStyle: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
          tabSize: 4,
        }}
      />
    </div>
  );
};
