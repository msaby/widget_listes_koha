// Adaptateur facultatif : charger ce script séparément du Web Component.
// Il transforme les événements publics en commandes Matomo, sans télécharger
// de tracker ni définir de serveur/site Matomo. La page hôte garde ces réglages.
(() => {
  // Une fonction immédiatement exécutée isole les variables du script classique.
  // Symbol.for retrouve la même clé lors d'un second chargement : un seul écouteur
  // global évite de compter deux fois les interactions de toutes les instances.
  const installed = Symbol.for('koha-list-widget.matomo.installed');
  if (window[installed]) return;
  window[installed] = true;

  const positive = value => Number.isSafeInteger(value) && value > 0;
  const string = value => typeof value === 'string';
  const oneOf = values => value => values.includes(value);
  // La liste blanche décrit le contrat accepté. Les champs supplémentaires
  // (recherche, URL cible, données de lecteur…) ne sont jamais sérialisés.
  const common = {
    list_id: positive, display: oneOf(['carousel', 'grid', 'list', 'compact']),
    widget_id: value => string(value) && value.length > 0,
    site: string, page_path: string, page_title: string,
  };
  const specific = {
    document_click: { biblionumber: value => string(value) && /^\d+$/.test(value), position: positive, page: positive },
    pagination_change: { from_page: positive, page: positive, page_size: positive,
      navigation_type: oneOf(['previous', 'next', 'page_number']), pagination_position: oneOf(['top', 'bottom']) },
    carousel_navigate: { navigation_type: oneOf(['button', 'scroll']), direction: oneOf(['previous', 'next']), first_visible_position: positive },
    autoplay_toggle: { state: oneOf(['paused', 'playing']) },
    excel_download: {},
  };

  document.addEventListener('koha-list-widget:interaction', interaction => {
    const detail = interaction.detail;
    if (!detail || detail.widget !== 'koha-list-widget' || !Object.hasOwn(specific, detail.event)) return;
    const fields = { ...common, ...specific[detail.event] };
    if (!Object.entries(fields).every(([key, valid]) => valid(detail[key]))) return;
    // L'ordre des clés est fixe ; encoder les valeurs protège les séparateurs
    // « | » et « = ». decodeURIComponent permet de relire chaque valeur au besoin.
    try {
      const name = Object.keys(fields).map(key => `${key}=${encodeURIComponent(detail[key])}`).join(' | ');
      // Avant le chargement asynchrone de Matomo, _paq est une file de commandes.
      // Après chargement, Matomo peut la remplacer par un objet exposant push.
      // Conserver cet objet et les commandes existantes, sans imposer un tableau.
      window._paq ??= [];
      if (typeof window._paq.push === 'function') window._paq.push(['trackEvent', 'KohaListWidget', detail.event, name]);
    } catch {
      // Un tracker indisponible ou défectueux ne doit pas interrompre les liens,
      // la pagination ou les autres écouteurs du composant.
    }
  });
})();
