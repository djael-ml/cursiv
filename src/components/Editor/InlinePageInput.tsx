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
  endX?: number;
  endY?: number;
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

interface CaretCoords {
  x: number;
  y: number;
  height: number;
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
 * Measures the exact sub-pixel (x, y, height) of the caret at `caretIndex` directly from
 * `hitTestDiv`'s single unbroken Text node (`${text}\u200b`) using `document.createRange()`.
 * Because no DOM elements are ever injected into `hitTestDiv`, word wrapping, tab stops,
 * and line baselines remain 100% identical to the native `<textarea>`.
 */
function getCaretRectInHitTest(
  hitTestDiv: HTMLDivElement,
  textarea: HTMLTextAreaElement,
  text: string,
  caretIndex: number
): CaretCoords {
  const boxRect = hitTestDiv.getBoundingClientRect();
  const scaleX = hitTestDiv.offsetWidth > 0 ? boxRect.width / hitTestDiv.offsetWidth : 1;
  const scaleY = hitTestDiv.offsetHeight > 0 ? boxRect.height / hitTestDiv.offsetHeight : 1;
  const computedStyle = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(computedStyle.lineHeight) || 26;
  const fontSize = parseFloat(computedStyle.fontSize) || 16;
  const defaultCaretH = Math.max(16, Math.min(44, fontSize * 1.22));
  const defaultTopPad = Math.max(0, (lineHeight - defaultCaretH) / 2);

  const textNode = hitTestDiv.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    return { x: 0, y: defaultTopPad, height: defaultCaretH };
  }

  const L = text.length;
  const safeOffset = Math.max(0, Math.min(caretIndex, L));
  const range = document.createRange();

  try {
    // Case 1: Caret is before a non-newline character, OR at the very end of the text (where textNode[L] is '\u200b').
    if (safeOffset === L || text[safeOffset] !== '\n') {
      range.setStart(textNode, safeOffset);
      range.setEnd(textNode, safeOffset + 1);
      const rects = range.getClientRects();
      const r = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
      if (r && r.height > 0) {
        return {
          x: Math.max(0, (r.left - boxRect.left) / scaleX),
          y: Math.max(0, (r.top - boxRect.top) / scaleY),
          height: r.height / scaleY,
        };
      }
    }

    // Case 2: Caret is right before a '\n' (end of a non-empty line).
    // Measure the right edge of the preceding character (safeOffset - 1).
    if (safeOffset > 0 && text[safeOffset - 1] !== '\n') {
      range.setStart(textNode, safeOffset - 1);
      range.setEnd(textNode, safeOffset);
      const rects = range.getClientRects();
      const r = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
      if (r && r.height > 0) {
        return {
          x: Math.max(0, (r.right - boxRect.left) / scaleX),
          y: Math.max(0, (r.top - boxRect.top) / scaleY),
          height: r.height / scaleY,
        };
      }
    }

    // Case 3: Caret is on an empty line (text[safeOffset] === '\n' and (safeOffset === 0 || text[safeOffset - 1] === '\n')).
    let emptyLineSteps = 1;
    let k = safeOffset - 1;
    while (k >= 0 && text[k] === '\n') {
      emptyLineSteps++;
      k--;
    }
    if (k >= 0) {
      range.setStart(textNode, k);
      range.setEnd(textNode, k + 1);
      const rects = range.getClientRects();
      const r = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
      if (r && r.height > 0) {
        return {
          x: 0,
          y: Math.max(0, (r.top - boxRect.top) / scaleY + emptyLineSteps * lineHeight),
          height: r.height / scaleY,
        };
      }
    }

    return {
      x: 0,
      y: safeOffset * lineHeight + defaultTopPad,
      height: defaultCaretH,
    };
  } catch {
    return { x: 0, y: defaultTopPad, height: defaultCaretH };
  }
}

/**
 * Resolves the exact character index (0..text.length) inside `hitTestDiv`'s single Text node
 * at viewport coordinates `(clientX, clientY)` using pure `document.createRange()` glyph rects.
 * Works deterministically regardless of pointer-events, user-select, z-index, or page zoom,
 * and clamps cleanly when dragging into left/right/top/bottom page margins.
 */
function getCharOffsetFromPoint(
  hitTestDiv: HTMLDivElement,
  textarea: HTMLTextAreaElement,
  text: string,
  clientX: number,
  clientY: number
): number {
  const textNode = hitTestDiv.firstChild;
  const L = text.length;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE || L === 0) {
    return 0;
  }

  const boxRect = hitTestDiv.getBoundingClientRect();
  if (boxRect.width === 0 || boxRect.height === 0) {
    return L;
  }

  const computedLineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 26;
  const scaleY = hitTestDiv.offsetHeight > 0 ? boxRect.height / hitTestDiv.offsetHeight : 1;
  const scaledLineH = computedLineHeight * scaleY;

  const range = document.createRange();

  interface CaretCandidate {
    offset: number;
    x: number;
    top: number;
    bottom: number;
  }

  const candidates: CaretCandidate[] = [];
  let lastLineTop = boxRect.top;

  try {
    for (let i = 0; i <= L; i++) {
      if (i === L || text[i] !== '\n') {
        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);
        const rects = range.getClientRects();
        const r = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
        if (r && r.height > 0) {
          candidates.push({
            offset: i,
            x: r.left,
            top: r.top,
            bottom: r.bottom,
          });
          if (i < L) {
            candidates.push({
              offset: i + 1,
              x: r.right,
              top: r.top,
              bottom: r.bottom,
            });
          }
          lastLineTop = r.top;
        }
      } else if (i === 0 || text[i - 1] === '\n') {
        const top = i === 0 ? boxRect.top : lastLineTop + scaledLineH;
        const bottom = top + scaledLineH;
        candidates.push({
          offset: i,
          x: boxRect.left,
          top,
          bottom,
        });
        lastLineTop = top;
      }
    }
  } catch {
    return L;
  }

  if (candidates.length === 0) {
    return L;
  }

  let minDy = Infinity;
  for (const c of candidates) {
    const dy =
      clientY < c.top ? c.top - clientY : clientY > c.bottom ? clientY - c.bottom : 0;
    if (dy < minDy) {
      minDy = dy;
    }
  }

  let bestOffset = candidates[0].offset;
  let bestDx = Infinity;
  let bestDy = Infinity;

  for (const c of candidates) {
    const dy =
      clientY < c.top ? c.top - clientY : clientY > c.bottom ? clientY - c.bottom : 0;
    if (dy <= minDy + 4) {
      const dx = Math.abs(clientX - c.x);
      if (dx < bestDx - 0.5 || (Math.abs(dx - bestDx) <= 0.5 && dy < bestDy)) {
        bestDx = dx;
        bestDy = dy;
        bestOffset = c.offset;
      }
    }
  }

  return Math.max(0, Math.min(L, bestOffset));
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
  motionBlur = true,
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
  const motionTimerRef = useRef<number | null>(null);
  const activeDragCleanupRef = useRef<(() => void) | null>(null);
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

  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isCaretMoving, setIsCaretMoving] = useState<boolean>(false);
  const [caretCoords, setCaretCoords] = useState<CaretCoords>({
    x: 0,
    y: 2,
    height: 20,
  });
  const [toolbarCoords, setToolbarCoords] = useState<ToolbarCoords>({ x: 0, y: 0 });

  useEffect(() => {
    return () => {
      if (motionTimerRef.current) window.clearTimeout(motionTimerRef.current);
      activeDragCleanupRef.current?.();
    };
  }, []);

  const triggerCaretMotion = useCallback(() => {
    setIsCaretMoving(true);
    if (motionTimerRef.current) {
      window.clearTimeout(motionTimerRef.current);
    }
    motionTimerRef.current = window.setTimeout(() => {
      setIsCaretMoving(false);
    }, 110);
  }, []);

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
      triggerCaretMotion();
    },
    [triggerCaretMotion]
  );

  // Measure exact sub-pixel caret coordinates from hitTestRef's single unbroken Text node
  const measureCaretDomCoords = useCallback(
    (targetOffset?: number) => {
      const el = textareaRef.current;
      const hitTest = hitTestRef.current;
      if (!el || !hitTest) return;

      const offsetToMeasure = targetOffset !== undefined ? targetOffset : caretOffset;
      const next = getCaretRectInHitTest(hitTest, el, value, offsetToMeasure);

      setCaretCoords((prev) => {
        if (
          Math.abs(prev.x - next.x) < 0.2 &&
          Math.abs(prev.y - next.y) < 0.2 &&
          Math.abs(prev.height - next.height) < 0.2
        ) {
          return prev;
        }
        return next;
      });
    },
    [value, caretOffset]
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
        const scaleX = hitTest.offsetWidth > 0 ? boxRect.width / hitTest.offsetWidth : 1;
        const scaleY = hitTest.offsetHeight > 0 ? boxRect.height / hitTest.offsetHeight : 1;
        if (selRect.width === 0 && selRect.height === 0) return;

        const nextX = Math.max(
          0,
          Math.min(hitTest.offsetWidth - 180, (selRect.left - boxRect.left) / scaleX)
        );
        const nextY = Math.max(0, (selRect.top - boxRect.top) / scaleY);
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
    measureCaretDomCoords();
  }, [value, caretOffset, syncTextareaHeight, measureCaretDomCoords]);

  useEffect(() => {
    const hitTest = hitTestRef.current;
    if (!hitTest || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      syncTextareaHeight();
      measureCaretDomCoords();
    });
    ro.observe(hitTest);
    return () => ro.disconnect();
  }, [syncTextareaHeight, measureCaretDomCoords]);

  // Unified pointer selection starter (used both when activating an inactive block AND when clicking/dragging inside an active block)
  const startPointerSelection = useCallback(
    (clientX: number, clientY: number, shiftKey = false, endX?: number, endY?: number) => {
      const el = textareaRef.current;
      const hitTest = hitTestRef.current;
      if (!el || !hitTest) return;

      activeDragCleanupRef.current?.();
      syncTextareaHeight();
      el.focus({ preventScroll: true });
      setIsFocused(true);

      const textVal = el.value;

      // If this came from a completed 2D lasso rectangle over a single block:
      if (endX !== undefined && endY !== undefined) {
        const left = Math.min(clientX, endX);
        const top = Math.min(clientY, endY);
        const right = Math.max(clientX, endX);
        const bottom = Math.max(clientY, endY);

        const offsetA = getCharOffsetFromPoint(hitTest, el, textVal, left, top);
        const offsetB = getCharOffsetFromPoint(hitTest, el, textVal, right, bottom);
        let start = Math.min(offsetA, offsetB);
        let end = Math.max(offsetA, offsetB);

        // If the lasso rectangle touched the margin beside a line so offsetA === offsetB,
        // select that entire line so the selection rectangle always selects the touched text!
        if (start === end && textVal.length > 0) {
          const lineStart = textVal.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
          const nextNl = textVal.indexOf('\n', start);
          const lineEnd = nextNl === -1 ? textVal.length : nextNl;
          if (lineEnd > lineStart) {
            start = lineStart;
            end = lineEnd;
          } else {
            start = 0;
            end = textVal.length;
          }
        }

        const dir: 'forward' | 'backward' =
          endX < clientX || endY < clientY ? 'backward' : 'forward';
        const activeHead = dir === 'backward' ? start : end;

        el.setSelectionRange(start, end, dir);
        setSelRange({ start, end, direction: dir });
        onCursorChangeRef.current?.(activeHead);
        measureCaretDomCoords(activeHead);
        if (start !== end) {
          measureSelectionToolbarCoords(start, end);
        }
        return;
      }

      const clickedOffset = getCharOffsetFromPoint(
        hitTest,
        el,
        textVal,
        clientX,
        clientY
      );

      const anchorOffset = shiftKey
        ? selRange.direction === 'backward'
          ? selRange.end
          : selRange.start
        : clickedOffset;

      const initStart = Math.min(anchorOffset, clickedOffset);
      const initEnd = Math.max(anchorOffset, clickedOffset);
      const initDir: 'forward' | 'backward' | 'none' =
        clickedOffset < anchorOffset
          ? 'backward'
          : clickedOffset > anchorOffset
          ? 'forward'
          : 'none';

      el.setSelectionRange(initStart, initEnd, initDir);
      setSelRange({ start: initStart, end: initEnd, direction: initDir });
      onCursorChangeRef.current?.(clickedOffset);
      triggerCaretMotion();
      measureCaretDomCoords(clickedOffset);
      if (initStart !== initEnd) {
        measureSelectionToolbarCoords(initStart, initEnd);
      }

      const onWindowMouseMove = (moveEvent: MouseEvent) => {
        const curEl = textareaRef.current;
        const curHitTest = hitTestRef.current;
        if (!curEl || !curHitTest) return;

        const focusOffset = getCharOffsetFromPoint(
          curHitTest,
          curEl,
          curEl.value,
          moveEvent.clientX,
          moveEvent.clientY
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
        measureCaretDomCoords(focusOffset);
        if (start !== end) {
          measureSelectionToolbarCoords(start, end);
        }
      };

      const onWindowMouseUp = () => {
        window.removeEventListener('mousemove', onWindowMouseMove);
        window.removeEventListener('mouseup', onWindowMouseUp);
        activeDragCleanupRef.current = null;
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
      activeDragCleanupRef.current = () => {
        window.removeEventListener('mousemove', onWindowMouseMove);
        window.removeEventListener('mouseup', onWindowMouseUp);
      };
    },
    [
      selRange.direction,
      selRange.end,
      selRange.start,
      syncTextareaHeight,
      measureCaretDomCoords,
      measureSelectionToolbarCoords,
      triggerCaretMotion,
    ]
  );

  // Handle mouseDown activation forwarded from an inactive block (click placement, live drag selection, or single-block lasso selection)
  useLayoutEffect(() => {
    if (!pendingMouseDownPoint) return;
    if (handledMouseSeqRef.current === pendingMouseDownPoint.seq) return;
    handledMouseSeqRef.current = pendingMouseDownPoint.seq;

    startPointerSelection(
      pendingMouseDownPoint.clientX,
      pendingMouseDownPoint.clientY,
      false,
      pendingMouseDownPoint.endX,
      pendingMouseDownPoint.endY
    );
  }, [pendingMouseDownPoint, startPointerSelection]);

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
      measureCaretDomCoords(dir === 'backward' ? start : end);
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
    measureCaretDomCoords(targetPos);
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
      const dir = pending.direction || 'forward';
      el.setSelectionRange(clampedStart, clampedEnd, dir);
      measureCaretDomCoords(dir === 'backward' ? clampedStart : clampedEnd);
      if (clampedStart !== clampedEnd) {
        measureSelectionToolbarCoords(clampedStart, clampedEnd);
      }
    }
  }, [value, measureCaretDomCoords, measureSelectionToolbarCoords]);

  // Sync selection state from user keyboard/mouse interaction on the native <textarea>
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
      triggerCaretMotion();
      return { start: selStart, end: selEnd, direction: dir };
    });

    onCursorChangeRef.current?.(activeCaret);
    measureCaretDomCoords(activeCaret);

    if (selStart !== selEnd) {
      measureSelectionToolbarCoords(selStart, selEnd);
    }
  }, [measureCaretDomCoords, measureSelectionToolbarCoords, triggerCaretMotion]);

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

      {/* 1. Grid Auto-Sizer & Single-Text-Node Range Geometry Layer (100% identical metrics to native textarea) */}
      <div
        ref={hitTestRef}
        aria-hidden="true"
        className="pointer-events-none whitespace-pre-wrap break-words min-h-[1.6em] m-0 p-0 border-0"
        style={{
          gridArea: '1 / 1 / 2 / 2',
          opacity: 0,
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          fontStyle: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
          textAlign: 'inherit',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
          tabSize: 4,
          boxSizing: 'border-box',
        }}
      >
        {`${value}\u200b`}
      </div>

      {/* 2. Direct Native Visible Textarea (Renders text & ::selection directly, zero layout shift) */}
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
        onMouseDown={(e) => {
          if (e.button === 0 && e.detail === 1) {
            e.preventDefault();
            startPointerSelection(e.clientX, e.clientY, e.shiftKey);
          }
        }}
        onFocus={() => {
          setIsFocused(true);
          syncSelectionFromDom();
        }}
        onBlur={() => {
          setIsFocused(false);
          setIsCaretMoving(false);
        }}
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
          triggerCaretMotion();
          if (!pendingSelectionRef.current) {
            setSelRange({ start: nextPos, end: nextPos, direction: 'none' });
          }
          onChange(nextVal, nextPos);
        }}
        onSelect={syncSelectionFromDom}
        onKeyUp={syncSelectionFromDom}
        onMouseUp={syncSelectionFromDom}
        onClick={syncSelectionFromDom}
        onKeyDown={(e) => {
          triggerCaretMotion();
          onKeyDown?.(e, setProgrammaticSelection);
          if (!e.defaultPrevented) {
            requestAnimationFrame(syncSelectionFromDom);
          }
        }}
        className="no-export cursiv-native-textarea cursiv-native-textarea-custom-caret relative z-20 w-full bg-transparent border-0 outline-none resize-none overflow-hidden p-0 m-0"
        style={{
          gridArea: '1 / 1 / 2 / 2',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          fontStyle: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
          textAlign: 'inherit',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
          tabSize: 4,
          boxSizing: 'border-box',
        }}
      />

      {/* 3. Smooth Gliding Cursiv Caret (100% aligned via Range geometry on single-Text-node hitTestRef) */}
      {isFocused && !hasSelection && (
        <div
          aria-hidden="true"
          className={`no-print no-export cursiv-word-caret ${
            isCaretMoving ? 'cursiv-word-caret-moving' : ''
          } ${
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
