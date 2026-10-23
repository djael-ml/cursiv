# Cursiv.

[![Télécharger Cursiv pour Windows (.exe)](https://img.shields.io/badge/T%C3%A9l%C3%A9charger_Cursiv-Windows_Installer_(.exe)-0f172a?style=for-the-badge&logo=windows)](https://github.com/djael-ml/cursiv/releases/latest/download/Cursiv-Setup.exe)
[![Dernière Release GitHub](https://img.shields.io/github/v/release/djael-ml/cursiv?style=for-the-badge&label=Release&color=2563eb)](https://github.com/djael-ml/cursiv/releases/latest)

> 📥 **Téléchargement direct Windows (10 / 11 / LTSC 64-bit)** : [**`Cursiv-Setup.exe`**](https://github.com/djael-ml/cursiv/releases/latest/download/Cursiv-Setup.exe) *(Installeur NSIS sans droits Administrateur requis, avec WebView2 auto-bootstrapper et mise à jour automatique intégrée).*

**Cursiv.** est une application desktop de lecture et d'édition Markdown **WYSIWYM** (*What You See Is What You Mean*) 100% gratuite et open-source (licence MIT), conçue et développée par **Djaël Mola** avec **Tauri v2 (Rust)**, **React 19**, **TypeScript**, **Tailwind CSS** et **CodeMirror 6**.

---

## ✨ Fonctionnalités Principales

- **Recherche & Remplacement en temps réel (`Ctrl+F` / `Ctrl+H`)** : barre d'outils ultra-fluide sans altération du DOM basée sur l'API native CSS Custom Highlight (`::highlight`). Navigation occurrence par occurrence, sensibilité à la casse et remplacement unitaire ou global.
- **Quick Switcher & Palette de Commandes (`Ctrl+E` / `Ctrl+Shift+P`)** : recherche floue ultra-rapide parmi tous les fichiers de votre espace de travail et exécution instantanée de toutes les actions de Cursiv au clavier.
- **Historique Document Global & Fusion de Frappe (`Ctrl+Z` / `Ctrl+Y`)** : pile d'annulation/rétablissement intelligente préservant la structure des blocs et regroupant les frappes continues.
- **Titres Repliables & Navigation Section (`Fold / Unfold`)** : masquez ou dépliez les chapitres entiers (H1..H6) en un clic sur le chevron avec indicateur discret de section repliée.
- **Glisser-Déposer de Blocs (Drag & Drop)** : réorganisez vos paragraphes, tableaux et sections instantanément à la souris grâce à la poignée latérale et à la ligne de dépose magnétique.
- **WikiLinks & Maillage Interne (`[[Note]]` / `[[Note|Libellé]]`)** : liez vos notes entre elles avec détection automatique et navigation en un clic.
- **Frappe directe sur la page & Curseur fluide façon Word** : aucune fenêtre de prévisualisation séparée ni boîte de saisie encadrée. Le curseur glisse de manière fluide (`68ms cubic-bezier`) et chaque caractère apparaît avec une micro-transition douce.
- **Commandes Slash (`/`) & Détection instantanée (`#`, `##`, `###`)** :
  - Tapez `/title`, `/h2`, `/table`, `/code`, `/math`, `/todo`, `/quote`, `/note`, `/mermaid`, `/toc`, `/divider` pour transformer ou insérer n'importe quel bloc.
  - `# `, `## `, `### ` appliquent instantanément le formatage dès l'espace, et `Retour Arrière` au début rétrograde progressivement les titres (`H3 -> H2 -> H1 -> Paragraphe`).
- **Sélection par rectangle façon Notion & Clic Droit personnalisé** :
  - Glissez la souris depuis les marges pour sélectionner plusieurs blocs avec un lasso bleu et les supprimer, copier ou dupliquer ensemble.
  - Clic sur une marge vide déselectionne proprement le bloc actif pour révéler l'aperçu WYSIWYM complet.
  - Menu contextuel clic droit complet dans l'éditeur et la barre latérale.
- **Double Moteur d'Auto-Update GitHub Releases** :
  - **Moteur Primaire (`@tauri-apps/plugin-updater`)** : vérification automatique du manifeste signé `latest.json`, barre de progression et relance automatique avec arrêt préalable propre des instances orphelines.
  - **Moteur Fallback Direct (`.exe`)** : téléchargement direct de `Cursiv-Setup.exe` depuis GitHub Releases et mise à jour silencieuse NSIS (`/S`).
- **Mathématiques, Physique & Chimie** : intégration native **KaTeX**, **mhchem** (`\ce{...}`), **Physics**, macros `\newcommand` et références croisées `\label` / `\eqref`.
- **Blocs de Code & Diagrammes Live** : **CodeMirror 6** embarqué + rendu vectoriel SVG en direct (**Mermaid**, **Flowchart**, **Sequence**).
- **6 Thèmes CSS avec Hot-Reload** : *GitHub, Night, Newsprint, Pixyll, Whitey, Gothic*.
- **Import & Export Universel** : PDF natif, HTML, PNG et pont **Pandoc** (`.docx`, `.odt`, `.tex`, `.epub`, `.rst`, `.rtf`, `.wiki`).

---

## ⌨️ Raccourcis Clavier Windows

| Raccourci | Action |
| :--- | :--- |
| `Ctrl+Z` / `Ctrl+Y` (`Ctrl+Shift+Z`) | Annuler / Rétablir |
| `Ctrl+F` / `Ctrl+H` | Rechercher / Remplacer dans le document |
| `Ctrl+E` | Quick Switcher (ouverture rapide de document) |
| `Ctrl+Shift+P` | Palette de commandes (`>`) |
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

# Compiler l'installateur Windows NSIS (.exe)
npx tauri build --bundles nsis
```

---

## 👤 Auteur & Licence

Conçu et développé par **Djaël Mola**.  
Distribué sous licence **MIT**. Voir le fichier [LICENSE](./LICENSE).
