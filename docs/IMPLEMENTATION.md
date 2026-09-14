# Plan d'implémentation

## 1. Objectif

Transformer un CSV Koha quotidien en ressources statiques consommables
par `<koha-list-widget>` :

``` text
CSV → Python
       ├─ JSON
       ├─ couvertures locales
       └─ XLSX par liste
             ↓
       serveur statique
             ↓
       Web Component
```

## 2. Découpage recommandé

### Étape 1 --- pipeline de données

Implémenter `scripts/csv_to_json.py` avec :

-   lecture robuste du CSV ;
-   conservation des noms canoniques ;
-   désérialisation de `holdings` ;
-   regroupement des métadonnées de listes ;
-   génération de `record_url` ;
-   orchestration des couvertures ;
-   génération des XLSX ;
-   écriture atomique du JSON si possible ;
-   logs synthétiques : lignes lues, documents produits, listes,
    couvertures récupérées/réutilisées/échouées, XLSX produits.

Une couverture en erreur ne doit jamais empêcher JSON/XLSX.

### Étape 2 --- Web Component minimal

Implémenter :

-   `<koha-list-widget>`;
-   `src` et `list_id` obligatoires ;
-   chargement JSON `cache: "no-store"` ;
-   filtrage par `list_id` ;
-   états loading/error/empty ;
-   `carousel`, `grid`, `list`, `compact`;
-   liens Primo sur carte/ligne entière.

### Étape 3 --- comportements

Ajouter dans cet ordre :

1.  tri ;
2.  `limit` ;
3.  recherche ;
4.  pagination ;
5.  `visibility` ;
6.  export XLSX ;
7.  autoplay du carrousel ;
8.  skip-widget et finitions accessibilité.

### Étape 4 --- analytics

Le composant émet `koha-list-widget:interaction`. Ensuite seulement,
implémenter `koha-list-widget-matomo.js`.

## 3. Séparation des responsabilités

### Python

Responsable de :

-   parsing CSV ;
-   normalisation structurelle ;
-   `holdings` ;
-   permalinks ;
-   récupération/cache des couvertures ;
-   XLSX ;
-   JSON final.

### `koha-list-widget.js`

Responsable de :

-   rendu ;
-   interactions ;
-   tri/recherche/pagination ;
-   accessibilité du composant ;
-   événements génériques.

Il ne connaît pas Matomo.

### `koha-list-widget-matomo.js`

Responsable uniquement de traduire les événements génériques en appels
`_paq`.

### `koha-list-widget-custom.css`

Personnalisation externe via `::part()`. Ne pas dépendre de sélecteurs
internes au Shadow DOM.

## 4. Robustesse

-   Échapper tout contenu injecté dans du HTML.
-   Préférer la création DOM (`textContent`, `setAttribute`) à la
    concaténation HTML lorsque pratique.
-   Valider les valeurs numériques (`list_id`, `limit`, `paginate`,
    `autoplay-delay`).
-   Valeurs invalides : comportement sûr, pas d'exception non gérée.
-   Ne pas supposer que tous les champs bibliographiques sont
    renseignés.
-   Les données originales complètes doivent rester disponibles pour
    recherche, accessibilité et export.

## 5. Démo

`demo/index.html` doit contenir de nombreux exemples et permettre de tester au minimum :

-   carrousel sans autoplay;
-   carrousel avec autoplay 1000 ms ;
-   carrousel avec autoplay par défaut ;
-   grille ;
-   liste ;
-   compact ;
-   recherche ;
-   tri ;
-   pagination ;
-   repli ;
-   export Excel autorisé ou non;
-   analytics.

Utiliser un jeu de données de démonstration fourni : data/data.csv

La livraison comprend `demo/index.html` (six exemples et parcours de recette),
`demo/demo.js` (HTML d'intégration et journal local), ainsi que
[UTILISATION.md](UTILISATION.md) pour le démarrage, la publication et l'exploitation.
Le script de démonstration est indépendant des deux scripts distribués du widget.

## 6. Definition of Done

Une fonctionnalité est terminée quand :

-   elle respecte le PRD ;
-   elle fonctionne clavier/souris/tactile lorsque pertinent ;
-   elle a un cas de test ;
-   elle ne casse pas les autres modes ;
-   elle ne crée pas de dépendance Matomo dans le composant ;
-   elle ne modifie pas les noms publics définis par les specs.
