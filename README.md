# Koha List Widget

Widget Web réutilisable pour valoriser sur des sites Web des
**sélections bibliographiques constituées dans Koha**.

## Démarrage rapide

Avec Python 3.10+ et Node.js 22+, depuis la racine du dépôt :

``` console
python -m pip install -r requirements.txt
python scripts/csv_to_json.py --skip-covers
npm start
```

Ouvrir **http://127.0.0.1:4173/demo/index.html**. La démonstration propose
six exemples, leur code HTML et un journal local des événements. `Ctrl+C`
arrête le serveur. Aucun appel aux fournisseurs de couvertures n'est effectué
avec `--skip-covers` ; les images sont alors remplacées par des placeholders.

Le **[guide d'utilisation](docs/UTILISATION.md)** détaille la préparation
des données, l'intégration dans un site, les réglages, la personnalisation,
Matomo, la publication et la mise à jour quotidienne.

## Principe

Le projet transforme un export CSV Koha en ressources statiques prêtes à
être publiées :

``` text
Koha
  │
  └── export CSV quotidien
          │
          ▼
   csv_to_json.py
      ├── JSON
      ├── couvertures locales
      └── fichiers XLSX par liste
              │
              ▼
        <koha-list-widget>
          ├── affichage Web
          ├── liens vers Primo
          └── événements → Matomo
```

Le navigateur n'interroge ni Koha ni les fournisseurs de couvertures en
temps réel.

## Fonctionnalités

Le Web Component `<koha-list-widget>` propose :

-   quatre modes d'affichage : `carousel`, `grid`, `list` et `compact` ;
-   sélection d'une liste Koha par `list_id` ;
-   tri par titre, auteur ou date ;
-   recherche locale ;
-   pagination pour `grid`, `list` et `compact` ;
-   affichage repliable ;
-   autoplay facultatif du carrousel ;
-   liens vers les notices Primo ;
-   téléchargement de la liste complète au format Excel ;
-   récupération et cache local des couvertures ;
-   prise en compte des exemplaires via `holdings` ;
-   accessibilité clavier et technologies d'assistance ;
-   respect de `prefers-reduced-motion` ;
-   personnalisation graphique via les Shadow Parts ;
-   suivi des interactions avec Matomo, sans dépendance directe du
    composant à Matomo.

## Exemple

``` html
<script type="module" src="/widget/koha-list-widget.js"></script>
<script src="/widget/koha-list-widget-matomo.js" defer></script>

<koha-list-widget
  src="/data/data.json"
  list_id="11"
  display="carousel"
  limit="30"
  sort="date"
  searchable
  show-list-name
  export="xlsx"
  analytics-id="list11-accueil">
</koha-list-widget>
```

Le paramètre `list_id` est obligatoire et correspond à un numéro de liste publique Koha.

## Architecture du dépôt

``` text
koha-widget/
├── data/
│   ├── ...
│   └── *.json
├── scripts/
│   └── csv_to_json.py
├── widget/
│   ├── koha-list-widget.js
│   ├── koha-list-widget-custom.css
│   └── koha-list-widget-matomo.js
├── covers/
│   └── .cover-cache.json
├── exports/
│   └── liste-{list_id}.xlsx
├── demo/
│   └── index.html
├── docs/
│   ├── PRD.md
│   ├── CODEX.md
│   ├── IMPLEMENTATION.md
│   ├── DATA_MODEL.md
│   ├── WIDGET.md
│   ├── COVERS.md
│   ├── EXPORT.md
│   ├── ACCESSIBILITY.md
│   ├── SORTING.md
│   ├── ANALYTICS.md
│   └── TESTING.md
└── README.md
```

## Documentation

La documentation détaillée se trouve dans [`docs/`](docs/).

Pour comprendre ou développer le projet, lire dans cet ordre :

1.  [`docs/PRD.md`](docs/PRD.md) --- **source de vérité fonctionnelle**
    ;
2.  [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) --- architecture
    et ordre d'implémentation ;
3.  [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) --- contrat CSV/JSON et
    `holdings` ;
4.  [`docs/WIDGET.md`](docs/WIDGET.md) --- API et comportements du Web
    Component ;
5.  [`docs/COVERS.md`](docs/COVERS.md) --- récupération et cache des
    couvertures ;
6.  [`docs/EXPORT.md`](docs/EXPORT.md) --- génération des fichiers Excel
    ;
7.  [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md) --- exigences
    d'accessibilité ;
8.  [`docs/SORTING.md`](docs/SORTING.md) --- tri, recherche, limite et
    pagination ;
9.  [`docs/ANALYTICS.md`](docs/ANALYTICS.md) --- événements et
    intégration Matomo ;
10. [`docs/TESTING.md`](docs/TESTING.md) --- critères d'acceptation et
    tests.

En cas de contradiction entre les documents, **`docs/PRD.md` prévaut**.

[`docs/CODEX.md`](docs/CODEX.md) contient des instructions spécifiques
pour une reprise du projet avec Codex.

## Modèle de données

Les noms de champs sont canoniques dans le CSV et le JSON :

``` text
biblionumber
document_type
title
subtitle
authors
isbn
ean
date
publisher
pages
abstract
cover_url
holdings
opac_suppressed
list_id
list
list_sort
```

`holdings` est un tableau JSON natif :

``` json
[
  {
    "library": "MEDP",
    "location": "BUR",
    "callnumber": "Z 692 JAC"
  },
  {
    "library": "LASH",
    "location": "SL1",
    "callnumber": "025.04 JAC"
  }
]
```

Dans l'export Excel, ces informations sont regroupées dans une colonne
**Exemplaires**, avec un exemplaire par ligne dans la même cellule :

``` text
MEDP — BUR — cote Z 692 JAC
LASH — SL1 — cote 025.04 JAC
```

## Primo

Les documents renvoient vers le catalogue Primo.

Le permalink est construit à partir de `biblionumber` :

``` text
https://catalogue.bu.univ-cotedazur.fr/permalink/f/11hf8mm/33UCA_KOHA{biblionumber}
```

## Couvertures

Les couvertures sont récupérées hors ligne par le traitement Python puis
servies localement.

Priorité :

``` text
cover_url du CSV
      │
      ├── succès → cache local
      │
      └── échec → fournisseurs configurés
```

Les fournisseurs prévus sont Google Books, BnF et Amazon.

Le cache positif mémorise la provenance de l'image. Lorsqu'une
couverture provient de `cover_url`, l'URL source est mémorisée afin de
détecter ses modifications ultérieures.

Le cache négatif est propre aux fournisseurs externes. Les échecs de
`cover_url` ne sont pas conservés dans un cache négatif permanent.

## Export Excel

Un fichier XLSX est généré à l'avance pour chaque liste Koha.

Il contient toujours la **liste complète**, indépendamment de la
recherche, de la pagination, de `limit` ou du mode d'affichage du
widget.

Colonnes :

``` text
Catalogue
Type de document
Titre
Auteur
ISBN
EAN
Date
Éditeur
Pages
Résumé
Exemplaires
Liste
```

## Technologies

Le projet privilégie des technologies simples et standards :

### Traitement

-   Python ;
-   `openpyxl` pour les fichiers XLSX.

### Front-end

-   Custom Elements ;
-   Shadow DOM ;
-   JavaScript natif ;
-   CSS Grid / Flexbox ;
-   `fetch` ;
-   `CustomEvent` ;
-   `Intl.Collator`.

Aucun framework JavaScript n'est requis.

## Analytics

Le Web Component reste indépendant de Matomo.

Il émet un événement générique :

``` text
koha-list-widget:interaction
```

L'adaptateur `koha-list-widget-matomo.js` le traduit ensuite en événements
Matomo.

Interactions disponibles :

``` text
document_click
pagination_change
carousel_navigate
autoplay_toggle
excel_download
```

Les déplacements automatiques du carrousel ne sont pas comptabilisés
comme des interactions utilisateur.

## Développement avec Codex

### Web Component et démonstration

Les quatre modes, la recherche, le tri, la pagination, le repli, l'export
et l'autoplay sont disponibles dans `widget/koha-list-widget.js`.
Charger ce fichier avec `type="module"`, puis utiliser `src` et `list_id`
comme dans l'exemple ci-dessus. Le navigateur utilise les ressources
générées par Python. Il ne requiert aucune dépendance JavaScript.

Pour lancer la démo et les tests (Node.js 22 ou ultérieur) :

``` console
npm install
npx playwright install chromium
npm run check
npm test
npm start
```

Ouvrir ensuite `http://127.0.0.1:4173`. Générer d'abord `data/data.json`
avec le script Python si nécessaire ; `--skip-covers` évite tout appel aux
fournisseurs. La démo présente les quatre modes et deux exemples d'autoplay.
La feuille `widget/koha-list-widget-custom.css` fournit une personnalisation
via les variables CSS et `::part()`.

Les cinq événements génériques et l'adaptateur Matomo facultatif sont disponibles.
Charger `widget/koha-list-widget-matomo.js` pour mettre les interactions dans
la file `_paq`. Le site hôte configure et charge son propre tracker Matomo.
Sans adaptateur, le widget fonctionne et émet ses événements sans suivi Matomo.
Voir [le contrat et l'intégration analytics](docs/ANALYTICS.md).

### Conversion CSV → JSON et Excel

Avec Python 3.10 ou ultérieur, depuis la racine du dépôt :

``` console
python -m pip install -r requirements.txt
python scripts/csv_to_json.py
python -m unittest discover -s tests -v
```

La conversion lit `data/data.csv` (UTF-8, BOM facultatif, séparateur `;`)
et produit `data/data.json` ainsi que `exports/liste-{list_id}.xlsx`.
Ces fichiers générés sont ignorés par Git. Les chemins par défaut sont
relatifs au dépôt, même si la commande est lancée depuis un autre dossier.

Pour choisir les chemins :

``` console
python scripts/csv_to_json.py --input data/data.csv --output data/data.json --exports-dir exports --delimiter ";"
```

Les en-têtes canoniques sont obligatoires ; les cellules bibliographiques
facultatives peuvent être vides. Un identifiant invalide, une ligne mal
formée ou des métadonnées contradictoires pour une même liste arrêtent la
conversion avant la génération des exports. Un `holdings` invalide est
signalé avec la ligne et la notice, puis remplacé par `[]`. Les propriétés
des objets `holdings` sont textuelles et peuvent être absentes.

Toutes les lignes sont conservées, sans filtrage sur `opac_suppressed` ni
déduplication. L'ordre du CSV est conservé dans les exports. Les liens vers
les XLSX sont relatifs au dossier du JSON.

Le JSON et chaque XLSX sont remplacés individuellement après une écriture
réussie. Si un export échoue, les autres listes et le JSON sont produits,
mais aucun `export_xlsx` n'est annoncé pour la liste concernée ; la commande
retourne un code d'échec. Une cellule dépassant la limite Excel de 32 767
caractères entraîne cette même politique, sans troncature silencieuse ; le
texte intégral reste dans le JSON. Les anciens exports ne sont pas purgés.

La conversion récupère désormais les couvertures : `cover_url` est
prioritaire, puis les fournisseurs Google Books, BnF et Amazon sont essayés
dans cet ordre. Les images validées sont converties en JPEG dans `covers/`.
Le JSON conserve `cover_url` et expose le chemin relatif `local_cover_url`.
Le cache mémorise la source, la date de récupération et, pour `cover_url`,
l'URL ayant produit l'image. Les notices présentes dans plusieurs listes
ne sont téléchargées qu'une fois par exécution.

``` console
python scripts/csv_to_json.py --cover-source bnf --cover-source google
python scripts/csv_to_json.py --skip-covers
python scripts/probe_covers.py --sample 3
```

`--cover-source` peut être répété pour choisir l'ordre des fournisseurs ;
une `cover_url` est toujours prioritaire. `--covers-dir` choisit le dossier
des images et du cache. `--cover-timeout` fixe le délai réseau en secondes
(10 par défaut), `--cover-delay` l'intervalle minimal entre requêtes
(0,3 seconde par défaut). `--skip-covers` désactive entièrement ce traitement,
avec des `local_cover_url` vides dans le JSON produit.

Une clé Google Books peut être fournie par la variable d'environnement
`GOOGLE_BOOKS_API_KEY` ; elle n'est ni affichée dans les journaux ni enregistrée
dans le cache. Les HTTP 401/403/429 suspendent le fournisseur pour le reste
de l'exécution. Les erreurs réseau et HTTP 5xx seront retentées au prochain
lancement ; seules les absences explicites alimentent le cache négatif des
fournisseurs. `--retry-missing-covers` permet de réinitialiser ce dernier.
Les échecs de `cover_url` ne sont jamais mémorisés dans le cache négatif.

Le script `probe_covers.py` teste chaque fournisseur séparément sur un petit
échantillon, sans modifier le JSON, les exports ou le cache de production.
Il écrit ses images et son rapport dans un nouveau sous-dossier de
`cover-probe/`. Il retourne 1 si au moins un fournisseur ne fournit aucune
image dans l'échantillon : consulter les journaux pour distinguer absence
de couverture, quota et erreur réseau. La conversion principale continue
à produire JSON/XLSX même lorsque toutes les couvertures échouent.

Voir [la documentation des couvertures](docs/COVERS.md) pour les endpoints
utilisés et les limites des fournisseurs.

Avant toute modification importante :

1.  lire [`docs/CODEX.md`](docs/CODEX.md) ;
2.  lire [`docs/PRD.md`](docs/PRD.md) ;
3.  inspecter l'état actuel du dépôt ;
4.  comparer le code existant aux spécifications ;
5.  implémenter les changements par étapes testables ;
6.  exécuter les tests et contrôles de syntaxe après chaque étape
    significative.

Les contrats publics suivants ne doivent pas être renommés sans
modification préalable des spécifications :

``` text
list_id
visibility
holdings
koha-list-widget:interaction
```

## Statut

Le traitement CSV → JSON/XLSX, les couvertures, le Web Component, les
événements, l'adaptateur Matomo et la démonstration sont implémentés.
Les instructions de livraison figurent dans [UTILISATION.md](docs/UTILISATION.md).
La validation BnF après sa panne, la réception sur le serveur Matomo du site
et les contrôles manuels de compatibilité/accessibilité restent à effectuer.
