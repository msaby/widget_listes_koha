# Contrat de données CSV / JSON

## 1. Champs canoniques

Ordre attendu du CSV :

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

Le JSON document conserve exactement ces noms. Ne pas créer `author`,
`year`, `list_no`, `list_name`, `itemtype`, etc.

## 2. Champs calculés

Le pipeline peut ajouter :

``` text
record_url
local_cover_url
```

Les métadonnées de liste ajoutent :

``` text
export_xlsx
```

## 3. Types recommandés

  Champ               Type JSON
  ------------------- -----------
  `biblionumber`      string
  `document_type`     string
  `title`             string
  `subtitle`          string
  `authors`           string
  `isbn`              string
  `ean`               string
  `date`              string
  `publisher`         string
  `pages`             string
  `abstract`          string
  `cover_url`         string
  `holdings`          array
  `opac_suppressed`   string
  `list_id`           string
  `list`              string
  `list_sort`         string
  `record_url`        string
  `local_cover_url`   string

Conserver ISBN/EAN comme chaînes.

## 4. `holdings`

La cellule CSV contient du JSON sérialisé :

``` json
[
  {"library":"MEDP","location":"BUR","callnumber":"Z 692 JAC"},
  {"library":"LASH","location":"SL1","callnumber":"025.04 JAC"}
]
```

Le JSON final doit contenir directement :

``` json
"holdings": [
  {"library":"MEDP","location":"BUR","callnumber":"Z 692 JAC"},
  {"library":"LASH","location":"SL1","callnumber":"025.04 JAC"}
]
```

### Règles

-   Une cellule vide produit `[]`.
-   Un tableau vide produit `[]`.
-   Ne jamais laisser la représentation sérialisée comme chaîne dans le
    JSON final.
-   Chaque entrée peut avoir `library`, `location`, `callnumber`.
-   Les propriétés manquantes doivent être tolérées.
-   Le widget V1 ne rend pas et ne recherche pas `holdings`.
-   L'Excel utilise `holdings` pour la colonne `Exemplaires`.

Pour une valeur JSON invalide dans le CSV, ne pas faire échouer tout le
traitement : journaliser clairement la ligne/notice concernée et
utiliser une politique explicite et testée (par défaut `[]` si aucune
autre règle n'est fixée).

## 5. Métadonnées de liste

Structure :

``` json
{
  "lists": {
    "11": {
      "list_id": "11",
      "list": "Fonds professionnels",
      "list_sort": "date",
      "export_xlsx": "../exports/liste-11.xlsx"
    }
  }
}
```

`export_xlsx` ne doit être annoncé que si le fichier a été généré avec
succès.

## 6. Document exemple

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
    {"library":"MEDP","location":"BUR","callnumber":"Z 692 JAC"}
  ],
  "opac_suppressed": "0",
  "list_id": "11",
  "list": "Fonds professionnels",
  "list_sort": "date",
  "record_url": "https://catalogue.bu.univ-cotedazur.fr/permalink/f/11hf8mm/33UCA_KOHA272037",
  "local_cover_url": "../covers/272037.jpg"
}
```

## 7. Primo

Préfixe :

``` text
https://catalogue.bu.univ-cotedazur.fr/permalink/f/11hf8mm/33UCA_KOHA
```

URL :

``` text
{prefix}{biblionumber}
```
