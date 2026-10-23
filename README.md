# Cursiv.

**Cursiv.** est une application desktop de lecture et d'édition Markdown **WYSIWYM** (*What You See Is What You Mean*) 100% gratuite et open-source (licence MIT), conçue avec **Tauri v2 (Rust)**, **React 19**, **TypeScript**, **Tailwind CSS** et **CodeMirror 6**.

---

## ✨ Fonctionnalités Principales

- **Frappe directe sur la page & Curseur fluide façon Word** : aucune fenêtre de prévisualisation séparée ni boîte de saisie encadrée. Le curseur glisse de manière fluide (`68ms cubic-bezier`) et chaque caractère apparaît avec une micro-transition douce.
- **Commandes Slash (`/`) & Détection différée (`#`, `##`, `###`)** :
  - Tapez `/title`, `/h2`, `/table`, `/code`, `/math`, `/todo`, `/quote`, `/note`, `/mermaid`, `/toc`, `/divider` pour transformer ou insérer n'importe quel bloc.
  - Tapez `#`, `##`, `###`, `- `, `1. `, `[] `, `> ` : Cursiv attend la fin de votre frappe (`420ms`) avant d'appliquer automatiquement le style.
- **Sélection par rectangle façon Notion & Clic Droit personnalisé** :
  - Glissez la souris depuis les marges pour sélectionner plusieurs blocs avec un lasso bleu et les supprimer, copier ou dupliquer ensemble.
  - Menu contextuel clic droit complet dans l'éditeur et la barre latérale.
- **Mathématiques, Physique & Chimie** : intégration native **KaTeX**, **mhchem** (`\ce{...}`), **Physics**, macros `\newcommand` et références croisées `\label` / `\eqref`.
- **Blocs de Code & Diagrammes Live** : **CodeMirror 6** embarqué + rendu vectoriel SVG en direct (**Mermaid**, **Flowchart**, **Sequence**).
- **6 Thèmes CSS avec Hot-Reload** : *GitHub, Night, Newsprint, Pixyll, Whitey, Gothic*.
- **Import & Export Universel** : PDF natif, HTML, PNG et pont **Pandoc** (`.docx`, `.odt`, `.tex`, `.epub`, `.rst`, `.rtf`, `.wiki`).

---

## ⌨️ Raccourcis Clavier Windows

| Raccourci | Action |
| :--- | :--- |
| `Ctrl+N` / Double-clic Sidebar | Nouveau document + renommage automatique |
| `Ctrl+O` | Ouvrir un dossier local |
| `Ctrl+S` | Enregistrer immédiatement |
| `Ctrl+D` | Dupliquer le document actif |
| `Ctrl+P` | Exporter en PDF |
| `F2` | Renommer le fichier actif |
| `Ctrl+1` .. `Ctrl+6` / `Ctrl+0` | Titre H1..H6 / Paragraphe |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+K` | Gras / Italique / Lien |
| `Ctrl+T` | Insérer un tableau |
| `Ctrl+/` | Basculer en Mode Code Source (CodeMirror 6 synchronisé) |
| `F8` / `F9` | Focus Mode / Typewriter Mode |
| `Ctrl+Shift+L` | Afficher / Masquer la barre latérale |

---

## 🚀 Développement & Compilation

```bash
# Installer les dépendances
npm install

# Lancer en mode développement web (http://localhost:1420)
npm run dev

# Lancer l'application desktop native Tauri v2
npm run tauri:dev

# Compiler l'installateur desktop (.msi / .exe / .dmg / .AppImage)
npm run tauri:build
```

---

## 📄 Licence

Distribué sous licence **MIT**. Voir le fichier [LICENSE](./LICENSE).
