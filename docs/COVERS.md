# Couvertures --- récupération et cache

## 1. Objectif

Les couvertures sont récupérées lors du traitement Python et servies
localement. Le navigateur n'interroge jamais les fournisseurs.

Fichier positif :

``` text
covers/{biblionumber}.jpg
```

Métadonnées/cache :

``` text
covers/.cover-cache.json
```

## 2. Priorité

``` text
cover_url présente
  ├─ succès → cache local
  └─ échec → fournisseurs configurés

cover_url absente
  └─ fournisseurs configurés
```

Fournisseurs prévus : Google Books, BnF, Amazon. L'ordre effectif suit
la configuration CLI.

## 3. Cache positif et provenance

Le cache doit mémoriser la provenance, notamment l'URL exacte lorsqu'une
image vient de `cover_url`.

Exemple :

``` json
{
  "covers": {
    "272037": {
      "source": "cover_url",
      "source_url": "https://example.org/cover.jpg"
    },
    "272038": {
      "source": "google"
    }
  },
  "negative": {
    "google:272039": true,
    "bnf:272039": true
  }
}
```

## 4. Règles `cover_url`

À chaque traitement :

1.  `cover_url` présente + image locale issue de la même `source_url` →
    réutiliser ;
2.  `cover_url` présente + URL différente → tenter la nouvelle URL même
    si l'image locale existe ;
3.  succès → remplacer image et métadonnées ;
4.  échec → tenter les fournisseurs configurés ;
5.  si `cover_url` disparaît du CSV mais qu'une image locale existe
    déjà, conserver cette image.

## 5. Cache négatif

Le cache négatif concerne les fournisseurs externes :

``` text
google:{biblionumber}
bnf:{biblionumber}
amazon:{biblionumber}
```

**Ne pas créer de cache négatif permanent pour `cover_url`.** Une URL
peut changer ou être temporairement indisponible ; elle doit pouvoir
être retentée lors d'un traitement ultérieur.

## 6. Tolérance aux erreurs

Une erreur réseau, HTTP, format d'image ou fournisseur :

-   est loguée ;
-   ne bloque pas les autres sources ;
-   ne bloque pas JSON ;
-   ne bloque pas XLSX.

## 7. Sortie JSON

Si une couverture locale exploitable existe :

``` json
"local_cover_url": "../covers/272037.jpg"
```

Le navigateur n'utilise pas `cover_url`.

## 8. Affichage

-   carousel/grid : hauteur 180 px ;
-   list : 120×170 px ;
-   list mobile : 90×130 px ;
-   compact : aucune image/placeholder.

`object-fit: contain`; image décorative `alt=""`; lazy loading lorsque
pertinent.
