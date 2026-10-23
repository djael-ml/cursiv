import React from 'react';
import {
  AlertTriangle,
  CheckSquare,
  Code,
  FileCode2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Image,
  Info,
  List,
  ListOrdered,
  ListTree,
  Minus,
  Quote,
  Sigma,
  Table,
  Type,
} from 'lucide-react';

export interface SlashCommandItem {
  id:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'paragraph'
    | 'bullet-list'
    | 'ordered-list'
    | 'task-list'
    | 'blockquote'
    | 'code'
    | 'math'
    | 'table'
    | 'callout-note'
    | 'callout-warning'
    | 'mermaid'
    | 'toc'
    | 'hr'
    | 'image';
  label: string;
  description: string;
  shortcut: string;
  keywords: string[];
  icon: React.ReactNode;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'h1',
    label: 'Titre 1 (Grand titre)',
    description: 'Titre principal de section',
    shortcut: '/title · #',
    keywords: ['title', 'titre', 'h1', 'heading1', 'header', 'grand'],
    icon: <Heading1 className="w-4 h-4" />,
  },
  {
    id: 'h2',
    label: 'Titre 2 (Sous-titre)',
    description: 'Sous-section moyenne avec bordure',
    shortcut: '/h2 · ##',
    keywords: ['subtitle', 'soustitre', 'h2', 'heading2', 'titre2'],
    icon: <Heading2 className="w-4 h-4" />,
  },
  {
    id: 'h3',
    label: 'Titre 3',
    description: 'Sous-section compacte',
    shortcut: '/h3 · ###',
    keywords: ['h3', 'heading3', 'titre3'],
    icon: <Heading3 className="w-4 h-4" />,
  },
  {
    id: 'h4',
    label: 'Titre 4',
    description: 'Petit intertitre',
    shortcut: '/h4 · ####',
    keywords: ['h4', 'heading4', 'titre4'],
    icon: <Heading4 className="w-4 h-4" />,
  },
  {
    id: 'paragraph',
    label: 'Texte (Paragraphe)',
    description: 'Paragraphe de texte standard',
    shortcut: '/text',
    keywords: ['text', 'texte', 'p', 'paragraph', 'paragraphe', 'normal'],
    icon: <Type className="w-4 h-4" />,
  },
  {
    id: 'task-list',
    label: 'Liste de tâches (To-do)',
    description: 'Cases à cocher interactives',
    shortcut: '/todo · []',
    keywords: ['todo', 'task', 'tache', 'tâche', 'check', 'checkbox'],
    icon: <CheckSquare className="w-4 h-4" />,
  },
  {
    id: 'bullet-list',
    label: 'Liste à puces',
    description: 'Liste simple non ordonnée',
    shortcut: '/list · -',
    keywords: ['list', 'liste', 'bullet', 'puces', 'ul'],
    icon: <List className="w-4 h-4" />,
  },
  {
    id: 'ordered-list',
    label: 'Liste numérotée',
    description: 'Liste ordonnée 1, 2, 3...',
    shortcut: '/num · 1.',
    keywords: ['num', 'ordered', 'number', 'numerotee', 'numérotée', 'ol'],
    icon: <ListOrdered className="w-4 h-4" />,
  },
  {
    id: 'table',
    label: 'Tableau interactif',
    description: 'Grille redimensionnable Markdown Extra',
    shortcut: '/table',
    keywords: ['table', 'tableau', 'grid', 'grille'],
    icon: <Table className="w-4 h-4" />,
  },
  {
    id: 'code',
    label: 'Bloc de Code',
    description: 'Éditeur CodeMirror 6 avec coloration syntaxique',
    shortcut: '/code · ```',
    keywords: ['code', 'snippet', 'rust', 'js', 'python', 'ts'],
    icon: <Code className="w-4 h-4" />,
  },
  {
    id: 'math',
    label: 'Bloc d’Équation LaTeX',
    description: 'Formule mathématique ou chimique KaTeX / mhchem',
    shortcut: '/math · $$',
    keywords: ['math', 'latex', 'equation', 'équation', 'katex', 'chem'],
    icon: <Sigma className="w-4 h-4" />,
  },
  {
    id: 'blockquote',
    label: 'Citation',
    description: 'Bloc de citation mis en retrait',
    shortcut: '/quote · >',
    keywords: ['quote', 'citation', 'blockquote'],
    icon: <Quote className="w-4 h-4" />,
  },
  {
    id: 'callout-note',
    label: 'Encadré Note / Info',
    description: 'Alerte visuelle bleue [!NOTE]',
    shortcut: '/note',
    keywords: ['callout', 'note', 'info', 'alerte', 'encadre', 'tip'],
    icon: <Info className="w-4 h-4 text-[#0969da]" />,
  },
  {
    id: 'callout-warning',
    label: 'Encadré Avertissement',
    description: 'Alerte visuelle ambre [!WARNING]',
    shortcut: '/warn',
    keywords: ['warning', 'warn', 'attention', 'avertissement', 'caution'],
    icon: <AlertTriangle className="w-4 h-4 text-[#9a6700]" />,
  },
  {
    id: 'mermaid',
    label: 'Diagramme Mermaid',
    description: 'Organigramme ou diagramme de séquence SVG live',
    shortcut: '/mermaid',
    keywords: ['mermaid', 'diagram', 'diagramme', 'flowchart', 'graph'],
    icon: <FileCode2 className="w-4 h-4" />,
  },
  {
    id: 'toc',
    label: 'Table des Matières',
    description: 'Sommaire automatique basé sur les titres H1–H6',
    shortcut: '/toc',
    keywords: ['toc', 'sommaire', 'plan', 'outline'],
    icon: <ListTree className="w-4 h-4" />,
  },
  {
    id: 'hr',
    label: 'Séparateur horizontal',
    description: 'Ligne de division visuelle entre deux sections',
    shortcut: '/divider · ---',
    keywords: ['hr', 'divider', 'ligne', 'separateur', 'séparateur'],
    icon: <Minus className="w-4 h-4" />,
  },
  {
    id: 'image',
    label: 'Image / Illustration',
    description: 'Insérer une image redimensionnable',
    shortcut: '/image',
    keywords: ['image', 'img', 'photo', 'picture', 'illustration'],
    icon: <Image className="w-4 h-4" />,
  },
];

export function filterSlashCommands(query: string): SlashCommandItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (item) =>
      item.id.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q) ||
      item.keywords.some((kw) => kw.includes(q))
  );
}

interface SlashCommandMenuProps {
  query: string;
  results: SlashCommandItem[];
  selectedIndex: number;
  onSelect: (item: SlashCommandItem) => void;
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  query,
  results,
  selectedIndex,
  onSelect,
}) => {
  if (results.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-color) 96%, transparent)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-color)',
      }}
      className="no-print no-export cursiv-popup-anim absolute left-0 top-full mt-1.5 z-50 w-72 max-h-80 overflow-y-auto rounded-xl border shadow-2xl backdrop-blur-md py-1.5 select-none"
    >
      <div
        className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold border-b flex items-center justify-between"
        style={{
          borderColor: 'var(--border-color)',
          color: 'var(--meta-content-color)',
        }}
      >
        <span>Commandes Cursiv</span>
        <span className="font-mono">/{query}</span>
      </div>

      <div className="py-1">
        {results.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
              style={{
                backgroundColor: isSelected
                  ? 'color-mix(in srgb, var(--primary-color) 13%, transparent)'
                  : 'transparent',
              }}
              className="w-full px-3 py-1.5 text-left flex items-center justify-between gap-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundColor: 'var(--code-bg-color)',
                    color: isSelected ? 'var(--primary-color)' : 'var(--text-color)',
                  }}
                >
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <div
                    className="text-xs font-medium truncate"
                    style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-color)' }}
                  >
                    {item.label}
                  </div>
                  <div
                    className="text-[10px] truncate"
                    style={{ color: 'var(--meta-content-color)' }}
                  >
                    {item.description}
                  </div>
                </div>
              </div>
              <span
                className="text-[10px] font-mono shrink-0 opacity-60"
                style={{ color: 'var(--meta-content-color)' }}
              >
                {item.shortcut}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
