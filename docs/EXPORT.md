# Export Excel

## 1. Principe

Python génère **un XLSX par liste Koha** pendant le traitement
quotidien. Le navigateur ne génère aucun Excel.

Le classeur contient toute la liste, sans tenir compte de `display`,
`limit`, `paginate`, recherche, page, visibility, autoplay ou tri
d'affichage.

## 2. Colonnes

Ordre exact :

1.  `Lien catalogue`
2.  `Type de document`
3.  `Titre`
4.  `Auteur`
5.  `ISBN`
6.  `EAN`
7.  `Date`
8.  `Éditeur`
9.  `Pages`
10. `Résumé`
11. `Exemplaires`
12. `Liste`

Correspondances :

  Excel              Donnée
  ------------------ ------------------------
  Catalogue          `biblionumber` → Primo
  Type de document   `document_type`
  Titre              `title` + `subtitle`
  Auteur             `authors`
  ISBN               `isbn`
  EAN                `ean`
  Date               `date`
  Éditeur            `publisher`
  Pages              `pages`
  Résumé             `abstract`
  Exemplaires        `holdings` formaté
  Liste              `list`

Ne pas exporter `cover_url`, `opac_suppressed`, `list_id`, `list_sort`.
Pas d'image.

## 3. Lien catalogue

Vrai hyperlien Excel :

``` text
Voir dans le catalogue
```

vers :

``` text
https://catalogue.bu.univ-cotedazur.fr/permalink/f/11hf8mm/33UCA_KOHA{biblionumber}
```

## 4. Titre et résumé

Titre :

``` text
title
```

ou :

``` text
title : subtitle
```

Aucune troncature.

`Résumé` contient `abstract` intégral, vide si absent, avec
`wrap_text=True`.

## 5. Exemplaires

Tous les objets `holdings` d'un document sont concaténés dans **une
seule cellule**, un exemplaire par ligne.

Format public actuel :

``` text
{library} — {location} — cote {callnumber}
```

Exemple :

``` text
MEDP — BUR — cote Z 692 JAC
LASH — SL1 — cote 025.04 JAC
```

Les valeurs absentes sont omises proprement :

``` text
MEDP — cote Z 692 JAC
```

Si `holdings=[]`, cellule vide.

Les codes sont conservés pour l'instant. Le remplacement futur par des
libellés publics est hors périmètre.

La cellule a :

-   retour à la ligne ;
-   alignement vertical haut ;
-   largeur raisonnable.

## 6. ISBN/EAN

Toujours écrire comme texte.

## 7. Mise en forme

Avec `openpyxl` :

-   en-têtes en évidence ;
-   freeze de la première ligne ;
-   auto-filter ;
-   largeurs adaptées ;
-   wrap pour Résumé et Exemplaires ;
-   alignement vertical haut pour cellules multilignes ;
-   hyperlinks réels ;
-   pas de décoration lourde.

## 8. Métadonnée JSON

Le fichier n'est proposé au widget que si sa génération a réussi :

``` json
"export_xlsx": "../exports/liste-11.xlsx"
```

## 9. Nom de fichier

Convention :

``` text
liste-{list_id}.xlsx
```
