# Accessibilité

## 1. Principe

L'accessibilité est une exigence fonctionnelle, pas une finition. Tester
souris, clavier, tactile, lecteur d'écran et réduction des mouvements.

## 2. Structure

Utiliser selon le rendu :

-   `role="region"` avec nom accessible ;
-   `role="list"` / `role="listitem"` ;
-   titres structurés (`h3` pour titres de documents lorsque pertinent)
    ;
-   vrais `<button>` et `<a>`;
-   focus visible.

La description du widget doit être associée avec `aria-describedby`
lorsque pertinent.

## 3. Liens Primo

Toute carte/ligne cliquable est un vrai lien. L'ouverture dans un nouvel
onglet est indiquée aux technologies d'assistance. Ne pas dépendre
uniquement d'un événement `click` sur un `<div>`.

## 4. Couvertures

Décoratives :

``` html
alt=""
```

Ne pas répéter le titre dans `alt`.

## 5. Compact

L'ellipsis est uniquement visuel. Le texte complet reste dans le
DOM/accessibility tree.

Conceptuellement, un lecteur d'écran doit pouvoir obtenir :

``` text
Livre. Intelligence artificielle et bibliothèques universitaires.
Jean Dupont. Presses universitaires, 2026.
```

même si l'écran affiche une version tronquée.

## 6. Recherche

Champ avec label accessible même si le label est visuellement masqué.
Résultat de recherche annoncé raisonnablement dans une région
`aria-live="polite"`.

Ne pas annoncer chaque frappe de façon excessive.

## 7. Pagination

-   boutons réels ;
-   `aria-current="page"` ;
-   boutons extrêmes désactivés ;
-   libellés compréhensibles ;
-   focus conservé dans la pagination utilisée ;
-   résumé « Page X sur Y ».

## 8. Visibility

Toggle avec :

``` text
aria-expanded
aria-controls
```

Contenu masqué avec `hidden`. Nom/description restent visibles.

## 9. Carousel

-   boutons précédent/suivant accessibles ;
-   région identifiable comme carrousel (`aria-roledescription` lorsque
    pertinent) ;
-   pas d'annonces live à chaque déplacement automatique ;
-   navigation clavier possible.

## 10. Autoplay

Fournir Pause/Reprendre. Une pause explicite reste persistante.

`prefers-reduced-motion: reduce` désactive l'autoplay.

Les interactions hover/focus/touch/manuelles suspendent temporairement
l'autoplay.

## 11. Skip widget

Fournir :

``` text
Passer cette sélection de documents
```

Le bouton doit envoyer le focus vers un élément focusable du **light
DOM**, immédiatement après le composant. Ne pas créer de boucle de focus
dans le Shadow DOM.

## 12. Région live

Peut annoncer des changements significatifs :

``` text
Documents masqués.
Documents affichés.
Défilement automatique suspendu.
Défilement automatique repris.
```

Ne pas surcharger les annonces.

## 13. Reduced motion

Respecter :

``` css
@media (prefers-reduced-motion: reduce) { ... }
```

Désactiver autoplay et réduire/supprimer les animations non
indispensables.

## 14. Tests clavier

Vérifier :

-   ordre de tabulation ;
-   focus visible ;
-   activation Entrée/Espace selon élément ;
-   navigation carousel ;
-   pagination ;
-   recherche ;
-   visibility ;
-   export ;
-   pause/reprise ;
-   skip-widget ;
-   aucune zone inaccessible ou piège de focus.
