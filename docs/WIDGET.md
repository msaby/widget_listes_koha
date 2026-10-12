# Web Component `<koha-list-widget>`

## 1. API publique

  Attribut           Requis   Défaut        Valeurs / rôle
  ------------------ -------- ------------- ---------------------------------------
  `list_id`          oui      ---           identifiant de la liste
  `library-filter`   non      ---           codes de bibliothèque séparés par des virgules
  `split-by-library` non      false         pastilles de filtre par bibliothèque
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
  `more-results-url` non      ---           URL du lien « Voir plus de résultats »
  `analytics-id`     non      ---           identifiant d'instance

Si `list_id` manque ou n'est pas un entier positif valide, **ne rien
afficher**.

`library-filter="SCIEN,LASH"` garde les documents ayant au moins un exemplaire
dans l'une de ces bibliothèques (`holdings[].library`). Les espaces autour des
codes sont ignorés. Une valeur vide ou composée seulement de codes absents
du JSON ne filtre rien. Si un code existe et un autre non, le code existant
est appliqué. Modifier l'attribut met à jour l'affichage sans recharger le JSON.

`split-by-library` (attribut booléen, actif par sa présence) affiche, juste
au-dessus des documents, une ligne de petites pastilles arrondies : « Toutes »
puis chaque code `holdings[].library` présent dans la sélection, triés. Un clic
filtre les documents de cette bibliothèque ; la pastille « Toutes » rétablit
l'affichage complet. Le filtre se combine avec la recherche, `limit` et la
pagination (retour à la page 1). La barre n'apparaît que s'il y a au moins deux
bibliothèques. Le choix est réinitialisé si `list_id`, `library-filter` ou
`split-by-library` change. Il n'affecte pas l'export Excel.

`split-by-library` accepte aussi des codes séparés par des virgules, comme
`library-filter` : `split-by-library="SCIEN,LASH"` n'affiche que ces
bibliothèques (casse et espaces ignorés). Les codes absents des données sont
ignorés sans erreur ; sans aucun code valide, toutes les bibliothèques sont
proposées. Avec des codes valides, la barre s'affiche même pour une seule
bibliothèque. Les noms en clair
viennent de `widget/libraries.json` (à éditer à la main) : un objet par code,
`{"name": "Valrose", "city": "Nice", "structure": "DIBSO"}`. Seul `name` est
utilisé pour l'instant. Il détermine l'ordre des pastilles. Un code absent du fichier, ou un fichier
introuvable, affiche le code brut ; le code reste visible au survol (`title`)
quand un nom est affiché. Shadow Parts :
`library-filter` (conteneur) et `library-chip` (pastille).

## 2. Chargement

Utiliser :

``` javascript
fetch(new URL('../dist/prepareddata.json', import.meta.url), { cache: "no-store" })
```

Filtrer les documents par `list_id`.

Prévoir états loading, erreur et résultat vide. L'absence/invalidité de
`list_id` est différente d'une liste vide : dans le premier cas, aucun
rendu.

## 3. Affichages

### Carousel

Cartes avec couverture et défilement horizontal natif. Deux boutons affichent
les chevrons Unicode `❮` et `❯` sur les côtés du carrousel, avec ou sans
autoplay. Leurs noms accessibles restent « Documents précédents » et
« Documents suivants », et leurs cibles invisibles mesurent au moins 44 px de large.
Le chevron se renforce discrètement au survol ; le focus clavier reste visible.
Ils bouclent aux extrémités. `paginate` est ignoré.

### Grid

Cartes responsive avec couvertures. Pagination possible.

### List

Disposition couverture + contenu. Pagination possible.

### Compact

Une ligne visuelle exactement par document, aucune couverture, aucun
placeholder, aucune réservation d'espace image.

Ordre :

``` text
Type | Titre : sous-titre — Auteur(s) — Éditeur, date
```

Dans tous les modes, l'éditeur affiché est le premier avant `|`. Les mots
« édition », « éditions », « éditeur », « ed. », « librairie », « libr. »,
« publisher », « publishers » et « publishing » sont retirés de cet affichage sans tenir
compte de la casse ou des accents. La source et la recherche restent intactes.
Pour les auteurs, les crochets `[` et `]` sont retirés, puis seul le premier
nom avant `,`, `;`, `|`, « et », « and » ou « avec » est affiché. Si d'autres noms suivent, `...` est
ajouté. Les préfixes « par », « dir… par », « sous la dir… de »,
« sous la dir… d’ », « éd… par », « de », « texte de » et « textes de »
sont retirés devant ce nom. La recherche et le tri gardent le champ source.

CSS fondamental :

``` css
white-space: nowrap;
overflow: hidden;
text-overflow: ellipsis;
```

Ne jamais appliquer de troncature fixe par caractères en compact. Le
texte complet doit rester accessible.

## 4. Liens

Carte/ligne entière = lien `record_url`, nouvel onglet. Signaler
l'ouverture accessiblement.

Sur hover/focus :

``` css
.book-link:hover .title,
.book-link:focus-visible .title {
  text-decoration: underline;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}
```

Pas de texte visible « Voir dans le catalogue ↗ ». Pas de
`title="Plus d'infos"` sur la carte.

## 5. Troncature hors compact

Carousel/grid :

-   titre+sous-titre \> 140 : 140 + `...`;
-   auteurs/éditeur \> 60 : 61 premiers + `...`.

List :

-   titre+sous-titre \> 240 : 240 + `...`;
-   auteurs/éditeur : complet jusqu'à 200 ; au-delà 61 premiers + `...`.

Conserver les valeurs complètes pour recherche/accessibilité.

## 6. Recherche

Champs :

``` text
document_type title subtitle authors publisher date
```

Exclus :

``` text
biblionumber isbn ean abstract cover_url holdings
opac_suppressed list list_id list_sort
```

Insensible casse/accents. Tous les termes doivent correspondre.
Recherche sur les valeurs originales complètes.

Ordre logique : sélection liste → tri → recherche → `limit` →
pagination/rendu.

## 7. Pagination

Grid/list/compact uniquement. Contrôles haut + bas synchronisés :

-   Précédent ;
-   Suivant ;
-   numéros ;
-   `aria-current="page"` ;
-   Page X sur Y.

Précédent sur la première page va à la dernière ; Suivant sur la dernière
revient à la première. Les contrôles restent disponibles tant qu'il existe
plusieurs pages.

Positions analytiques globales. Le focus reste dans le contrôle utilisé.

## 8. Visibility

-   `visibility="collapsible"` : ouvert par défaut.
-   `visibility="collapsed"` : fermé par défaut.
-   absent/invalide : pas de toggle, contenu visible.

Titre/description restent visibles. Utiliser `hidden`, `aria-expanded`,
`aria-controls`.
Le bouton sans bordure affiche en gras « Replier la sélection » avec un
triangle vers le bas lorsque la sélection est ouverte, et « Afficher la
sélection » avec un triangle vers la droite lorsqu'elle est repliée, comme
l'indicateur d'un élément HTML `summary`. Le focus clavier reste visible.

## 9. Autoplay

Carousel uniquement. Désactivé par défaut.

-   présence de `autoplay` = actif ;
-   délai absent = 5000 ms ;
-   `autoplay-delay` = délai personnalisé ;
-   boucle fin → début ;
-   pause temporaire hover/focus/bouton/scroll/touch ;
-   reprise après un délai complet ;
-   Pause explicite persistante ;
-   bouton « Mettre en pause le défilement » / « Reprendre le défilement
    » ;
-   `prefers-reduced-motion: reduce` désactive autoplay ;
-   widget replié suspend autoplay ;
-   mouvements automatiques sans annonces live répétées.

## 10. Export

Si `export="xlsx"` et que la liste possède `export_xlsx`, afficher le
bouton. Sinon aucun lien aveugle vers une ressource inexistante.

Sans filtre actif, le lien télécharge l'Excel complet préparé par Python et
porte le libellé « Télécharger la liste complète au format Excel ». Avec
`library-filter`, il télécharge un XLSX généré dans le navigateur à partir des
documents filtrés et porte le libellé « Télécharger la sélection filtrée au
format Excel ». La recherche, la pagination et `limit` ne réduisent pas le
contenu du classeur.
Le lien se place au-dessus des résultats, aligné sur le bord droit du widget
et sur le bas de la pagination supérieure si elle est présente. Il est
présenté sans bordure, avec un texte plus petit et un symbole de téléchargement.
Les boutons de pause et de reprise
du carrousel affichent respectivement `Ⅱ` et `▶` devant leur libellé.

## 10 bis. Voir plus de résultats

Si `more-results-url` contient une URL HTTP(S) valide, afficher sous les
résultats un lien « Voir plus de résultats » vers cette URL. Les URL relatives
sont résolues par rapport à la page hôte. Le lien reste visible lorsque la
sélection est repliée et ne modifie ni la pagination ni la recherche locale.
Si l'attribut est absent, vide ou invalide, ne pas afficher le lien.

``` html
<koha-list-widget list_id="11"
  more-results-url="https://exameple.com"></koha-list-widget>
```

## 11. Shadow Parts

``` text
widget carousel grid list compact list-name list-description
books book book-layout book-link compact-row cover cover-image
cover-placeholder content document-type title authors meta nav prev next
visibility-controls visibility-toggle collapsible-content
search-controls search-input search-status search-empty skip-widget
pagination pagination-top pagination-button pagination-previous
pagination-next pagination-number pagination-current pagination-summary
pagination-status autoplay-controls autoplay-toggle more-results
results-controls
```

## 12. Événements

Émettre `koha-list-widget:interaction` avec les événements définis dans
`ANALYTICS.md`. Ne jamais appeler `_paq` directement depuis ce fichier.

## 13. Utilisation de l'implémentation

Charger `widget/koha-list-widget.js` avec `type="module"`. Aucun build ni
framework n'est nécessaire. Le composant réagit aux changements de ses
attributs ; un changement de `list_id` relance le chargement. Les
chemins `local_cover_url` et `export_xlsx` sont relatifs au JSON, qui se
trouve dans `../dist/` par rapport au module. Servir les fichiers en HTTP(S), avec CORS
autorisé par le serveur de données si les origines diffèrent.

La navigation clavier du carrousel utilise Gauche/Droite et Début/Fin.
L'autoplay avance d'une carte à la fois et revient au début après la fin ;
les boutons Précédent et Suivant bouclent aussi aux extrémités du carrousel ;
il est également suspendu lorsque l'onglet du navigateur est masqué.
Une interaction terminée laisse passer un délai complet avant reprise.
La pause explicite est conservée lors des changements de présentation.

Les numéros de pagination sont regroupés autour de la page courante, avec
accès à la première et à la dernière page. Le focus reste sur le bouton
Précédent ou Suivant utilisé après le changement de page.
La recherche attend 180 ms après la saisie avant de mettre à jour les résultats.

Le bouton de sortie crée une cible de focus dans le DOM principal juste
après le composant. Cette cible est supprimée à la déconnexion du widget.

`widget/koha-list-widget-custom.css` illustre l'utilisation des variables
`--koha-accent`, `--koha-focus`, `--koha-radius`, `--koha-gap` et des Shadow
Parts. Les parties `export` et `pagination-bottom` complètent celles du PRD.

Les quatre affichages et leurs contrôles sont implémentés à l'étape 4.
L'étape 5 ajoute les cinq événements génériques et l'adaptateur Matomo
facultatif. Voir `ANALYTICS.md` pour les détails et l'intégration.
