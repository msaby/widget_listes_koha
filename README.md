# Koha List Widget

Widget Web réutilisable pour valoriser sur des sites Web des
**sélections bibliographiques constituées dans Koha**.

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

Interactions prévues :

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

Le projet est spécifié fonctionnellement. Le PRD et les documents du
dossier `docs/` définissent le comportement cible à utiliser pour
l'implémentation et les tests.
