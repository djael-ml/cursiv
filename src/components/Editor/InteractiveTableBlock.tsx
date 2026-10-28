import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpZA,
  Check,
  Columns,
  Copy,
  Plus,
  Rows,
  Trash2,
} from 'lucide-react';
import { TableAlignment } from '../../types/editor';
import { LiveInlineTokens } from './LiveInlineTokens';
import { InlinePageInput, PendingMousePoint } from './InlinePageInput';
import { MathEnvironmentContext } from '../../utils/mathEngine';

interface InteractiveTableBlockProps {
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
  columnWidths?: number[];
  isActive: boolean;
  motionBlur?: boolean;
  smartTypography?: boolean;
  mathEnv: MathEnvironmentContext;
  footnotesMap: Record<string, string>;
  pandocMathRules: boolean;
  onFocusBlock: () => void;
  onExitTable?: (direction: 'up' | 'down') => void;
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
  motionBlur = true,
  smartTypography = true,
  mathEnv,
  footnotesMap,
  pandocMathRules,
  onFocusBlock,
  onExitTable,
  onChange,
}) => {
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [cellCaretOffset, setCellCaretOffset] = useState<number | null>(null);
  const [cellCaretVersion, setCellCaretVersion] = useState<number>(0);
  const [cellMousePoint, setCellMousePoint] = useState<{
    row: number;
    col: number;
    point: PendingMousePoint;
  } | null>(null);
  const [sortState, setSortState] = useState<{ col: number; asc: boolean } | null>(null);
  const [copiedMode, setCopiedMode] = useState<'md' | 'csv' | null>(null);

  const [widths, setWidths] = useState<number[]>(
    columnWidths && columnWidths.length === headers.length
      ? columnWidths
      : headers.map(() => Math.floor(100 / Math.max(1, headers.length)))
  );
  const resizingColRef = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(
    null
  );

  useEffect(() => {
    if (!isActive) {
      setActiveCell(null);
      setCellMousePoint(null);
    } else if (activeCell === null) {
      setActiveCell({ row: -1, col: 0 });
      setCellCaretOffset(headers[0]?.length ?? 0);
      setCellCaretVersion((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const selectedCol = activeCell?.col ?? 0;
  const selectedRow = activeCell?.row ?? -1; // -1 means header row

  const focusCellProgrammatically = (row: number, col: number, caretPos: number | null = null) => {
    setCellMousePoint(null);
    setActiveCell({ row, col });
    setCellCaretOffset(caretPos);
    setCellCaretVersion((v) => v + 1);
  };

  const activateCellFromMouse = (e: React.MouseEvent<HTMLElement>, row: number, col: number) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, textarea, input, [data-col-resizer="true"]')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    onFocusBlock();
    setActiveCell({ row, col });
    setCellMousePoint({
      row,
      col,
      point: {
        clientX: e.clientX,
        clientY: e.clientY,
        seq: Date.now() + Math.random(),
      },
    });
  };

  // Compute numeric summary (Sum & Average) for the currently selected column if >= 2 numeric cells exist
  const columnNumericStats = useMemo(() => {
    const nums: number[] = [];
    for (const r of rows) {
      const raw = (r[selectedCol] ?? '').trim().replace(/\s/g, '').replace(',', '.');
      if (!raw) continue;
      const cleaned = raw.replace(/[^0-9.+-]/g, '');
      if (cleaned && /^-?\d+(\.\d+)?$/.test(cleaned)) {
        const val = parseFloat(cleaned);
        if (Number.isFinite(val)) nums.push(val);
      }
    }
    if (nums.length < 2) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    return {
      count: nums.length,
      sum: Number.isInteger(sum) ? String(sum) : sum.toFixed(2),
      avg: Number.isInteger(avg) ? String(avg) : avg.toFixed(2),
    };
  }, [rows, selectedCol]);

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
      nextWidths[colIndex] = Math.max(
        10,
        Math.min(80, resizingColRef.current.startWidth + deltaPct)
      );
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

  const addRowAfter = (targetRowIdx?: number) => {
    const baseRow = targetRowIdx !== undefined ? targetRowIdx : selectedRow;
    const insertIdx = baseRow < 0 ? 0 : baseRow + 1;
    const nextRows = [...rows];
    nextRows.splice(insertIdx, 0, headers.map(() => ''));
    onChange({ headers, alignments, rows: nextRows, columnWidths: widths });
    onFocusBlock();
    focusCellProgrammatically(insertIdx, Math.max(0, selectedCol), 0);
  };

  const duplicateCurrentRow = () => {
    if (selectedRow < 0 || selectedRow >= rows.length) return;
    const nextRows = [...rows];
    nextRows.splice(selectedRow + 1, 0, [...rows[selectedRow]]);
    onChange({ headers, alignments, rows: nextRows, columnWidths: widths });
    focusCellProgrammatically(selectedRow + 1, selectedCol, 0);
  };

  const deleteCurrentRow = () => {
    if (rows.length <= 1 || selectedRow < 0) return;
    const nextRows = rows.filter((_, idx) => idx !== selectedRow);
    const nextActiveRow = Math.min(selectedRow, nextRows.length - 1);
    onChange({ headers, alignments, rows: nextRows, columnWidths: widths });
    focusCellProgrammatically(nextActiveRow, selectedCol, 0);
  };

  const addColumnAfter = (targetColIdx?: number) => {
    const baseCol = targetColIdx !== undefined ? targetColIdx : selectedCol;
    const insertIdx = baseCol + 1;
    const nextHeaders = [...headers];
    nextHeaders.splice(insertIdx, 0, `Colonne ${nextHeaders.length + 1}`);
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
    onFocusBlock();
    focusCellProgrammatically(-1, insertIdx, nextHeaders[insertIdx].length);
  };

  const deleteCurrentColumn = () => {
    if (headers.length <= 1) return;
    const nextHeaders = headers.filter((_, i) => i !== selectedCol);
    const nextAlign = alignments.filter((_, i) => i !== selectedCol);
    const nextRows = rows.map((r) => r.filter((_, i) => i !== selectedCol));
    const nextWidths = nextHeaders.map(() => Math.floor(100 / nextHeaders.length));
    setWidths(nextWidths);
    const nextCol = Math.min(selectedCol, nextHeaders.length - 1);
    onChange({
      headers: nextHeaders,
      alignments: nextAlign,
      rows: nextRows,
      columnWidths: nextWidths,
    });
    focusCellProgrammatically(selectedRow, nextCol, 0);
  };

  const moveRow = (direction: -1 | 1) => {
    if (selectedRow < 0) return;
    const target = selectedRow + direction;
    if (target < 0 || target >= rows.length) return;
    const nextRows = [...rows];
    const [moved] = nextRows.splice(selectedRow, 1);
    nextRows.splice(target, 0, moved);
    onChange({ headers, alignments, rows: nextRows, columnWidths: widths });
    focusCellProgrammatically(target, selectedCol);
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
    onChange({
      headers: nextHeaders,
      alignments: nextAlign,
      rows: nextRows,
      columnWidths: nextWidths,
    });
    focusCellProgrammatically(selectedRow, target);
  };

  const sortByColumn = (colIdx: number) => {
    const nextAsc = sortState?.col === colIdx ? !sortState.asc : true;
    setSortState({ col: colIdx, asc: nextAsc });
    const sorted = [...rows].sort((a, b) => {
      const valA = (a[colIdx] ?? '').trim();
      const valB = (b[colIdx] ?? '').trim();
      const cmp = valA.localeCompare(valB, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return nextAsc ? cmp : -cmp;
    });
    onChange({ headers, alignments, rows: sorted, columnWidths: widths });
  };

  const copyTableAs = (mode: 'md' | 'csv') => {
    if (mode === 'csv') {
      const escapeCsv = (val: string) =>
        val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      const lines = [
        headers.map(escapeCsv).join(','),
        ...rows.map((r) => headers.map((_, i) => escapeCsv(r[i] ?? '')).join(',')),
      ];
      navigator.clipboard?.writeText(lines.join('\n'));
    } else {
      const headerLine = `| ${headers.join(' | ')} |`;
      const alignLine = `| ${alignments
        .map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : ':---'))
        .join(' | ')} |`;
      const rowLines = rows.map(
        (r) => `| ${headers.map((_, i) => r[i] ?? '').join(' | ')} |`
      );
      navigator.clipboard?.writeText([headerLine, alignLine, ...rowLines].join('\n'));
    }
    setCopiedMode(mode);
    window.setTimeout(() => setCopiedMode(null), 1400);
  };

  // Multi-cell spreadsheet paste (Excel / Google Sheets TSV or CSV)
  const handleCellPasteCapture = (
    e: React.ClipboardEvent<HTMLElement>,
    startRow: number,
    startCol: number
  ) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw || (!raw.includes('\t') && !raw.includes('\n'))) return;

    const lines = raw
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter((l, idx, arr) => !(idx === arr.length - 1 && l === ''));

    if (lines.length === 0) return;
    const isTsv = lines.some((l) => l.includes('\t'));
    const isCsv =
      !isTsv &&
      lines.length > 1 &&
      lines[0].includes(',') &&
      lines.every((l) => l.split(',').length === lines[0].split(',').length);

    if (!isTsv && !isCsv && lines.length <= 1) return;

    const matrix = lines.map((l) => (isTsv ? l.split('\t') : isCsv ? l.split(',') : [l]));
    if (matrix.length === 1 && matrix[0].length <= 1) return;

    e.preventDefault();
    e.stopPropagation();

    const maxColsNeeded = Math.max(
      headers.length,
      ...matrix.map((m) => startCol + m.length)
    );
    const nextHeaders = [...headers];
    const nextAlign = [...alignments];
    while (nextHeaders.length < maxColsNeeded) {
      nextHeaders.push(`Colonne ${nextHeaders.length + 1}`);
      nextAlign.push('left');
    }

    const nextRows = rows.map((r) => {
      const copy = [...r];
      while (copy.length < maxColsNeeded) copy.push('');
      return copy;
    });

    matrix.forEach((pastedRow, rOffset) => {
      const targetRow = startRow + rOffset;
      if (targetRow === -1) {
        pastedRow.forEach((val, cOffset) => {
          if (startCol + cOffset < nextHeaders.length) {
            nextHeaders[startCol + cOffset] = val.trim();
          }
        });
      } else {
        while (nextRows.length <= targetRow) {
          nextRows.push(nextHeaders.map(() => ''));
        }
        pastedRow.forEach((val, cOffset) => {
          if (startCol + cOffset < nextHeaders.length) {
            nextRows[targetRow][startCol + cOffset] = val.trim();
          }
        });
      }
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

  // Spreadsheet keyboard navigation across header (row = -1) and body rows (0 .. rows.length - 1)
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    row: number,
    col: number,
    cellText: string
  ) => {
    const el = e.currentTarget;
    const selStart = el.selectionStart ?? 0;
    const selEnd = el.selectionEnd ?? 0;
    const hasSel = selStart !== selEnd;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey) {
        if (col + 1 < headers.length) {
          focusCellProgrammatically(row, col + 1, 999999);
        } else if (row + 1 < rows.length) {
          focusCellProgrammatically(row + 1, 0, 999999);
        } else {
          // At the very last cell of the table: pressing Tab automatically appends a new row!
          addRowAfter(rows.length - 1);
        }
      } else {
        if (col - 1 >= 0) {
          focusCellProgrammatically(row, col - 1, 999999);
        } else if (row > -1) {
          focusCellProgrammatically(row - 1, headers.length - 1, 999999);
        }
      }
      return;
    }

    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (e.shiftKey) {
        if (row > -1) {
          focusCellProgrammatically(row - 1, col, 999999);
        }
      } else {
        if (row + 1 < rows.length) {
          focusCellProgrammatically(row + 1, col, 999999);
        } else {
          addRowAfter(rows.length - 1);
        }
      }
      return;
    }

    if (e.key === 'ArrowUp' && !e.shiftKey && !hasSel) {
      e.preventDefault();
      if (e.altKey) {
        moveRow(-1);
        return;
      }
      if (row > -1) {
        focusCellProgrammatically(row - 1, col, selStart);
      } else {
        onExitTable?.('up');
      }
      return;
    }

    if (e.key === 'ArrowDown' && !e.shiftKey && !hasSel) {
      e.preventDefault();
      if (e.altKey) {
        moveRow(1);
        return;
      }
      if (row + 1 < rows.length) {
        focusCellProgrammatically(row + 1, col, selStart);
      } else {
        onExitTable?.('down');
      }
      return;
    }

    if (e.key === 'ArrowLeft' && !e.shiftKey && !hasSel && selStart === 0) {
      if (e.altKey) {
        e.preventDefault();
        moveColumn(-1);
        return;
      }
      if (col > 0) {
        e.preventDefault();
        focusCellProgrammatically(row, col - 1, 999999);
      }
      return;
    }

    if (
      e.key === 'ArrowRight' &&
      !e.shiftKey &&
      !hasSel &&
      selEnd === cellText.length
    ) {
      if (e.altKey) {
        e.preventDefault();
        moveColumn(1);
        return;
      }
      if (col + 1 < headers.length) {
        e.preventDefault();
        focusCellProgrammatically(row, col + 1, 0);
      }
      return;
    }
  };

  return (
    <div className="relative my-5 group/table" onClick={onFocusBlock}>
      {/* Contextual Floating Table Toolbar */}
      {isActive && (
        <div
          className="no-print no-export cursiv-popup-anim cursiv-glass-toolbar flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 mb-2 rounded-lg shadow-md text-xs"
          style={{ color: 'var(--text-color)' }}
        >
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-medium opacity-70 mr-0.5">Alignement :</span>
            <button
              type="button"
              onClick={() => setAlignment('left')}
              className={`p-1 rounded hover:bg-black/10 cursor-pointer ${
                alignments[selectedCol] === 'left' ? 'text-[var(--primary-color)] bg-blue-500/10' : ''
              }`}
              title="Aligner à gauche"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setAlignment('center')}
              className={`p-1 rounded hover:bg-black/10 cursor-pointer ${
                alignments[selectedCol] === 'center' ? 'text-[var(--primary-color)] bg-blue-500/10' : ''
              }`}
              title="Centrer"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setAlignment('right')}
              className={`p-1 rounded hover:bg-black/10 cursor-pointer ${
                alignments[selectedCol] === 'right' ? 'text-[var(--primary-color)] bg-blue-500/10' : ''
              }`}
              title="Aligner à droite"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>

            <div className="h-3.5 w-px mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

            <button
              type="button"
              onClick={() => addRowAfter()}
              className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-black/10 cursor-pointer"
              title="Insérer une ligne sous la cellule active (Entrée)"
            >
              <Rows className="w-3.5 h-3.5" />
              <Plus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => addColumnAfter()}
              className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-black/10 cursor-pointer"
              title="Insérer une colonne à droite"
            >
              <Columns className="w-3.5 h-3.5" />
              <Plus className="w-3 h-3" />
            </button>
            {selectedRow >= 0 && (
              <button
                type="button"
                onClick={duplicateCurrentRow}
                className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-black/10 cursor-pointer"
                title="Dupliquer la ligne active"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Ligne</span>
              </button>
            )}

            <div className="h-3.5 w-px mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

            <button
              type="button"
              onClick={() => sortByColumn(selectedCol)}
              className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-black/10 cursor-pointer"
              title="Trier la colonne (A→Z / Z→A / Numérique)"
            >
              {sortState?.col === selectedCol && !sortState.asc ? (
                <ArrowUpZA className="w-3.5 h-3.5 text-[var(--primary-color)]" />
              ) : (
                <ArrowDownAZ className="w-3.5 h-3.5" />
              )}
              <span>Trier</span>
            </button>

            <button
              type="button"
              onClick={() => moveRow(-1)}
              className="p-1 rounded hover:bg-black/10 cursor-pointer"
              title="Monter la ligne (Alt+↑)"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveRow(1)}
              className="p-1 rounded hover:bg-black/10 cursor-pointer"
              title="Descendre la ligne (Alt+↓)"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveColumn(-1)}
              className="p-1 rounded hover:bg-black/10 cursor-pointer"
              title="Déplacer la colonne à gauche (Alt+←)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveColumn(1)}
              className="p-1 rounded hover:bg-black/10 cursor-pointer"
              title="Déplacer la colonne à droite (Alt+→)"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <div className="h-3.5 w-px mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

            <button
              type="button"
              onClick={() => copyTableAs('md')}
              className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-black/10 cursor-pointer"
              title="Copier le tableau en Markdown"
            >
              {copiedMode === 'md' ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>MD</span>
            </button>
            <button
              type="button"
              onClick={() => copyTableAs('csv')}
              className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-black/10 cursor-pointer"
              title="Copier le tableau en CSV (Excel)"
            >
              {copiedMode === 'csv' ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>CSV</span>
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

          {columnNumericStats && (
            <div
              className="px-2 py-0.5 rounded font-mono text-[11px]"
              style={{
                backgroundColor: 'var(--code-bg-color)',
                color: 'var(--primary-color)',
              }}
              title="Calcul automatique sur les valeurs numériques de la colonne active"
            >
              Σ {columnNumericStats.sum} · Moy {columnNumericStats.avg}
            </div>
          )}
        </div>
      )}

      <div className="relative flex items-stretch">
        <div className="flex-1 overflow-x-auto">
          <table
            className="w-full border-collapse text-sm"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <thead>
              <tr style={{ backgroundColor: 'var(--table-alt-bg)' }}>
                {headers.map((headerText, colIdx) => {
                  const isEditingCell =
                    isActive && activeCell?.row === -1 && activeCell?.col === colIdx;
                  const isSelectedCol = isActive && selectedCol === colIdx;
                  return (
                    <th
                      key={colIdx}
                      style={{
                        borderColor: 'var(--border-color)',
                        textAlign: alignments[colIdx] || 'left',
                        width: `${widths[colIdx] || Math.floor(100 / headers.length)}%`,
                        boxShadow: isEditingCell
                          ? 'inset 0 0 0 1.5px var(--primary-color)'
                          : isSelectedCol
                          ? 'inset 0 -2px 0 0 color-mix(in srgb, var(--primary-color) 45%, transparent)'
                          : undefined,
                      }}
                      className="relative border px-3 py-2 font-semibold select-text cursor-text transition-shadow"
                      onMouseDown={(e) => activateCellFromMouse(e, -1, colIdx)}
                      onPasteCapture={(e) => handleCellPasteCapture(e, -1, colIdx)}
                    >
                      {isEditingCell ? (
                        <InlinePageInput
                          value={headerText}
                          multiline={false}
                          autoFocus
                          initialCaretOffset={cellCaretOffset}
                          pendingMouseDownPoint={
                            cellMousePoint?.row === -1 && cellMousePoint?.col === colIdx
                              ? cellMousePoint.point
                              : null
                          }
                          externalCaretVersion={cellCaretVersion}
                          motionBlur={motionBlur}
                          smartTypography={smartTypography}
                          placeholder={`Colonne ${colIdx + 1}`}
                          style={{ textAlign: alignments[colIdx] || 'left' }}
                          onChange={(val, caret) => {
                            setCellCaretOffset(caret);
                            const next = [...headers];
                            next[colIdx] = val;
                            onChange({ headers: next, alignments, rows, columnWidths: widths });
                          }}
                          onKeyDown={(e) => handleCellKeyDown(e, -1, colIdx, headerText)}
                        />
                      ) : (
                        <div className="min-h-[1.4rem]">
                          <LiveInlineTokens
                            text={headerText}
                            isBlockActive={false}
                            cursorOffset={null}
                            mathEnv={mathEnv}
                            footnotesMap={footnotesMap}
                            pandocMathRules={pandocMathRules}
                          />
                        </div>
                      )}
                      {/* Mouse Dragging Column Resizer Handle */}
                      <div
                        data-col-resizer="true"
                        onMouseDown={(e) => handleMouseDownResize(e, colIdx)}
                        className="no-print no-export absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors"
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
                    backgroundColor:
                      rowIdx % 2 === 1 ? 'var(--table-alt-bg)' : 'transparent',
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
                          boxShadow: isEditingCell
                            ? 'inset 0 0 0 1.5px var(--primary-color)'
                            : undefined,
                        }}
                        className="border px-3 py-2 select-text cursor-text transition-shadow"
                        onMouseDown={(e) => activateCellFromMouse(e, rowIdx, colIdx)}
                        onPasteCapture={(e) => handleCellPasteCapture(e, rowIdx, colIdx)}
                      >
                        {isEditingCell ? (
                          <InlinePageInput
                            value={cellValue}
                            multiline={false}
                            autoFocus
                            initialCaretOffset={cellCaretOffset}
                            pendingMouseDownPoint={
                              cellMousePoint?.row === rowIdx && cellMousePoint?.col === colIdx
                                ? cellMousePoint.point
                                : null
                            }
                            externalCaretVersion={cellCaretVersion}
                            motionBlur={motionBlur}
                            smartTypography={smartTypography}
                            placeholder="Cellule..."
                            style={{ textAlign: alignments[colIdx] || 'left' }}
                            onChange={(val, caret) => {
                              setCellCaretOffset(caret);
                              const nextRows = rows.map((r) => [...r]);
                              nextRows[rowIdx][colIdx] = val;
                              onChange({
                                headers,
                                alignments,
                                rows: nextRows,
                                columnWidths: widths,
                              });
                            }}
                            onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx, cellValue)}
                          />
                        ) : (
                          <div className="min-h-[1.4rem]">
                            <LiveInlineTokens
                              text={cellValue}
                              isBlockActive={false}
                              cursorOffset={null}
                              mathEnv={mathEnv}
                              footnotesMap={footnotesMap}
                              pandocMathRules={pandocMathRules}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Quick 1-click "+ Add Column" edge button on hover */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            addColumnAfter(headers.length - 1);
          }}
          title="Ajouter une colonne à droite"
          className="no-print no-export opacity-0 group-hover/table:opacity-65 hover:!opacity-100 ml-1 px-1 rounded border flex items-center justify-center transition-opacity cursor-pointer"
          style={{
            borderColor: 'var(--border-color)',
            backgroundColor: 'var(--code-bg-color)',
            color: 'var(--meta-content-color)',
          }}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick 1-click "+ Ajouter une ligne" bottom edge bar on hover */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          addRowAfter(rows.length - 1);
        }}
        title="Ajouter une nouvelle ligne en bas du tableau"
        className="no-print no-export opacity-0 group-hover/table:opacity-65 hover:!opacity-100 mt-1 w-full py-1 rounded border text-xs flex items-center justify-center gap-1 transition-opacity cursor-pointer"
        style={{
          borderColor: 'var(--border-color)',
          backgroundColor: 'var(--code-bg-color)',
          color: 'var(--meta-content-color)',
        }}
      >
        <Plus className="w-3 h-3" />
        <span>Ajouter une ligne</span>
      </button>
    </div>
  );
};
