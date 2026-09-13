# Plan de tests / critères d'acceptation

## 1. Pipeline CSV → JSON

-   CSV valide.
-   Champs facultatifs vides.
-   Accents, apostrophes, Unicode.
-   ISBN/EAN conservés comme chaînes.
-   `list_id` conservé.
-   `record_url` correct.
-   plusieurs listes dans un même export.
-   JSON valide.

## 2. Holdings

Tester :

``` json
[]
```

un objet, plusieurs objets, propriété manquante, caractères spéciaux
dans la cote, JSON sérialisé invalide.

Vérifier :

-   désérialisation CSV → tableau JSON ;
-   jamais de chaîne JSON dans le JSON final ;
-   widget ne l'affiche pas ;
-   recherche ne l'indexe pas ;
-   Excel le transforme en `Exemplaires`.

## 3. Couvertures

Cas :

-   `cover_url` absente ;
-   présente et valide ;
-   présente et en erreur ;
-   URL identique au cache ;
-   URL modifiée ;
-   URL supprimée après récupération antérieure ;
-   fallback fournisseur ;
-   cache négatif Google/BnF/Amazon ;
-   aucun cache négatif permanent `cover_url` ;
-   erreur couverture sans échec JSON/XLSX.

## 4. XLSX

Vérifier les 12 colonnes et leur ordre.

Tester :

-   titre avec/sans sous-titre ;
-   résumé absent/très long ;
-   ISBN/EAN avec zéros ;
-   hyperlink Primo ;
-   `holdings=[]` → Exemplaires vide ;
-   un exemplaire ;
-   plusieurs exemplaires avec retours à la ligne ;
-   champ `location` manquant → pas de séparateur vide ;
-   wrap Résumé/Exemplaires ;
-   fichier complet malgré `limit`/recherche/pagination du widget ;
-   `export_xlsx` seulement si génération réussie.

## 5. Widget --- sélection

-   `list_id` absent → aucun rendu ;
-   `list_id` non numérique/invalide → aucun rendu ;
-   1 document ;
-   centaines de documents.

## 6. Modes

Tester carousel/grid/list/compact desktop et mobile.

Compact :

-   aucune couverture ;
-   aucun placeholder ;
-   une seule ligne visuelle ;
-   titre/auteurs/éditeur longs ;
-   ellipsis dynamique ;
-   contenu complet accessible ;
-   carte/ligne entière cliquable.

## 7. Recherche / tri / pagination

-   casse et accents ;
-   plusieurs termes = ET ;
-   recherche sur texte complet tronqué visuellement ;
-   `holdings` et `abstract` non recherchés ;
-   tri titre avec articles ;
-   auteurs absents à la fin ;
-   date décroissante ;
-   recherche + pagination ;
-   changement de recherche revient page 1 ;
-   positions globales.

## 8. Visibility

-   absent ;
-   `collapsible` ;
-   `collapsed` ;
-   valeur invalide ;
-   `aria-expanded` ;
-   `hidden` ;
-   autoplay suspendu quand replié.

## 9. Autoplay

-   absent = off ;
-   défaut 5000 ms ;
-   délai personnalisé ;
-   boucle ;
-   hover ;
-   focus ;
-   bouton ;
-   scroll ;
-   touch ;
-   Pause persistante ;
-   Reprendre ;
-   délai complet avant reprise ;
-   reduced motion = autoplay off ;
-   aucune annonce live répétitive.

## 10. Accessibilité

-   navigation clavier complète ;
-   focus visible ;
-   vrais liens/boutons ;
-   nouvel onglet annoncé ;
-   alt vide sur couvertures ;
-   recherche labellisée ;
-   pagination `aria-current` ;
-   skip-widget sort du Shadow DOM ;
-   aucun piège de focus ;
-   compact accessible malgré ellipsis.

## 11. Analytics

Pour chaque mode :

-   `document_click`;
-   `pagination_change`;
-   `carousel_navigate`;
-   `autoplay_toggle`;
-   `excel_download`.

Vérifier `list_id`, `display`, `widget_id`, site/path/title, positions
globales. Vérifier qu'un déplacement autoplay ne produit pas une
interaction de navigation utilisateur.

## 12. Régression API

Recherche automatique dans le code pour empêcher le retour d'anciens
noms :

``` text
list_no
visibilty
```

Ils ne doivent pas apparaître dans le contrat public ou le modèle de
données.
