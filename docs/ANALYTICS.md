# Analytics et Matomo

## 1. Séparation

`koha-list-widget.js` émet :

``` text
koha-list-widget:interaction
```

Il ne connaît pas Matomo.

`koha-list-widget-matomo.js` écoute ces événements et appelle `_paq`.

## 2. Contexte commun

``` javascript
{
  event: "document_click",
  widget: "koha-list-widget",
  widget_id: "list11-accueil",
  list_id: 11,
  display: "compact",
  site: window.location.hostname,
  page_path: window.location.pathname,
  page_title: document.title
}
```

`list_id` est le nom canonique.

## 3. Événements

### `document_click`

Ajouter :

``` text
biblionumber
position
page
```

`position` = position globale après pipeline d'affichage.

### `pagination_change`

Ajouter :

``` text
from_page
page
page_size
navigation_type
pagination_position
```

`navigation_type` : `previous`, `next`, `page_number`.

`pagination_position` : `top`, `bottom`.

### `carousel_navigate`

Interaction manuelle uniquement. Ajouter :

``` text
navigation_type = button | scroll
direction
first_visible_position
```

Déclencher après stabilisation (\~250 ms), pas sur chaque événement DOM
`scroll`.

### `autoplay_toggle`

Action explicite :

``` text
state = paused | playing
```

Les déplacements automatiques ne sont **pas** des interactions
utilisateur et ne doivent pas alimenter `carousel_navigate`.

### `excel_download`

Contexte commun suffisant :

``` text
list_id
display
widget_id
site
page_path
page_title
```

## 4. Adaptateur Matomo

Catégorie :

``` text
KohaListWidget
```

Action = nom de l'événement.

Exemple :

``` javascript
window._paq.push([
  "trackEvent",
  "KohaListWidget",
  action,
  name
]);
```

Le `name` peut être une chaîne déterministe :

``` text
list_id=11 | display=compact | widget=list11 | biblionumber=272037 | position=17 | page=2
```

Ne pas inclure de donnée personnelle.

## 5. Confidentialité

Ne pas envoyer :

-   nom ;
-   login ;
-   numéro de lecteur ;
-   email ;
-   identifiant d'usager ;
-   autre identifiant personnel.

Éviter l'URL cible complète si elle n'est pas nécessaire. `site`,
`page_path`, `page_title`, `biblionumber` et contexte du widget
suffisent.

## 6. KPI

Taux d'interaction :

``` text
visites avec ≥1 événement utilisateur KohaListWidget
------------------------------------------------ × 100
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

Ne jamais compter les mouvements autoplay dans les interactions
utilisateur.
