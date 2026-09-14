# Web Component `<koha-list-widget>`

## 1. API publique

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

## 2. Chargement

Utiliser :

``` javascript
fetch(src, { cache: "no-store" })
```

Filtrer les documents par `list_id`.

Prévoir états loading, erreur et résultat vide. L'absence/invalidité de
`list_id` est différente d'une liste vide : dans le premier cas, aucun
rendu.

## 3. Affichages

### Carousel

Cartes avec couverture, scroll horizontal natif, boutons
précédent/suivant. `paginate` ignoré.

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

Positions analytiques globales. Le focus reste dans le contrôle utilisé.

## 8. Visibility

-   `visibility="collapsible"` : ouvert par défaut.
-   `visibility="collapsed"` : fermé par défaut.
-   absent/invalide : pas de toggle, contenu visible.

Titre/description restent visibles. Utiliser `hidden`, `aria-expanded`,
`aria-controls`.

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

Libellé : « Télécharger la liste complète au format Excel ».

## 11. Shadow Parts

``` text
widget carousel grid list compact list-name list-description
books book book-layout book-link compact-row cover cover-image
cover-placeholder content document-type title authors meta nav prev next
visibility-controls visibility-toggle collapsible-content
search-controls search-input search-status search-empty skip-widget
pagination pagination-top pagination-button pagination-previous
pagination-next pagination-number pagination-current pagination-summary
pagination-status autoplay-controls autoplay-toggle
```

## 12. Événements

Émettre `koha-list-widget:interaction` avec les événements définis dans
`ANALYTICS.md`. Ne jamais appeler `_paq` directement depuis ce fichier.

## 13. Utilisation de l'implémentation

Charger `widget/koha-list-widget.js` avec `type="module"`. Aucun build ni
framework n'est nécessaire. Le composant réagit aux changements de ses
attributs ; un changement de source annule le chargement précédent. Les
chemins `local_cover_url` et `export_xlsx` sont relatifs au JSON, et `src`
est relatif à la page hôte. Servir les fichiers en HTTP(S), avec CORS
autorisé par le serveur de données si les origines diffèrent.

La navigation clavier du carrousel utilise Gauche/Droite et Début/Fin.
L'autoplay avance d'une carte à la fois et revient au début après la fin ;
il est également suspendu lorsque l'onglet du navigateur est masqué.
Une interaction terminée laisse passer un délai complet avant reprise.
La pause explicite est conservée lors des changements de présentation.

Les numéros de pagination sont regroupés autour de la page courante, avec
accès à la première et à la dernière page. Lorsque le bouton utilisé devient
désactivé, le focus passe au numéro de la page courante dans la même barre.
La recherche attend 180 ms après la saisie avant de mettre à jour les résultats.

Le bouton de sortie crée une cible de focus dans le DOM principal juste
après le composant. Cette cible est supprimée à la déconnexion du widget.

`widget/koha-list-widget-custom.css` illustre l'utilisation des variables
`--koha-accent`, `--koha-focus`, `--koha-radius`, `--koha-gap` et des Shadow
Parts. Les parties `export` et `pagination-bottom` complètent celles du PRD.

Les quatre affichages et leurs contrôles sont implémentés à l'étape 4.
L'étape 5 ajoute les cinq événements génériques et l'adaptateur Matomo
facultatif. Voir `ANALYTICS.md` pour les détails et l'intégration.
