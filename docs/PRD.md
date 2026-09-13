# PRD --- Widget de valorisation de listes Koha

**Version :** 1.7\
**Date :** 13 septembre 2026\
**Code du projet** : koha-list-widget
**Statut :** spécification fonctionnelle consolidée

## 1. Objet

Développer un Web Component réutilisable `<koha-list-widget>` pour afficher
sur différents sites des sélections bibliographiques provenant de listes
Koha. Koha est la source bibliographique et l'outil éditorial ; les
liens publics pointent vers Primo.

Le composant doit rester sans framework JavaScript et proposer quatre
affichages (`carousel`, `grid`, `list`, `compact`), tri, recherche
locale, pagination, repli, autoplay facultatif du carrousel, export
Excel complet, accessibilité, personnalisation CSS et suivi Matomo.

## 2. Architecture

``` text
Koha → CSV quotidien → csv_to_json.py
                         ├─ JSON → <koha-list-widget>
                         ├─ couvertures locales
                         └─ XLSX par liste

<koha-list-widget> → Primo
            → événements génériques → koha-list-widget-matomo.js → Matomo
```

Le navigateur ne doit ni interroger Koha ou les fournisseurs de
couvertures en temps réel, ni générer les XLSX.

Structure cible :

``` text
koha-list-widget/
├── data/
├── scripts/csv_to_json.py
├── widget/
│   ├── koha-list-widget.js
│   ├── koha-list-widget-custom.css
│   └── koha-list-widget-matomo.js
├── covers/.cover-cache.json
├── exports/
├── demo/index.html
├── docs/
│   ├── PRD.md
│   ├── ACCESSIBILITY.md
│   ├── ANALYTICS.md
│   ├── CODEX.md
│   ├── COVERS.md
│   ├── DATA_MODEL.md
│   ├── EXPORT.md
│   ├── IMPLEMENTATION.md
│   ├── SORTING.md
│   ├── TESTING.md
│   └── WIDGET.md
└── README.md
```

`docs/PRD.md` est la spécification fonctionnelle de référence. Les
documents spécialisés peuvent détailler l'implémentation sans la
contredire.

## 3. Modèle de données CSV et JSON

### 3.1 Terminologie canonique

Les colonnes CSV sont :

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

Ces noms sont conservés dans le JSON et, autant que possible, dans le
code Python et JavaScript. Ne pas introduire inutilement `itemtype`,
`author`, `year`, `list_no` ou `list_name`.

  Champ               Signification
  ------------------- --------------------------------------------
  `biblionumber`      identifiant de notice Koha
  `document_type`     type de document
  `title`             titre
  `subtitle`          sous-titre
  `authors`           auteur(s) / responsabilité(s)
  `isbn`              ISBN
  `ean`               EAN
  `date`              date de publication
  `publisher`         éditeur
  `pages`             pagination / importance matérielle
  `abstract`          résumé
  `cover_url`         URL source éventuelle de couverture
  `holdings`          tableau JSON de localisations/cotes
  `opac_suppressed`   information de suppression/visibilité Koha
  `list_id`           numéro de liste Koha
  `list`              nom lisible de la liste
  `list_sort`         tri défini pour la liste

### 3.2 `abstract`

Le résumé est conservé intégralement dans le JSON et exporté dans Excel.
Il n'est actuellement ni affiché dans le widget ni inclus dans la
recherche locale.

### 3.3 `cover_url`

Si `cover_url` est renseigné, cette URL est la source prioritaire pour
récupérer la couverture. Python télécharge l'image et la met en cache
localement ; le navigateur ne charge pas directement l'URL distante.

Si `cover_url` est absente, les fournisseurs configurés sont utilisés.

Si `cover_url` est présente mais que son téléchargement échoue, le
traitement poursuit automatiquement avec les fournisseurs de couverture
configurés (Google Books, BnF, Amazon selon la configuration). Un échec
de `cover_url` ne doit pas bloquer la génération du JSON ou de l'Excel.

Les échecs de `cover_url` ne sont pas enregistrés dans un cache négatif
permanent : l'URL est donc susceptible d'être retentée lors d'un
traitement quotidien ultérieur.

### 3.4 `holdings`

Dans le CSV, `holdings` contient la représentation JSON d'un tableau
d'objets. Python doit la désérialiser afin que, dans le JSON final,
`holdings` soit un **vrai tableau JSON**, et non une chaîne.

``` json
[
  {"library":"MEDP","location":"BUR","callnumber":"Z 692 JAC"},
  {"library":"LASH","location":"SL1","callnumber":"025.04 JAC"}
]
```

Chaque objet comporte :

-   `library` : code de bibliothèque ;
-   `location` : code de localisation interne ;
-   `callnumber` : cote.

Le tableau peut être vide. Dans cette version, `holdings` est conservé
dans le JSON, n'est ni affiché ni recherché dans le widget, mais il est
utilisé pour produire la colonne **Exemplaires** de l'export Excel.

### 3.5 Exemple de document JSON

``` json
{
  "biblionumber": "272037",
  "document_type": "Livre",
  "title": "Titre",
  "subtitle": "Sous-titre",
  "authors": "Nom, Prénom",
  "isbn": "9781234567890",
  "ean": "",
  "date": "2026",
  "publisher": "Éditeur",
  "pages": "245 p.",
  "abstract": "Résumé éventuel.",
  "cover_url": "",
  "holdings": [
    {"library":"MEDP","location":"BUR","callnumber":"Z 692 JAC"},
    {"library":"LASH","location":"SL1","callnumber":"025.04 JAC"}
  ],
  "opac_suppressed": "0",
  "list_id": "11",
  "list": "Fonds professionnels",
  "list_sort": "date",
  "record_url": "https://catalogue.bu.univ-cotedazur.fr/permalink/f/11hf8mm/33UCA_KOHA272037",
  "local_cover_url": "../covers/272037.jpg"
}
```

### 3.6 Structure globale JSON

``` json
{
  "lists": {
    "11": {
      "list_id": "11",
      "list": "Fonds professionnels",
      "list_sort": "date",
      "export_xlsx": "../exports/liste-11.xlsx"
    }
  },
  "documents": []
}
```

Les données calculées sont notamment `record_url`, `local_cover_url` et
`export_xlsx`. `cover_url` reste l'URL source ; `local_cover_url`
désigne l'image locale.

## 4. Traitement Python

`scripts/csv_to_json.py` prépare quotidiennement le JSON, les
couvertures et un XLSX par liste. Un échec de couverture ne doit bloquer
ni le JSON ni l'Excel.

Pour `holdings`, Python doit désérialiser la cellule CSV et produire un
tableau JSON natif.

## 5. Liens Primo

Le permalink est :

``` text
https://catalogue.bu.univ-cotedazur.fr/permalink/f/11hf8mm/33UCA_KOHA{biblionumber}
```

La carte ou ligne entière est cliquable, ouvre Primo dans un nouvel
onglet (`target="_blank"`, `rel="noopener noreferrer"`) et signale ce
comportement de manière accessible.

## 6. Couvertures

### 6.1 Priorité des sources

La priorité de récupération est :

``` text
cover_url présente
      │
      ├─ succès → couverture locale
      │
      └─ échec → fournisseurs configurés
                       │
                       ├─ Google Books
                       ├─ BnF
                       └─ Amazon
```

En l'absence de `cover_url`, le traitement utilise directement les
fournisseurs configurés.

Exemple d'options :

``` bash
--cover-source google
--cover-source bnf
--cover-source amazon
```

Une erreur de récupération, quelle que soit la source, ne doit pas
bloquer la génération du JSON ou de l'Excel.

### 6.2 Cache positif

Une couverture récupérée est stockée localement :

``` text
covers/{biblionumber}.jpg
```

Le JSON expose ensuite cette image via `local_cover_url`.

Le cache doit également mémoriser la provenance de la couverture
positive afin de pouvoir détecter une modification de `cover_url`.

Exemple de structure de `.cover-cache.json` :

``` json
{
  "covers": {
    "272037": {
      "source": "cover_url",
      "source_url": "https://example.org/covers/272037.jpg"
    },
    "272038": {
      "source": "google"
    }
  },
  "negative": {
    "google:272039": true,
    "bnf:272039": true,
    "amazon:272039": true
  }
}
```

Pour une couverture issue de `cover_url`, `source_url` mémorise l'URL
ayant produit l'image locale.

### 6.3 Modification de `cover_url`

À chaque traitement quotidien, lorsqu'une `cover_url` est présente,
Python compare sa valeur avec la `source_url` enregistrée pour la
couverture locale.

Règles :

1.  si la `cover_url` actuelle est identique à la `source_url` ayant
    produit la couverture locale, la couverture en cache est conservée ;
2.  si la `cover_url` a changé, Python tente de télécharger la nouvelle
    image même si `covers/{biblionumber}.jpg` existe déjà ;
3.  si le téléchargement de la nouvelle `cover_url` réussit, l'image
    locale et les métadonnées du cache sont mises à jour ;
4.  si le téléchargement échoue, le traitement peut poursuivre vers les
    fournisseurs configurés ;
5.  si une notice possédait auparavant une `cover_url` et que celle-ci
    disparaît du CSV, la couverture locale déjà récupérée est conservée
    : l'absence ultérieure de l'URL source ne suffit pas à invalider une
    image locale existante.

### 6.4 Cache négatif

Le cache négatif reste **spécifique aux fournisseurs externes**.

Exemples :

``` text
google:272037
bnf:272037
amazon:272037
```

Ces informations sont enregistrées dans :

``` text
covers/.cover-cache.json
```

Un échec de `cover_url` n'est pas enregistré sous une clé du type
`cover_url:{biblionumber}` ou `csv:{biblionumber}`.

La raison est que `cover_url` est une donnée du CSV susceptible de
changer d'un traitement à l'autre. Une URL temporairement inaccessible
doit donc pouvoir être retentée lors d'un traitement quotidien
ultérieur.

### 6.5 Affichage

  Mode            Couverture
  --------------- ----------------
  `carousel`      hauteur 180 px
  `grid`          hauteur 180 px
  `list`          120×170 px
  `list` mobile   90×130 px
  `compact`       aucune

Les images utilisent `object-fit: contain`, `loading="lazy"` et
`decoding="async"` lorsque pertinent. Elles sont décoratives (`alt=""`).
Un placeholder est utilisé dans les modes avec couverture lorsqu'aucune
image n'est disponible.

## 7. Export Excel

Un XLSX est pré-généré pour chaque liste (`exports/liste-11.xlsx`,
etc.). Il contient **l'intégralité de la liste Koha**, indépendamment de
`display`, `limit`, `paginate`, recherche, page courante, état replié,
autoplay ou tri d'affichage.

Colonnes :

  Colonne            Source
  ------------------ -----------------------------
  Catalogue          `biblionumber` → lien Primo
  Type de document   `document_type`
  Titre              `title` + `subtitle`
  Auteur             `authors`
  ISBN               `isbn`
  EAN                `ean`
  Date               `date`
  Éditeur            `publisher`
  Pages              `pages`
  Résumé             `abstract`
  Liste              `list`

Ne sont pas exportés : `cover_url`, `opac_suppressed`, `list_id`,
`list_sort`.

Le lien Catalogue affiche « Voir dans le catalogue ». Le titre est
`title : subtitle` si un sous-titre existe. Aucune troncature n'est
appliquée. `abstract` est intégral et utilise le retour automatique à la
ligne. ISBN/EAN sont écrits comme texte.

### 7.1 Colonne `Exemplaires`

La colonne Excel **Exemplaires** est destinée aux lecteurs. Elle est
construite à partir du tableau `holdings`.

Tous les exemplaires d'un document sont regroupés dans **une seule
cellule Excel**, avec un saut de ligne entre chaque exemplaire.

Pour chaque objet de `holdings`, le format cible est :

``` text
{library} — {location} — cote {callnumber}
```

Exemple pour :

``` json
[
  {"library":"MEDP","location":"BUR","callnumber":"Z 692 JAC"},
  {"library":"LASH","location":"SL1","callnumber":"025.04 JAC"}
]
```

la cellule Excel contient :

``` text
MEDP — BUR — cote Z 692 JAC
LASH — SL1 — cote 025.04 JAC
```

Les informations absentes sont omises proprement, sans produire de
séparateurs inutiles. Par exemple, si `location` est absente :

``` text
MEDP — cote Z 692 JAC
```

Si `holdings` est vide, la cellule reste vide.

La cellule utilise le retour automatique à la ligne et un alignement
vertical en haut. Sa largeur doit rester raisonnable afin de conserver
la lisibilité du classeur.

Les valeurs `library` et `location` sont exportées telles qu'elles
figurent actuellement dans `holdings`. La conversion ultérieure de ces
codes en libellés publics de bibliothèques et de salles est hors
périmètre de cette version et pourra être ajoutée lorsque les
référentiels nécessaires seront disponibles.

Mise en forme : en-têtes mis en évidence, ligne d'en-tête figée, filtre
automatique, largeurs raisonnables, retour à la ligne pour les champs
longs, vrais hyperliens, aucune image.

Le bouton n'apparaît qu'avec `export="xlsx"` et utilise `export_xlsx`
fourni dans les métadonnées JSON. Libellé recommandé : « Télécharger la
liste complète au format Excel ».

## 8. API du Web Component

``` html
<koha-list-widget></koha-list-widget>
```

Shadow DOM : `open`.

 Attribut           Requis   Défaut        Valeurs / rôle
  ------------------ -------- ------------- ---------------------------------------
  `src`              oui      ---           URL du fichier JSON source
  `list_id`          oui      ---           identifiant de la liste
  `list`             non      ---           nom de la liste
  `display`          non      `carousel`    `carousel`, `grid`, `list`, `compact`
  `limit`            non      `12`          maximum présenté
  `paginate`         non      ---           taille de page hors carousel
  `sort`             non      `list_sort`   `title`, `authors`, `date`
  `searchable`       non      false         recherche locale
  `show-list-name`   non      false         affiche `list`
  `description`      non      ---           description libre
  `visibility`       non      ---           `collapsible`, `collapsed`
  `autoplay`         non      false         carousel uniquement
  `autoplay-delay`   non      `5000`        ms, si autoplay
  `export`           non      ---           `xlsx`
  `analytics-id`     non      ---           identifiant d'instance

Si `list_id` manque ou n'est pas un entier positif valide, **ne rien
afficher**.

Le mode par défaut est `carousel`.

## 9. Modes d'affichage

### 9.1 `carousel`

Cartes avec couvertures et navigation horizontale. Navigation par
boutons, souris/pavé tactile, tactile et clavier. `paginate` est ignoré.

### 9.2 `grid`

Cartes avec couvertures dans une grille responsive. Pagination
disponible. Autoplay ignoré.

### 9.3 `list`

Présentation `couverture | informations bibliographiques`. Pagination
disponible. Autoplay ignoré.

### 9.4 `compact`

Liste très dense, **une seule ligne par document**, sans couverture ni
placeholder.

Ordre cible :

``` text
Type | Titre : sous-titre — Auteur(s) — Éditeur, date
```

Toute la ligne est un lien Primo. La troncature est purement visuelle et
dépend de la largeur :

``` css
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
```

Les valeurs complètes restent dans le DOM accessible et dans les
données. Le titre reçoit l'espace principal ; les métadonnées sont
secondaires. Le principe d'une seule ligne est maintenu sur mobile.

`compact` a les mêmes fonctions que `list` : `limit`, `paginate`,
`sort`, `searchable`, `show-list-name`, `description`, `visibility`,
`export`, `analytics-id`, liens Primo et Matomo.

## 10. Contenu et troncature

Informations principales : `document_type`, `title + subtitle`,
`authors`, `publisher + date`.

-   `carousel`/`grid` : titre+sous-titre tronqué au-delà de 140
    caractères ; auteurs/éditeur au-delà de 60 caractères avec les 61
    premiers + `...`.
-   `list` : titre+sous-titre tronqué au-delà de 240 caractères ;
    auteurs/éditeur complets jusqu'à 200 caractères, puis 61 premiers +
    `...`.
-   `compact` : aucune limite fixe ; ellipsis CSS selon l'espace.

Les valeurs complètes sont utilisées pour recherche et Excel. `authors`
et les métadonnées utilisent `1rem`.

Le titre est souligné au survol/focus de la carte ou ligne. Aucun indice
visible « Voir dans le catalogue ↗ » ni `title="Plus d'infos"` sur la
carte.

## 11. Recherche

Activation : `searchable`.

Recherche locale, insensible à la casse et aux accents, avec logique ET
entre les termes. Champs recherchés :

``` text
document_type
title
subtitle
authors
publisher
date
```

Non recherchés :

``` text
biblionumber
isbn
ean
abstract
cover_url
holdings
opac_suppressed
list_id
list_sort
```

La recherche utilise les valeurs complètes, s'applique à la liste
sélectionnée après tri et avant `limit`. En carrousel, elle réinitialise
le scroll.

## 12. Tri

Critères : `title`, `authors`, `date`. `sort` surcharge `list_sort`.

-   `title` : alphabétique, en ignorant les articles initiaux `Le`,
    `La`, `Les`, `L'`, `Un`, `Une`, `Des`, `The`, `A`, `An`.
-   `authors` : alphabétique, valeurs absentes à la fin.
-   `date` : plus récent au plus ancien, valeurs absentes/non
    exploitables à la fin.

## 13. `limit` et pagination

`limit` fixe le maximum présenté sans modifier l'Excel.

`paginate` s'applique à `grid`, `list`, `compact` et est ignoré pour
`carousel`.

Pagination haute et basse synchronisée : Précédent, Suivant, numéros,
`aria-current="page"`, résumé « Page X sur Y », extrémités désactivées.
Recherche et pagination fonctionnent ensemble. Les positions des
documents restent globales, non locales à la page. Le focus reste dans
la pagination utilisée.

## 14. Repli

-   `visibility="collapsible"` : visible initialement et repliable.
-   `visibility="collapsed"` : masqué initialement et dépliable.
-   valeur absente/invalide : visible sans contrôle.

Nom et description restent visibles. Utiliser `hidden`, `aria-expanded`,
`aria-controls`. Un carrousel replié suspend l'autoplay.

## 15. Autoplay

Uniquement pour `display="carousel"`. Désactivé par défaut.

``` html
autoplay
autoplay-delay="8000"
```

Si `autoplay-delay` est absent : **5000 ms**.

Boucle : `1 → 2 → 3 → 4 → 1...`.

Pause temporaire sur survol, focus, navigation manuelle, scroll manuel
ou interaction tactile. Après l'interaction, attendre un délai complet
avant reprise.

Quand autoplay est actif, afficher un vrai bouton « Mettre en pause le
défilement » / « Reprendre le défilement ». Une pause explicite reste
active jusqu'à reprise explicite.

Avec `prefers-reduced-motion: reduce`, désactiver l'autoplay et
réduire/supprimer les animations. Les mouvements automatiques ne doivent
pas provoquer d'annonces live répétées.

## 16. Accessibilité

Le composant doit être utilisable souris, clavier, tactile, lecteur
d'écran et avec réduction des mouvements.

Utiliser selon le contexte : `role="region"`, `role="list"`,
`role="listitem"`, `aria-posinset`, `aria-setsize`, `aria-live`,
`aria-atomic`, `aria-expanded`, `aria-controls`, `aria-current`,
`aria-label`, `aria-describedby`.

Les actions utilisent de vrais boutons/liens. Le focus visible est
obligatoire.

En `compact`, la troncature ne supprime jamais le texte du DOM
accessible.

Une région live peut annoncer : « Documents masqués », « Documents
affichés », « Défilement automatique suspendu », « Défilement
automatique repris ».

Un bouton « Passer cette sélection de documents » déplace le focus vers
un élément focusable du DOM principal immédiatement après
`<koha-list-widget>`.

## 17. Shadow Parts

``` text
widget
carousel
grid
list
compact
list-name
list-description
books
book
book-layout
book-link
compact-row
cover
cover-image
cover-placeholder
content
document-type
title
authors
meta
nav
prev
next
visibility-controls
visibility-toggle
collapsible-content
search-controls
search-input
search-status
search-empty
skip-widget
pagination
pagination-top
pagination-button
pagination-previous
pagination-next
pagination-number
pagination-current
pagination-summary
pagination-status
autoplay-controls
autoplay-toggle
```

Les Shadow Parts sont une API CSS et ne doivent pas nécessairement
reprendre le nom exact des champs.

Les contrôles recherche, repli, export et autoplay sont alignés à gauche
et peuvent revenir à la ligne sur mobile.

## 18. Exemples

Compact :

``` html
<koha-list-widget
  src="/data/data.json"
  list_id="11"
  display="compact"
  paginate="40"
  searchable
  sort="date"
  show-list-name
  export="xlsx"
  analytics-id="list11-compact">
</koha-list-widget>
```

Carrousel complet :

``` html
<koha-list-widget
  src="/data/data.json"
  list_id="11"
  display="carousel"
  limit="200"
  sort="date"
  searchable
  autoplay
  autoplay-delay="7000"
  visibility="collapsible"
  show-list-name
  description="Une sélection de documents professionnels proposée par la bibliothèque."
  export="xlsx"
  analytics-id="list11-accueil">
</koha-list-widget>
```

## 19. Tests

Tester au minimum :

-   `list_id` absent/invalide/inexistant et liste vide ;
-   champs bibliographiques absents et textes très longs ;
-   caractères accentués/apostrophes ;
-   ISBN/EAN ;
-   1 document et plusieurs centaines ;
-   les quatre modes ;
-   recherche, tri, `limit`, pagination et repli ;
-   clavier, focus, mobile et reduced motion ;
-   liens Primo ;
-   export XLSX complet et XLSX absent ;
-   colonne Résumé, résumé absent/long/intégral et wrap ;
-   `holdings` vide, un objet, plusieurs objets, propriétés manquantes,
    cote spéciale, désérialisation CSV→JSON, maintien comme tableau,
    absence d'affichage/recherche/export ;
-   `compact` : aucune couverture/placeholder, une ligne, ellipsis,
    contenu accessible, clic ligne entière ;
-   autoplay absent, défaut 5000 ms, délai personnalisé,
    hover/focus/touch/manuel, pause/reprise, boucle, repli, reduced
    motion ;
-   événements Matomo et positions globales.

## 20. Performance et compatibilité

Ressources statiques ; recherche, tri et pagination locaux ; aucune
génération XLSX ni interrogation des fournisseurs dans le navigateur.

Standards : Custom Elements, Shadow DOM, `fetch`, `CustomEvent`,
`Intl.Collator`, CSS Grid, Flexbox.

## 21. Matomo

Le composant émet un événement générique :

``` text
koha-list-widget:interaction
```

`widget/koha-list-widget-matomo.js` écoute cet événement et le transmet à
Matomo. Le Web Component ne dépend donc pas directement de Matomo.

Contexte commun :

``` javascript
{
  widget: "koha-list-widget",
  widget_id: "data-accueil",
  list_id: 11,
  display: "carousel",
  site: window.location.hostname,
  page_path: window.location.pathname,
  page_title: document.title
}
```

Utiliser `list_id` comme identifiant canonique de liste.

Événements :

### `document_click`

Champs : `biblionumber`, `position`, `page`, `list_id`, `display`,
`widget_id`, `site`, `page_path`, `page_title`.

### `pagination_change`

Champs : `from_page`, `page`, `page_size`, `navigation_type`
(`previous`, `next`, `page_number`), `pagination_position` (`top`,
`bottom`).

### `carousel_navigate`

Navigation manuelle uniquement, après stabilisation (\~250 ms), avec
`navigation_type` (`button` ou `scroll`), `direction`,
`first_visible_position`. Ne pas envoyer un événement pour chaque
`scroll`.

### `autoplay_toggle`

Action utilisateur explicite avec `state = paused` ou `state = playing`.

Les mouvements automatiques peuvent être identifiés en interne comme
`autoplay`, mais **ne sont pas comptés comme interactions utilisateur**.

### `excel_download`

Champs : `list_id`, `display`, `widget_id`, `site`, `page_path`,
`page_title`.

Catégorie Matomo : `KohaListWidget`. Actions : `document_click`,
`pagination_change`, `carousel_navigate`, `autoplay_toggle`,
`excel_download`.

Exemple :

``` javascript
window._paq.push(["trackEvent", "KohaListWidget", action, name]);
```

Le nom peut encoder :

``` text
list_id=11 | display=compact | widget=data-compact | biblionumber=272037 | position=17
```

Aucune donnée personnelle (nom, login, numéro de lecteur, email,
identifiant d'usager) n'est collectée.

Indicateurs visés :

-   visites ayant interagi avec un widget ;
-   clics vers Primo ;
-   pagination et navigation manuelle ;
-   pause/reprise autoplay ;
-   téléchargements Excel ;
-   listes/pages/positions les plus utilisées ;
-   comparaison des modes `carousel`, `grid`, `list`, `compact`.

Taux d'interaction :

``` text
visites avec ≥ 1 événement utilisateur KohaListWidget
------------------------------------------------- × 100
visites des pages contenant le widget
```

Taux de clic Primo :

``` text
visites avec document_click
---------------------------- × 100
visites des pages contenant le widget
```

Taux de téléchargement :

``` text
visites avec excel_download
---------------------------- × 100
visites des pages contenant le widget
```

L'objectif est de mesurer les actions volontaires sur les sélections
bibliographiques sans les confondre avec les comportements automatiques
de l'interface.
