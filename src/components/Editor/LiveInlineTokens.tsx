import React, { useState } from 'react';
import { MathEnvironmentContext, renderLatexToHtml } from '../../utils/mathEngine';
import { EMOJI_DICTIONARY } from '../../utils/emojiDictionary';

export type InlineSegment =
  | { type: 'text'; raw: string; content: string; start: number; end: number }
  | { type: 'bold'; raw: string; marker: string; content: string; start: number; end: number }
  | { type: 'italic'; raw: string; marker: string; content: string; start: number; end: number }
  | { type: 'strike'; raw: string; marker: string; content: string; start: number; end: number }
  | { type: 'highlight'; raw: string; marker: string; content: string; start: number; end: number }
  | { type: 'code'; raw: string; marker: string; content: string; start: number; end: number }
  | { type: 'math'; raw: string; marker: string; content: string; start: number; end: number }
  | { type: 'sub'; raw: string; marker: string; content: string; start: number; end: number }
  | { type: 'sup'; raw: string; marker: string; content: string; start: number; end: number }
  | {
      type: 'link';
      raw: string;
      text: string;
      href: string;
      start: number;
      end: number;
    }
  | {
      type: 'image';
      raw: string;
      alt: string;
      src: string;
      start: number;
      end: number;
    }
  | {
      type: 'footnote-ref';
      raw: string;
      label: string;
      start: number;
      end: number;
    }
  | {
      type: 'emoji';
      raw: string;
      shortcode: string;
      emoji: string;
      start: number;
      end: number;
    }
  | {
      type: 'comment';
      raw: string;
      content: string;
      start: number;
      end: number;
    };

/**
 * Tokenizes an inline Markdown string with exact start/end character offsets so
 * Cursiv can determine whether the user's cursor is inside a specific inline node.
 */
export function tokenizeInlineMarkdown(
  input: string,
  pandocMathRules = true
): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // Combined regex for inline Markdown tokens
  const tokenRegex =
    /(<!--[\s\S]*?-->)|(!\[[^\]]*\]\([^)]+\))|(\[\^[^\]]+\])|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(~~[^~]+~~)|(==[^=]+==)|(`[^`]+`)|(\$[^$\n]+\$)|(~[^~\s]+~)|(\^[^^\s]+\^)|(:[a-zA-Z0-9_+-]+:)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(input)) !== null) {
    const start = match.index;
    const raw = match[0];
    const end = start + raw.length;

    if (start > lastIndex) {
      const plain = input.slice(lastIndex, start);
      segments.push({
        type: 'text',
        raw: plain,
        content: plain,
        start: lastIndex,
        end: start,
      });
    }

    if (match[1]) {
      // HTML Comment <!-- ... -->
      segments.push({
        type: 'comment',
        raw,
        content: raw.slice(4, -3),
        start,
        end,
      });
    } else if (match[2]) {
      // Inline Image ![alt](src)
      const m = raw.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:[^)]*)\)$/);
      segments.push({
        type: 'image',
        raw,
        alt: m?.[1] || '',
        src: m?.[2] || '',
        start,
        end,
      });
    } else if (match[3]) {
      // Footnote reference [^1]
      segments.push({
        type: 'footnote-ref',
        raw,
        label: raw.slice(2, -1),
        start,
        end,
      });
    } else if (match[4]) {
      // Link [text](href)
      const m = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      segments.push({
        type: 'link',
        raw,
        text: m?.[1] || raw,
        href: m?.[2] || '#',
        start,
        end,
      });
    } else if (match[5]) {
      // Bold **...** or __...__
      const marker = raw.slice(0, 2);
      segments.push({
        type: 'bold',
        raw,
        marker,
        content: raw.slice(2, -2),
        start,
        end,
      });
    } else if (match[6]) {
      // Italic *...* or _..._
      const marker = raw.slice(0, 1);
      segments.push({
        type: 'italic',
        raw,
        marker,
        content: raw.slice(1, -1),
        start,
        end,
      });
    } else if (match[7]) {
      // Strikethrough ~~...~~
      segments.push({
        type: 'strike',
        raw,
        marker: '~~',
        content: raw.slice(2, -2),
        start,
        end,
      });
    } else if (match[8]) {
      // Highlight ==...==
      segments.push({
        type: 'highlight',
        raw,
        marker: '==',
        content: raw.slice(2, -2),
        start,
        end,
      });
    } else if (match[9]) {
      // Inline code `...`
      segments.push({
        type: 'code',
        raw,
        marker: '`',
        content: raw.slice(1, -1),
        start,
        end,
      });
    } else if (match[10]) {
      // Inline Math $...$
      const inner = raw.slice(1, -1);
      // Pandoc rule: opening $ must not be followed by space, closing $ must not be preceded by space
      const validPandoc = !inner.startsWith(' ') && !inner.endsWith(' ');
      if (!pandocMathRules || validPandoc) {
        segments.push({
          type: 'math',
          raw,
          marker: '$',
          content: inner,
          start,
          end,
        });
      } else {
        segments.push({
          type: 'text',
          raw,
          content: raw,
          start,
          end,
        });
      }
    } else if (match[11]) {
      // Subscript ~...~
      segments.push({
        type: 'sub',
        raw,
        marker: '~',
        content: raw.slice(1, -1),
        start,
        end,
      });
    } else if (match[12]) {
      // Superscript ^...^
      segments.push({
        type: 'sup',
        raw,
        marker: '^',
        content: raw.slice(1, -1),
        start,
        end,
      });
    } else if (match[13]) {
      // Emoji :shortcode:
      const code = raw.slice(1, -1);
      const found = EMOJI_DICTIONARY.find((e) => e.shortcode === code);
      if (found) {
        segments.push({
          type: 'emoji',
          raw,
          shortcode: code,
          emoji: found.emoji,
          start,
          end,
        });
      } else {
        segments.push({
          type: 'text',
          raw,
          content: raw,
          start,
          end,
        });
      }
    }

    lastIndex = end;
  }

  if (lastIndex < input.length) {
    const tail = input.slice(lastIndex);
    segments.push({
      type: 'text',
      raw: tail,
      content: tail,
      start: lastIndex,
      end: input.length,
    });
  }

  return segments;
}

interface LiveInlineTokensProps {
  text: string;
  isBlockActive: boolean;
  cursorOffset: number | null;
  mathEnv: MathEnvironmentContext;
  footnotesMap: Record<string, string>;
  pandocMathRules: boolean;
  onNavigateAnchor?: (slugOrUrl: string) => void;
  onClickOffset?: (offset: number) => void;
}

export const LiveInlineTokens: React.FC<LiveInlineTokensProps> = ({
  text,
  isBlockActive,
  cursorOffset,
  mathEnv,
  footnotesMap,
  pandocMathRules,
  onNavigateAnchor,
  onClickOffset,
}) => {
  const [hoveredTokenIndex, setHoveredTokenIndex] = useState<number | null>(null);
  const segments = tokenizeInlineMarkdown(text, pandocMathRules);

  const isSegmentRevealed = (seg: InlineSegment, idx: number): boolean => {
    if (hoveredTokenIndex === idx && isBlockActive) return true;
    if (!isBlockActive || cursorOffset === null) return false;
    return cursorOffset >= seg.start && cursorOffset <= seg.end;
  };

  const renderMarker = (marker: string, visible: boolean) => (
    <span
      className={`md-token-marker ${
        visible ? 'md-token-marker-visible' : 'md-token-marker-hidden'
      }`}
      aria-hidden={!visible}
    >
      {marker}
    </span>
  );

  return (
    <>
      {segments.map((seg, idx) => {
        const revealed = isSegmentRevealed(seg, idx);

        switch (seg.type) {
          case 'text': {
            if (!isBlockActive) {
              return (
                <span key={idx} onClick={() => onClickOffset?.(seg.start)}>
                  {seg.content}
                </span>
              );
            }
            const isNearCaret =
              cursorOffset !== null &&
              cursorOffset >= seg.start &&
              cursorOffset <= seg.end + 1 &&
              seg.content.length > 0;

            if (isNearCaret) {
              const splitAt = Math.max(
                0,
                Math.min(seg.content.length - 1, (cursorOffset ?? seg.end) - seg.start - 1)
              );
              const prefix = seg.content.slice(0, splitAt);
              const activeChar = seg.content.slice(splitAt, splitAt + 1);
              const suffix = seg.content.slice(splitAt + 1);
              return (
                <span key={idx} onClick={() => onClickOffset?.(seg.start)}>
                  {prefix}
                  <span
                    key={`${idx}-${splitAt}-${activeChar}`}
                    className="inline-block cursiv-char-glide"
                  >
                    {activeChar === ' ' ? '\u00A0' : activeChar}
                  </span>
                  {suffix}
                </span>
              );
            }
            return (
              <span key={idx} onClick={() => onClickOffset?.(seg.start)}>
                {seg.content}
              </span>
            );
          }

          case 'bold':
            return (
              <strong
                key={idx}
                className="font-semibold"
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 2)}
              >
                {renderMarker(seg.marker, revealed)}
                {seg.content}
                {renderMarker(seg.marker, revealed)}
              </strong>
            );

          case 'italic':
            return (
              <em
                key={idx}
                className="italic"
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 1)}
              >
                {renderMarker(seg.marker, revealed)}
                {seg.content}
                {renderMarker(seg.marker, revealed)}
              </em>
            );

          case 'strike':
            return (
              <del
                key={idx}
                className="line-through opacity-75"
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 2)}
              >
                {renderMarker(seg.marker, revealed)}
                {seg.content}
                {renderMarker(seg.marker, revealed)}
              </del>
            );

          case 'highlight':
            return (
              <mark
                key={idx}
                style={{ backgroundColor: 'var(--highlight-bg)', color: 'var(--text-color)' }}
                className="px-1 rounded-xs"
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 2)}
              >
                {renderMarker(seg.marker, revealed)}
                {seg.content}
                {renderMarker(seg.marker, revealed)}
              </mark>
            );

          case 'code':
            return (
              <code
                key={idx}
                style={{
                  backgroundColor: 'var(--code-bg-color)',
                  fontFamily: 'var(--font-mono)',
                }}
                className="px-1.5 py-0.5 rounded text-[0.88em]"
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 1)}
              >
                {renderMarker(seg.marker, revealed)}
                {seg.content}
                {renderMarker(seg.marker, revealed)}
              </code>
            );

          case 'sub':
            return (
              <sub
                key={idx}
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 1)}
              >
                {renderMarker(seg.marker, revealed)}
                {seg.content}
                {renderMarker(seg.marker, revealed)}
              </sub>
            );

          case 'sup':
            return (
              <sup
                key={idx}
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 1)}
              >
                {renderMarker(seg.marker, revealed)}
                {seg.content}
                {renderMarker(seg.marker, revealed)}
              </sup>
            );

          case 'math': {
            const rendered = renderLatexToHtml(seg.content, false, mathEnv);
            return (
              <span
                key={idx}
                className="inline-flex items-baseline mx-0.5 cursor-pointer"
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 1)}
              >
                {renderMarker('$', revealed)}
                {revealed ? (
                  <span
                    className="px-1 rounded text-[0.9em]"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: 'var(--code-bg-color)',
                    }}
                  >
                    {seg.content}
                  </span>
                ) : rendered.error ? (
                  <span className="text-red-500 text-xs font-mono" title={rendered.error}>
                    ${seg.content}$
                  </span>
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: rendered.html }} />
                )}
                {renderMarker('$', revealed)}
              </span>
            );
          }

          case 'link':
            return (
              <span
                key={idx}
                className="inline-flex items-baseline"
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
              >
                {renderMarker('[', revealed)}
                <a
                  href={seg.href}
                  onClick={(e) => {
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey || !isBlockActive) {
                      onNavigateAnchor?.(seg.href);
                    } else {
                      onClickOffset?.(seg.start + 1);
                    }
                  }}
                  style={{ color: 'var(--primary-color)' }}
                  className="underline decoration-current/40 hover:decoration-current transition-colors cursor-pointer"
                  title={`${seg.href} (Ctrl+Clic pour ouvrir)`}
                >
                  {seg.text}
                </a>
                {renderMarker(`](${seg.href})`, revealed)}
              </span>
            );

          case 'image':
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1 align-middle my-1"
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 2)}
              >
                {renderMarker(`![${seg.alt}](`, revealed)}
                <img
                  src={seg.src}
                  alt={seg.alt}
                  className="inline-block max-h-48 rounded border"
                  style={{ borderColor: 'var(--border-color)' }}
                />
                {renderMarker(')', revealed)}
              </span>
            );

          case 'footnote-ref': {
            const noteText =
              footnotesMap[seg.label] || `Note de bas de page [^${seg.label}]`;
            return (
              <span
                key={idx}
                className="relative group inline-flex items-baseline"
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 2)}
              >
                {renderMarker('[^', revealed)}
                <sup
                  style={{ color: 'var(--primary-color)' }}
                  className="font-semibold cursor-help px-0.5"
                >
                  [{seg.label}]
                </sup>
                {renderMarker(']', revealed)}
                <span
                  className="cursiv-popup-anim pointer-events-none hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 p-2.5 rounded-lg shadow-lg text-xs z-40"
                  style={{
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-color)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <span className="font-semibold block mb-0.5" style={{ color: 'var(--primary-color)' }}>
                    Note [^{seg.label}]
                  </span>
                  {noteText}
                </span>
              </span>
            );
          }

          case 'emoji':
            return (
              <span
                key={idx}
                onMouseEnter={() => setHoveredTokenIndex(idx)}
                onMouseLeave={() => setHoveredTokenIndex(null)}
                onClick={() => onClickOffset?.(seg.start + 1)}
              >
                {renderMarker(`:${seg.shortcode}:`, revealed)}
                <span>{seg.emoji}</span>
              </span>
            );

          case 'comment':
            return (
              <span
                key={idx}
                style={{ color: 'var(--md-char-color)' }}
                className="font-mono text-xs opacity-65"
                onClick={() => onClickOffset?.(seg.start + 4)}
              >
                {revealed ? seg.raw : `<!-- ${seg.content.trim()} -->`}
              </span>
            );
        }
      })}
    </>
  );
};
