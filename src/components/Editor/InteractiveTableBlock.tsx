import React, { useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns,
  Plus,
  Rows,
  Trash2,
} from 'lucide-react';
import { TableAlignment } from '../../types/editor';
import { LiveInlineTokens } from './LiveInlineTokens';
import { MathEnvironmentContext } from '../../utils/mathEngine';

interface InteractiveTableBlockProps {
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
  columnWidths?: number[];
  isActive: boolean;
  mathEnv: MathEnvironmentContext;
  footnotesMap: Record<string, string>;
  pandocMathRules: boolean;
  onFocusBlock: () => void;
  onChange: (next: {
    headers: string[];
    alignments: TableAlignment[];
    rows: string[][];
    columnWidths?: number[];
  }) => void;
}

export const InteractiveTableBlock: React.FC<InteractiveTableBlockProps> = ({
  headers,
  alignments,
  rows,
  columnWidths,
  isActive,
  mathEnv,
  footnotesMap,
  pandocMathRules,
  onFocusBlock,
  onChange,
}) => {
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [widths, setWidths] = useState<number[]>(
    columnWidths && columnWidths.length === headers.length
      ? columnWidths
      : headers.map(() => Math.floor(100 / Math.max(1, headers.length)))
  );
  const resizingColRef = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(
    null
  );

  const selectedCol = activeCell?.col ?? 0;
  const selectedRow = activeCell?.row ?? 0; // -1 means header row

  const handleMouseDownResize = (e: React.MouseEvent, colIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widths[colIndex] || 25;
    resizingColRef.current = { colIndex, startX, startWidth };
    let latestWidths = [...widths];

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return;
      const deltaPx = moveEvent.clientX - resizingColRef.current.startX;
      const deltaPct = Math.round(deltaPx / 6);
      const nextWidths = [...widths];
      nextWidths[colIndex] = Math.max(10, Math.min(80, resizingColRef.current.startWidth + deltaPct));
      latestWidths = nextWidths;
      setWidths(nextWidths);
    };

    const onMouseUp = () => {
      resizingColRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      onChange({ headers, alignments, rows, columnWidths: latestWidths });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const setAlignment = (align: TableAlignment) => {
    const nextAlign = [...alignments];
    nextAlign[selectedCol] = align;
    onChange({ headers, alignments: nextAlign, rows, columnWidths: widths });
  };

  const addRowAfter = () => {
    const insertIdx = selectedRow < 0 ? 0 : selectedRow + 1;
    const nextRows = [...rows];
    nextRows.splice(insertIdx, 0, headers.map(() => ''));
    onChange({ headers, alignments, rows: nextRows, columnWidths: widths });
  };

  const deleteCurrentRow = () => {
    if (rows.length <= 1 || selectedRow < 0) return;
    const nextRows = rows.filter((_, idx) => idx !== selectedRow);
    onChange({ headers, alignments, rows: nextRows, columnWidths: widths });
  };

  const addColumnAfter = () => {
    const insertIdx = selectedCol + 1;
    const nextHeaders = [...headers];
    nextHeaders.splice(insertIdx, 0, `Col ${nextHeaders.length + 1}`);
    const nextAlign = [...alignments];
    nextAlign.splice(insertIdx, 0, 'left');
    const nextRows = rows.map((r) => {
      const copy = [...r];
      copy.splice(insertIdx, 0, '');
      return copy;
    });
    const nextWidths = nextHeaders.map(() => Math.floor(100 / nextHeaders.length));
    setWidths(nextWidths);
    onChange({
      headers: nextHeaders,
      alignments: nextAlign,
      rows: nextRows,
      columnWidths: nextWidths,
    });
  };

  const deleteCurrentColumn = () => {
    if (headers.length <= 1) return;
    const nextHeaders = headers.filter((_, i) => i !== selectedCol);
    const nextAlign = alignments.filter((_, i) => i !== selectedCol);
    const nextRows = rows.map((r) => r.filter((_, i) => i !== selectedCol));
    const nextWidths = nextHeaders.map(() => Math.floor(100 / nextHeaders.length));
    setWidths(nextWidths);
    onChange({
      headers: nextHeaders,
      alignments: nextAlign,
      rows: nextRows,
      columnWidths: nextWidths,
    });
  };

  const moveRow = (direction: -1 | 1) => {
    if (selectedRow < 0) return;
    const target = selectedRow + direction;
    if (target < 0 || target >= rows.length) return;
    const nextRows = [...rows];
    const [moved] = nextRows.splice(selectedRow, 1);
    nextRows.splice(target, 0, moved);
    setActiveCell({ row: target, col: selectedCol });
    onChange({ headers, alignments, rows: nextRows, columnWidths: widths });
  };

  const moveColumn = (direction: -1 | 1) => {
    const target = selectedCol + direction;
    if (target < 0 || target >= headers.length) return;
    const swap = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      const [item] = copy.splice(selectedCol, 1);
      copy.splice(target, 0, item);
      return copy;
    };
    const nextHeaders = swap(headers);
    const nextAlign = swap(alignments);
    const nextRows = rows.map((r) => swap(r));
    const nextWidths = swap(widths);
    setWidths(nextWidths);
    setActiveCell({ row: selectedRow, col: target });
    onChange({
      headers: nextHeaders,
      alignments: nextAlign,
      rows: nextRows,
      columnWidths: nextWidths,
    });
  };

  return (
    <div className="relative my-5 group" onClick={onFocusBlock}>
      {/* Contextual Floating Table Toolbar */}
      {isActive && (
        <div
          className="no-export cursiv-popup-anim cursiv-glass-toolbar flex flex-wrap items-center gap-1 px-2.5 py-1.5 mb-2 rounded-lg shadow-md text-xs"
          style={{ color: 'var(--text-color)' }}
        >
          <span className="font-medium opacity-70 mr-1">Alignement :</span>
          <button
            type="button"
            onClick={() => setAlignment('left')}
            className={`p-1 rounded hover:bg-black/10 cursor-pointer ${
              alignments[selectedCol] === 'left' ? 'text-blue-500' : ''
            }`}
            title="Aligner à gauche"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAlignment('center')}
            className={`p-1 rounded hover:bg-black/10 cursor-pointer ${
              alignments[selectedCol] === 'center' ? 'text-blue-500' : ''
            }`}
            title="Centrer"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAlignment('right')}
            className={`p-1 rounded hover:bg-black/10 cursor-pointer ${
              alignments[selectedCol] === 'right' ? 'text-blue-500' : ''
            }`}
            title="Aligner à droite"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>

          <div className="h-3.5 w-px mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

          <button
            type="button"
            onClick={addRowAfter}
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-black/10 cursor-pointer"
            title="Ajouter une ligne"
          >
            <Rows className="w-3.5 h-3.5" />
            <Plus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={addColumnAfter}
            className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-black/10 cursor-pointer"
            title="Ajouter une colonne"
          >
            <Columns className="w-3.5 h-3.5" />
            <Plus className="w-3 h-3" />
          </button>

          <div className="h-3.5 w-px mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

          <button
            type="button"
            onClick={() => moveRow(-1)}
            className="p-1 rounded hover:bg-black/10 cursor-pointer"
            title="Monter la ligne (Quick Reorder)"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => moveRow(1)}
            className="p-1 rounded hover:bg-black/10 cursor-pointer"
            title="Descendre la ligne (Quick Reorder)"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => moveColumn(-1)}
            className="p-1 rounded hover:bg-black/10 cursor-pointer"
            title="Déplacer la colonne à gauche"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => moveColumn(1)}
            className="p-1 rounded hover:bg-black/10 cursor-pointer"
            title="Déplacer la colonne à droite"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <div className="h-3.5 w-px mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

          <button
            type="button"
            onClick={deleteCurrentRow}
            className="flex items-center gap-1 px-1.5 py-1 rounded text-red-500 hover:bg-red-500/10 cursor-pointer"
            title="Supprimer la ligne"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Ligne</span>
          </button>
          <button
            type="button"
            onClick={deleteCurrentColumn}
            className="flex items-center gap-1 px-1.5 py-1 rounded text-red-500 hover:bg-red-500/10 cursor-pointer"
            title="Supprimer la colonne"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Col</span>
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-sm"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <thead>
            <tr style={{ backgroundColor: 'var(--table-alt-bg)' }}>
              {headers.map((headerText, colIdx) => {
                const isEditingCell =
                  isActive && activeCell?.row === -1 && activeCell?.col === colIdx;
                return (
                  <th
                    key={colIdx}
                    style={{
                      borderColor: 'var(--border-color)',
                      textAlign: alignments[colIdx] || 'left',
                      width: `${widths[colIdx] || Math.floor(100 / headers.length)}%`,
                    }}
                    className="relative border px-3 py-2 font-semibold select-text"
                    onClick={() => setActiveCell({ row: -1, col: colIdx })}
                  >
                    {isEditingCell ? (
                      <input
                        type="text"
                        autoFocus
                        value={headerText}
                        onChange={(e) => {
                          const next = [...headers];
                          next[colIdx] = e.target.value;
                          onChange({ headers: next, alignments, rows, columnWidths: widths });
                        }}
                        className="w-full bg-transparent outline-none font-semibold"
                        style={{ textAlign: alignments[colIdx] || 'left' }}
                      />
                    ) : (
                      <LiveInlineTokens
                        text={headerText}
                        isBlockActive={false}
                        cursorOffset={null}
                        mathEnv={mathEnv}
                        footnotesMap={footnotesMap}
                        pandocMathRules={pandocMathRules}
                      />
                    )}
                    {/* Mouse Dragging Column Resizer Handle */}
                    <div
                      onMouseDown={(e) => handleMouseDownResize(e, colIdx)}
                      className="no-export absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors"
                      title="Glisser pour redimensionner la colonne"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((rowCells, rowIdx) => (
              <tr
                key={rowIdx}
                style={{
                  backgroundColor: rowIdx % 2 === 1 ? 'var(--table-alt-bg)' : 'transparent',
                }}
              >
                {headers.map((_, colIdx) => {
                  const cellValue = rowCells[colIdx] ?? '';
                  const isEditingCell =
                    isActive && activeCell?.row === rowIdx && activeCell?.col === colIdx;

                  return (
                    <td
                      key={colIdx}
                      style={{
                        borderColor: 'var(--border-color)',
                        textAlign: alignments[colIdx] || 'left',
                      }}
                      className="border px-3 py-2 select-text"
                      onClick={() => setActiveCell({ row: rowIdx, col: colIdx })}
                    >
                      {isEditingCell ? (
                        <input
                          type="text"
                          autoFocus
                          value={cellValue}
                          onChange={(e) => {
                            const nextRows = rows.map((r) => [...r]);
                            nextRows[rowIdx][colIdx] = e.target.value;
                            onChange({ headers, alignments, rows: nextRows, columnWidths: widths });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab') {
                              e.preventDefault();
                              const nextCol = e.shiftKey ? colIdx - 1 : colIdx + 1;
                              if (nextCol >= 0 && nextCol < headers.length) {
                                setActiveCell({ row: rowIdx, col: nextCol });
                              } else if (!e.shiftKey && rowIdx + 1 < rows.length) {
                                setActiveCell({ row: rowIdx + 1, col: 0 });
                              }
                            }
                          }}
                          className="w-full bg-transparent outline-none"
                          style={{ textAlign: alignments[colIdx] || 'left' }}
                        />
                      ) : (
                        <LiveInlineTokens
                          text={cellValue}
                          isBlockActive={false}
                          cursorOffset={null}
                          mathEnv={mathEnv}
                          footnotesMap={footnotesMap}
                          pandocMathRules={pandocMathRules}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
