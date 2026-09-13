# Tri, recherche, limite et pagination

## 1. Ordre du pipeline client

Pour la liste sélectionnée :

``` text
documents de list_id
        ↓
       tri
        ↓
 recherche éventuelle
        ↓
      limit
        ↓
 pagination / rendu
```

L'Excel est indépendant de ce pipeline.

## 2. Tri

Critères reconnus :

``` text
title
authors
date
```

`sort` surcharge `list_sort`.

### Titre

Tri alphabétique en ignorant les articles initiaux :

``` text
Le
La
Les
L'
Un
Une
Des
The
A
An
```

Utiliser une comparaison locale robuste, par exemple `Intl.Collator`,
après calcul d'une clé sans article initial.

### Authors

Alphabétique. Valeurs absentes à la fin.

### Date

Plus récent → plus ancien. Valeurs absentes/non exploitables à la fin.

## 3. Recherche

Champs indexés :

``` text
document_type
title
subtitle
authors
publisher
date
```

Non indexés :

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

Normalisation :

-   minuscules ;
-   suppression des diacritiques ;
-   espaces normalisés.

Tous les termes saisis doivent être présents quelque part dans le texte
indexé (ET).

Toujours utiliser les valeurs originales, jamais les chaînes
visuellement tronquées.

## 4. `limit`

Défaut : 12.

`limit` plafonne le nombre de résultats présentés après recherche. Il ne
modifie ni le JSON source ni le XLSX.

## 5. Pagination

Applicable à grid/list/compact. Ignorée en carousel.

`paginate=N` = N documents par page parmi les résultats après `limit`.

Les contrôles haut/bas sont synchronisés.

Les positions analytiques sont globales. Exemple : page 2, taille 40,
premier document = position 41.

## 6. Changements d'état

Une nouvelle recherche doit revenir à la première page.

Un changement de tri doit produire un rendu cohérent et, sauf raison
contraire définie par l'implémentation, revenir à une position/page
valide.

En carousel, un changement de recherche réinitialise le scroll.

## 7. Résultat vide

Afficher un état explicite lorsque la liste existe mais que la recherche
ne trouve aucun document. Cet état est distinct de l'absence/invalidité
du paramètre `list`.
