// Ce module définit la balise HTML <koha-list-widget>. Le navigateur construit
// une instance indépendante de KohaListWidget pour chaque balise de la page.
// Chemin de lecture conseillé : connectedCallback() → load() → render() →
// updateResults() → book(). Les autres méthodes gèrent ensuite les interactions.
// Python prépare les données, couvertures et XLSX ; ce fichier ne fait que les afficher.
const MODES = ['carousel', 'grid', 'list', 'compact'];
// Identifiant de secours propre à chaque instance pendant la vie de la page.
// analytics-id permet au site de fournir un nom stable d'une visite à l'autre.
let instanceCount = 0;
// Liste volontairement limitée : résumés, exemplaires et identifiants ne sont pas recherchés.
const SEARCH_FIELDS = ['document_type', 'title', 'subtitle', 'authors', 'publisher', 'date'];
const COLLATOR = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
// Collator compare les textes selon les règles françaises ; numeric ordonne 2 avant 10.
// Ces petits helpers sont des fonctions fléchées : « valeur => résultat ».
const PRIMO = 'https://catalogue.bu.univ-cotedazur.fr/permalink/f/11hf8mm/33UCA_KOHA';
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const normalized = value => text(value).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').trim();
// NFD sépare les accents de leurs lettres ; \p{M} enlève ensuite ces marques.
// integer() évite les nombres négatifs, décimaux ou trop grands pour être exacts en JS.
const integer = (value, fallback = null) => /^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const titleKey = value => normalized(value).replace(/^(?:(?:le|la|les|un|une|des|the|a|an)\s+|l['’]\s*)/u, '');
const publicationYear = value => Number(text(value).match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1]) || null;
function url(value, base) {
  // Résoudre ../covers/a.jpg nécessite une URL de départ (base). On n'accepte
  // que HTTP(S), jamais un lien javascript: provenant des données reçues.
  if (!text(value).trim()) return '';
  try { const result = new URL(value, base); return /^https?:$/.test(result.protocol) ? result.href : ''; }
  catch { return ''; }
}
function element(tag, attributes = {}, content) {
  // Fabrique un élément du DOM (la représentation de la page en mémoire).
  // textContent affiche les données comme du texte : un titre contenant <img>
  // ne devient pas du HTML exécutable. Les attributs absents sont simplement omis.
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(name, String(value));
  }
  if (content !== undefined) node.textContent = content;
  return node;
}
// Le CSS est embarqué dans le module pour distribuer un composant autonome.
// Il sera inséré dans le Shadow DOM : ses sélecteurs restent internes au widget.
// :host représente la balise extérieure ; var(--koha-..., défaut) permet au site
// hôte de changer les couleurs et espacements. Les attributs part donnent aussi
// accès à certains éléments via koha-list-widget::part(nom) depuis la page.
// .sr-only cache visuellement un texte en le laissant lisible aux lecteurs d'écran.
// En compact, nowrap + ellipsis tronquent seulement l'affichage, pas le texte du DOM.
// Les règles @media adaptent le mobile et respectent la réduction des mouvements.
const styles = `
:host { display:block; min-width:0; color:var(--koha-text,#20313d); font:inherit; }
* { box-sizing:border-box; }
[hidden] { display:none !important; }
.widget { position:relative; font-family:var(--koha-font,inherit); line-height:1.5; }
h2,h3,p { margin:0; }
.heading { font-size:1.4rem; margin-bottom:.5rem; }
.description { margin-bottom:1rem; color:var(--koha-muted,#495b67); }
.controls,.nav,.pagination { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin:.75rem 0; }
button,input,.export { font:inherit; color:inherit; }
button,.export { border:1px solid var(--koha-border,#bac5cc); border-radius:.35rem; padding:.55rem .85rem; background:var(--koha-surface,#fff); min-height:44px; }
button { cursor:pointer; }
button:hover:not(:disabled),.export:hover { background:var(--koha-hover,#edf3f6); }
button:disabled { cursor:default; opacity:.5; }
button[aria-current=page] { background:var(--koha-accent,#215a73); color:white; border-color:var(--koha-accent,#215a73); }
:is(a,button,input,[tabindex]):focus-visible { outline:3px solid var(--koha-focus,#b45105); outline-offset:3px; }
input { width:min(100%,28rem); min-width:0; min-height:44px; border:1px solid var(--koha-border,#bac5cc); padding:.6rem .75rem; border-radius:.35rem; background:var(--koha-surface,#fff); }
.search-controls { flex:1 1 18rem; display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
.search-status { font-size:.9rem; color:var(--koha-muted,#495b67); }
.books { list-style:none; margin:0; padding:4px; gap:var(--koha-gap,1rem); }
.book { min-width:0; }
.book-link { position:relative; display:block; height:100%; text-decoration:none; color:inherit; border:1px solid var(--koha-border,#bac5cc); background:var(--koha-surface,#fff); border-radius:var(--koha-radius,.5rem); overflow:hidden; }
.book-link:hover { border-color:var(--koha-accent,#215a73); }
.book-link:hover .title,.book-link:focus-visible .title { text-decoration:underline; text-decoration-thickness:1.5px; text-underline-offset:3px; }
.book-layout { height:100%; }
.cover { height:180px; display:flex; align-items:center; justify-content:center; background:var(--koha-cover-background,#f0f3f5); }
.cover img { display:block; width:100%; height:100%; object-fit:contain; }
.placeholder { color:var(--koha-muted,#495b67); font-size:.85rem; padding:.75rem; text-align:center; }
.content { padding:1rem; min-width:0; overflow-wrap:anywhere; }
.document-type { display:block; font-size:.8rem; letter-spacing:.04em; color:var(--koha-muted,#495b67); margin-bottom:.35rem; }
.title { font-size:1.08rem; line-height:1.4; font-weight:650; }
.authors,.meta { display:block; font-size:1rem; margin-top:.45rem; }
.meta { color:var(--koha-muted,#495b67); }
.grid .books { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr)); }
.carousel .books { display:flex; overflow-x:auto; overscroll-behavior-x:contain; scroll-snap-type:x mandatory; scroll-padding:4px; scrollbar-width:thin; padding-bottom:12px; }
.carousel .book { flex:0 0 min(260px,85%); scroll-snap-align:start; }
.list .books { display:grid; gap:.75rem; }
.list .book-layout { display:grid; grid-template-columns:120px minmax(0,1fr); }
.list .cover { width:120px; height:170px; }
.compact .books { display:grid; gap:0; }
.compact .book-link { border:0; border-bottom:1px solid var(--koha-border,#bac5cc); border-radius:0; padding:.65rem .4rem; }
.compact-row { display:flex; align-items:baseline; gap:.35rem; white-space:nowrap; overflow:hidden; }
.compact-row .document-type { display:inline; flex:0 1 auto; max-width:15%; margin:0; overflow:hidden; text-overflow:ellipsis; }
.compact-row .title { flex:1 1 45%; min-width:0; overflow:hidden; text-overflow:ellipsis; }
.compact-row .authors,.compact-row .meta { flex:0 1 auto; max-width:23%; min-width:0; margin:0; overflow:hidden; text-overflow:ellipsis; }
.empty,.message { padding:1rem 0; }
.summary { margin-inline-start:.5rem; color:var(--koha-muted,#495b67); }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }
.skip:not(:focus) { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); padding:0; border:0; }
@media(max-width:600px) {
 .list .book-layout { grid-template-columns:90px minmax(0,1fr); }
 .list .cover { width:90px; height:130px; }
 .content { padding:.75rem; }
 .compact-row .title { flex-basis:55%; }
 .compact-row .authors,.compact-row .meta { max-width:18%; }
}
@media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto !important; animation:none !important; transition:none !important; } }
`;

export class KohaListWidget extends HTMLElement {
  // Seuls ces attributs déclenchent attributeChangedCallback quand ils sont modifiés.
  // Un attribut booléen comme searchable est activé par sa présence, même sans valeur.
  static observedAttributes = ['src', 'list_id', 'list', 'display', 'limit', 'paginate', 'sort',
    'searchable', 'show-list-name', 'description', 'visibility', 'autoplay', 'autoplay-delay', 'export', 'analytics-id'];

  constructor() {
    // super() initialise HTMLElement. Le Shadow DOM « open » isole le rendu,
    // tout en le laissant inspectable par JavaScript, les outils du navigateur et les tests.
    super();
    this.attachShadow({ mode: 'open' });
    this.page = 1;
    // État de cette instance : page et recherche courantes, repli et pause explicite.
    // paused est distinct d'une suspension temporaire causée par le survol ou le focus.
    this.query = '';
    this.collapsed = false;
    this.paused = false;
    this.loadVersion = 0;
    this.instanceId = `koha-list-widget-${++instanceCount}`;
  }

  connectedCallback() {
    // Le navigateur appelle cette méthode à l'insertion dans la page, y compris
    // après une déconnexion/réinsertion. L'AbortController regroupe les écouteurs
    // d'événements : un seul abort() permettra de tous les retirer proprement.
    this.lifecycle = new AbortController();
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change', () => this.render(), { signal: this.lifecycle.signal });
    const listen = (target, event, callback, options = {}) => target.addEventListener(event, callback, { ...options, signal: this.lifecycle.signal });
    listen(this, 'pointerenter', event => { if (event.pointerType !== 'touch') { this.hovering = true; this.scheduleAutoplay(); } });
    listen(this, 'pointerleave', () => { this.hovering = false; this.scheduleAutoplay(); });
    listen(this, 'focusin', () => this.scheduleAutoplay());
    listen(this, 'focusout', () => queueMicrotask(() => this.scheduleAutoplay()));
    // Attendre une microtâche après focusout laisse au navigateur le temps de
    // désigner la nouvelle cible du focus avant de décider si l'autoplay peut reprendre.
    const endTouch = () => {
      if (!this.touching) return;
      this.touching = false;
      // Le doigt peut rester posé avant de glisser. Garder l'intention jusqu'au
      // relâchement ; les scroll d'inertie prolongeront ensuite ce délai.
      if (this.pendingNavigation) {
        clearTimeout(this.scrollTimer);
        this.scrollTimer = setTimeout(() => this.settleScroll(), 250);
      }
      this.scheduleAutoplay();
    };
    listen(window, 'pointerup', endTouch);
    listen(window, 'pointercancel', endTouch);
    listen(document, 'visibilitychange', () => this.scheduleAutoplay());
    this.collapsed = this.getAttribute('visibility') === 'collapsed';
    this.queueUpdate(true);
  }

  disconnectedCallback() {
    // Un composant retiré de la page ne doit garder ni requête, ni minuterie,
    // ni écouteur global actif. Cela évite aussi des mises à jour sur des éléments supprimés.
    this.lifecycle?.abort();
    this.request?.abort();
    this.loadVersion++;
    this.clearTimers();
    this.skipTarget?.remove();
  }

  attributeChangedCallback(name, previous, current) {
    // Adapter un attribut ne nécessite pas toujours de télécharger à nouveau le JSON.
    // Un tri ou un mode change le rendu ; src ou list_id redémarrent le chargement.
    if (previous === current) return;
    if (name === 'visibility') this.collapsed = current === 'collapsed';
    if (name === 'src' || name === 'list_id') { this.query = ''; this.page = 1; }
    if (['sort', 'limit', 'paginate', 'display'].includes(name)) this.page = 1;
    if (name === 'searchable' && current === null) this.query = '';
    this.queueUpdate(name === 'src' || name === 'list_id');
  }

  queueUpdate(reload = false) {
    // Plusieurs setAttribute consécutifs peuvent arriver pendant la même opération.
    // On les regroupe dans une seule microtâche pour éviter les rendus intermédiaires.
    // ||= conserve une demande de rechargement déjà reçue ; elle reste prioritaire.
    this.reloadNeeded ||= reload;
    if (!this.isConnected || this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (!this.isConnected) return;
      const reload = this.reloadNeeded;
      this.reloadNeeded = false;
      if (reload) this.load(); else this.render();
    });
  }

  get listId() { return integer(this.getAttribute('list_id')); }
  // Ces getters ressemblent à des propriétés, mais recalculent une valeur à la lecture.
  // Le mode invalide revient à carousel ; la pagination y est toujours ignorée.
  get mode() { return MODES.includes(this.getAttribute('display')) ? this.getAttribute('display') : 'carousel'; }
  get pageSize() { return this.mode === 'carousel' ? null : integer(this.getAttribute('paginate')); }

  emitInteraction(event, fields = {}) {
    // CustomEvent transporte des données dans detail. bubbles permet à la page
    // d'écouter toutes les instances ; composed traverse aussi un Shadow DOM hôte.
    // Aucun outil de mesure n'est requis pour utiliser ou écouter le composant.
    if (!this.isConnected || !this.listId) return;
    this.dispatchEvent(new CustomEvent('koha-list-widget:interaction', {
      bubbles: true, composed: true,
      detail: { event, widget: 'koha-list-widget',
        widget_id: this.getAttribute('analytics-id')?.trim() || this.id || this.instanceId,
        list_id: this.listId, display: this.mode, site: window.location.hostname,
        page_path: window.location.pathname, page_title: document.title, ...fields },
    }));
  }

  trackLink(link, event, fields = {}) {
    // Entrée au clavier produit aussi click. Le clic central utilise auxclick ;
    // ignorer le bouton droit évite de compter une simple ouverture du menu.
    link.addEventListener('click', () => this.emitInteraction(event, fields));
    link.addEventListener('auxclick', action => {
      if (action.button === 1) this.emitInteraction(event, fields);
    });
  }

  async load() {
    // async/await permet d'attendre fetch sans bloquer l'interface du navigateur.
    // Annuler la requête précédente ne suffit pas toujours : son résultat peut déjà
    // être disponible. loadVersion évite aussi qu'une ancienne réponse remplace la nouvelle.
    this.request?.abort();
    const version = ++this.loadVersion;
    this.data = null;
    this.error = '';
    if (!this.listId) { this.render(); return; }
    this.dataUrl = url(this.getAttribute('src'), document.baseURI);
    // src est relatif à la page hôte. Une fois le JSON reçu, ses propres liens
    // (images et exports) seront résolus par rapport à l'URL effective du JSON.
    if (!this.dataUrl) { this.error = 'La source de cette sélection est absente ou invalide.'; this.render(); return; }
    this.loading = true;
    this.render();
    this.request = new AbortController();
    try {
      const response = await fetch(this.dataUrl, { cache: 'no-store', signal: this.request.signal });
      // no-store demande des données fraîches. fetch ne rejette pas les HTTP 404/500,
      // d'où la vérification explicite de response.ok avant de décoder le JSON.
      if (!response.ok) throw new Error('HTTP');
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.documents) || !payload.lists || typeof payload.lists !== 'object') throw new Error('Format');
      if (version !== this.loadVersion) return;
      this.data = payload;
      this.dataUrl = response.url || this.dataUrl;
    } catch (error) {
      // Une annulation due à un changement d'attribut n'est pas une panne à afficher.
      if (version !== this.loadVersion || error.name === 'AbortError') return;
      this.error = 'Impossible de charger cette sélection. Réessayez plus tard.';
    }
    if (version === this.loadVersion) { this.loading = false; this.render(); }
  }

  clearTimers() {
    // clearTimeout empêche une fonction programmée de se déclencher plus tard.
    // L'observateur de taille doit également cesser d'observer l'ancien rendu.
    clearTimeout(this.searchTimer);
    clearTimeout(this.autoplayTimer);
    clearTimeout(this.scrollTimer);
    this.resizeObserver?.disconnect();
    this.scrollOrigin = null;
    this.pendingNavigation = null;
  }

  render() {
    // Reconstruit la structure du widget (titres, contrôles, zone de résultats).
    // Lors d'une simple saisie ou d'une pagination, updateResults() suffit : on
    // évite alors de recréer le champ dans lequel l'utilisateur est en train d'écrire.
    this.clearTimers();
    const active = this.shadowRoot.activeElement;
    const focusKey = active?.dataset.focus;
    // ?. lit une propriété uniquement si l'objet existe. data-focus identifie un
    // contrôle entre deux rendus pour lui rendre le focus et restaurer le curseur.
    const caret = active instanceof HTMLInputElement ? active.selectionStart : null;
    this.shadowRoot.replaceChildren();
    this.autoplayButton = null;
    this.previousButton = null;
    this.nextButton = null;
    if (!this.listId) { this.skipTarget?.remove(); return; }
    this.metadata = this.data?.lists[String(this.listId)] || {};
    // list_id choisit la liste Koha ; list est son nom lisible ; display choisit
    // le mode graphique. Ces trois usages ne sont pas interchangeables.
    this.selection = (this.data?.documents || []).filter(doc => doc && integer(text(doc.list_id)) === this.listId);
    const name = this.getAttribute('list') || text(this.metadata.list) || text(this.selection[0]?.list) || 'Sélection de documents';
    const sheet = element('style', {}, styles);
    this.region = element('section', { class: `widget ${this.mode}`, part: `widget ${this.mode}`, role: 'region', 'aria-label': name });
    if (this.mode === 'carousel') this.region.setAttribute('aria-roledescription', 'carrousel');
    this.shadowRoot.append(sheet, this.region);
    const skip = element('button', { type: 'button', class: 'skip', part: 'skip-widget' }, 'Passer cette sélection de documents');
    skip.addEventListener('click', () => this.skip());
    this.region.append(skip);
    if (this.hasAttribute('show-list-name')) this.region.append(element('h2', { class: 'heading', part: 'list-name' }, name));
    const description = this.getAttribute('description');
    if (description) {
      this.region.append(element('p', { id: 'description', class: 'description', part: 'list-description' }, description));
      this.region.setAttribute('aria-describedby', 'description');
    }
    this.live = element('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    // Cette région annonce les changements utiles aux lecteurs d'écran sans
    // interrompre leur lecture. Elle reste silencieuse pendant les mouvements automatiques.
    this.region.append(this.live);
    if (this.loading || this.error || !this.data) {
      this.region.setAttribute('aria-busy', String(Boolean(this.loading)));
      this.region.append(element('p', { class: 'message', role: 'status' }, this.error || 'Chargement de la sélection…'));
      return;
    }
    this.content = element('div', { id: 'collapsible-content', part: 'collapsible-content' });
    // Le titre et la description sont placés avant ce conteneur : ils restent
    // visibles lorsqu'on replie les documents avec la propriété HTML hidden.
    if (['collapsed', 'collapsible'].includes(this.getAttribute('visibility'))) {
      const controls = element('div', { class: 'controls', part: 'visibility-controls' });
      this.visibilityButton = element('button', { type: 'button', part: 'visibility-toggle', 'data-focus': 'visibility',
        'aria-expanded': String(!this.collapsed), 'aria-controls': 'collapsible-content' }, this.collapsed ? 'Afficher les documents' : 'Masquer les documents');
      this.visibilityButton.addEventListener('click', () => {
        // aria-expanded annonce l'état ; aria-controls relie le bouton au contenu.
        // Modifier hidden retire aussi les éléments repliés de la navigation clavier.
        this.collapsed = !this.collapsed;
        this.content.hidden = this.collapsed;
        this.visibilityButton.setAttribute('aria-expanded', String(!this.collapsed));
        this.visibilityButton.textContent = this.collapsed ? 'Afficher les documents' : 'Masquer les documents';
        this.live.textContent = this.collapsed ? 'Documents masqués.' : 'Documents affichés.';
        this.scheduleAutoplay?.();
      });
      controls.append(this.visibilityButton);
      this.region.append(controls);
    } else this.collapsed = false;
    this.content.hidden = this.collapsed;
    this.region.append(this.content);
    const toolbar = element('div', { class: 'controls' });
    this.content.append(toolbar);
    this.searchStatus = null;
    if (this.hasAttribute('searchable')) {
      const controls = element('div', { class: 'search-controls', part: 'search-controls' });
      const input = element('input', { id: 'search', type: 'search', part: 'search-input', 'data-focus': 'search',
        placeholder: 'Rechercher dans cette sélection', 'aria-describedby': 'search-status' });
      input.value = this.query;
      const search = () => {
        // « Debounce » : chaque frappe annule le délai précédent. La recherche
        // démarre après 180 ms de calme, pas pour chacun des caractères intermédiaires.
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
          this.query = input.value;
          this.page = 1;
          this.updateResults();
        }, 180);
      };
      input.addEventListener('input', event => { if (!event.isComposing) search(); });
      // La composition sert à certaines méthodes de saisie multilingues. Attendre
      // compositionend évite de rechercher une syllabe encore en cours de construction.
      input.addEventListener('compositionend', search);
      this.searchStatus = element('span', { id: 'search-status', class: 'search-status', part: 'search-status',
        role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
      controls.append(element('label', { for: 'search', class: 'sr-only' }, 'Rechercher dans cette sélection'), input, this.searchStatus);
      toolbar.append(controls);
    }
    const exportUrl = url(this.metadata.export_xlsx, this.dataUrl);
    // Le téléchargement pointe vers l'Excel déjà produit par Python : il reste
    // complet, même si le widget affiche une page ou un résultat de recherche seulement.
    if (this.getAttribute('export') === 'xlsx' && exportUrl) {
      const link = element('a', { class: 'export', part: 'export', href: exportUrl, download: '', 'data-focus': 'export' }, 'Télécharger la liste complète au format Excel');
      this.trackLink(link, 'excel_download');
      toolbar.append(link);
    }
    this.paginationTop = element('nav', { class: 'pagination', part: 'pagination pagination-top', 'aria-label': 'Pagination en haut de la sélection' });
    this.paginationBottom = element('nav', { class: 'pagination', part: 'pagination pagination-bottom', 'aria-label': 'Pagination en bas de la sélection' });
    this.books = element('ul', { class: 'books', part: 'books', role: 'list' });
    if (this.mode === 'carousel') {
      const nav = element('div', { class: 'nav', part: 'nav' });
      this.previousButton = element('button', { type: 'button', part: 'prev', 'data-focus': 'prev', 'aria-label': 'Documents précédents' }, '← Précédent');
      this.nextButton = element('button', { type: 'button', part: 'next', 'data-focus': 'next', 'aria-label': 'Documents suivants' }, 'Suivant →');
      this.previousButton.addEventListener('click', () => this.navigate(-1));
      this.nextButton.addEventListener('click', () => this.navigate(1));
      nav.append(this.previousButton, this.nextButton);
      this.content.append(nav);
      this.books.tabIndex = 0;
      this.books.setAttribute('aria-label', 'Documents ; utilisez les flèches gauche et droite pour parcourir la sélection');
      this.books.addEventListener('keydown', event => {
        // Tab et les touches de défilement natives peuvent déplacer la zone
        // pour rendre le lien focalisé visible, sans passer par nos flèches.
        if (['Tab', 'PageUp', 'PageDown', ' '].includes(event.key)) this.manualInteraction();
        // Intercepter seulement les touches de navigation prévues. preventDefault
        // évite leur défilement habituel ; on gère ici le déplacement ET le focus.
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = [...this.books.children].findIndex(item => item.contains(this.shadowRoot.activeElement));
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? this.results.length - 1
          : Math.max(0, Math.min(this.results.length - 1, (current < 0 ? this.firstVisible() : current) + (event.key === 'ArrowLeft' ? -1 : 1)));
        this.scrollToIndex(index, false, 'scroll');
        this.books.children[index]?.querySelector('a')?.focus({ preventScroll: true });
      });
      this.books.addEventListener('wheel', () => this.manualInteraction(), { passive: true });
      this.books.addEventListener('pointerdown', event => {
        this.touching = event.pointerType === 'touch';
        this.manualInteraction();
      }, { passive: true });
      this.books.addEventListener('scroll', () => {
        // Le navigateur peut envoyer beaucoup de scroll pendant un seul geste.
        // On attend 250 ms de stabilisation avant d'autoriser un nouveau délai d'autoplay.
        this.scrollOrigin ||= 'manual';
        clearTimeout(this.autoplayTimer);
        this.updateNavigation();
        clearTimeout(this.scrollTimer);
        this.scrollTimer = setTimeout(() => this.settleScroll(), 250);
      }, { passive: true });
      if (this.hasAttribute('autoplay')) {
        const controls = element('div', { class: 'controls', part: 'autoplay-controls' });
        this.autoplayButton = element('button', { type: 'button', part: 'autoplay-toggle', 'data-focus': 'autoplay' });
        this.autoplayButton.addEventListener('click', () => {
          // Cette pause est une décision explicite. Sortir le pointeur du widget
          // ne l'annule pas : seul un nouveau clic sur ce bouton peut la lever.
          this.paused = !this.paused;
          this.emitInteraction('autoplay_toggle', { state: this.paused ? 'paused' : 'playing' });
          this.live.textContent = this.paused ? 'Défilement automatique suspendu.' : 'Défilement automatique repris.';
          this.scheduleAutoplay();
        });
        controls.append(this.autoplayButton);
        toolbar.append(controls);
      }
    }
    this.content.append(this.paginationTop, this.books, this.paginationBottom);
    this.updateResults();
    if (focusKey) {
      const replacement = [...this.shadowRoot.querySelectorAll('[data-focus]')].find(node => node.dataset.focus === focusKey);
      replacement?.focus({ preventScroll: true });
      if (replacement instanceof HTMLInputElement && caret !== null) replacement.setSelectionRange(caret, caret);
    }
    this.scheduleAutoplay();
  }

  updateResults() {
    // Ordre fonctionnel : sélection déjà faite → tri → recherche → limite → page.
    // Les textes complets servent au tri et à la recherche, avant toute troncature visuelle.
    clearTimeout(this.autoplayTimer);
    clearTimeout(this.scrollTimer);
    this.scrollOrigin = 'layout';
    this.pendingNavigation = null;
    const criterion = this.getAttribute('sort') || this.metadata.list_sort || this.selection[0]?.list_sort || 'title';
    const terms = normalized(this.query).split(/\s+/).filter(Boolean);
    const sorted = [...this.selection].sort((a, b) => {
      // [...] copie le tableau : sort() modifie son tableau en place et ne doit
      // pas réordonner les données source. Le comparateur renvoie un nombre :
      // négatif = a avant b, positif = a après b, zéro = conserver leur ordre relatif.
      if (criterion === 'date') {
        const left = publicationYear(a.date), right = publicationYear(b.date);
        return left === null ? (right === null ? 0 : 1) : right === null ? -1 : right - left;
      }
      if (criterion === 'authors') {
        const left = text(a.authors).trim(), right = text(b.authors).trim();
        return !left ? (!right ? 0 : 1) : !right ? -1 : COLLATOR.compare(left, right);
      }
      return COLLATOR.compare(titleKey(a.title), titleKey(b.title));
    });
    this.results = sorted.filter(doc => {
      const indexed = normalized(SEARCH_FIELDS.map(field => text(doc[field])).join(' '));
      return terms.every(term => indexed.includes(term));
      // every signifie que TOUS les mots doivent être présents (logique ET).
    }).slice(0, integer(this.getAttribute('limit'), 12));
    this.totalPages = this.pageSize ? Math.max(1, Math.ceil(this.results.length / this.pageSize)) : 1;
    this.page = Math.min(this.page, this.totalPages);
    const start = this.pageSize ? (this.page - 1) * this.pageSize : 0;
    // Les tableaux commencent à zéro, les pages à un. Page 2 de taille 40 :
    // start vaut 40 et la première position publique vaut 41 (start + index + 1).
    const displayed = this.pageSize ? this.results.slice(start, start + this.pageSize) : this.results;
    this.books.replaceChildren(...displayed.map((doc, index) => this.book(doc, start + index + 1)));
    this.books.scrollLeft = 0;
    this.scrollOrigin = null;
    if (this.searchStatus) this.searchStatus.textContent = `${this.results.length} document${this.results.length === 1 ? '' : 's'} affiché${this.results.length === 1 ? '' : 's'}`;
    this.renderPagination(this.paginationTop, 'top');
    this.renderPagination(this.paginationBottom, 'bottom');
    this.empty?.remove();
    if (!this.results.length) {
      const message = this.query ? 'Aucun document ne correspond à votre recherche.'
        : !this.selection.length && !this.data.lists[String(this.listId)] ? 'Cette liste est introuvable.' : 'Cette sélection ne contient aucun document.';
      this.empty = element('p', { class: 'empty', part: 'search-empty' }, message);
      this.books.after(this.empty);
    }
    this.resizeObserver?.disconnect();
    if (this.mode === 'carousel') {
      this.resizeObserver = new ResizeObserver(() => { this.updateNavigation(); this.scheduleAutoplay(); });
      // Une largeur différente change le nombre de cartes visibles : reconsidérer
      // les boutons de navigation et l'utilité de l'autoplay après redimensionnement.
      this.resizeObserver.observe(this.books);
      this.updateNavigation();
      this.scheduleAutoplay();
    }
  }

  firstVisible() {
    // Approxime l'indice de la carte alignée à gauche en divisant le décalage
    // horizontal par le pas entre deux cartes (largeur + espacement).
    const first = this.books?.firstElementChild;
    const second = first?.nextElementSibling;
    const step = second ? second.offsetLeft - first.offsetLeft : first?.offsetWidth || 1;
    return Math.max(0, Math.round((this.books?.scrollLeft || 0) / step));
  }

  updateNavigation() {
    // scrollWidth est la largeur totale du contenu ; clientWidth la largeur visible.
    // Leur différence donne la dernière position de défilement possible.
    if (!this.previousButton || !this.nextButton) return;
    const maximum = this.books.scrollWidth - this.books.clientWidth;
    this.previousButton.disabled = this.books.scrollLeft <= 1;
    this.nextButton.disabled = this.books.scrollLeft >= maximum - 1;
  }

  manualInteraction(navigationType = 'scroll') {
    // Marquer le geste suspend temporairement l'autoplay, sans changer paused.
    // Mémoriser son départ avant le mouvement. Un scroll seul (autoplay,
    // redimensionnement ou script hôte) ne crée jamais cette intention manuelle.
    this.pendingNavigation ||= { start: this.books.scrollLeft, navigationType };
    this.pendingNavigation.navigationType = navigationType;
    this.scrollOrigin = 'manual';
    clearTimeout(this.autoplayTimer);
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => this.settleScroll(), 250);
  }

  settleScroll() {
    // Regrouper tous les scroll d'un geste en un seul événement, après 250 ms
    // sans mouvement. Un geste bloqué à une extrémité n'est pas une navigation.
    if (this.touching && this.pendingNavigation) return;
    const pending = this.pendingNavigation;
    this.pendingNavigation = null;
    if (pending && this.scrollOrigin === 'manual' && Math.abs(this.books.scrollLeft - pending.start) > 1) {
      const viewport = this.books.getBoundingClientRect();
      // Une carte partiellement visible compte : arrondir scrollLeft donnerait
      // parfois la carte suivante, surtout à l'extrémité du carrousel.
      const index = [...this.books.children].findIndex(item => {
        const rect = item.getBoundingClientRect();
        return rect.right > viewport.left + 1 && rect.left < viewport.right - 1;
      });
      if (index >= 0) this.emitInteraction('carousel_navigate', {
        navigation_type: pending.navigationType,
        direction: this.books.scrollLeft > pending.start ? 'next' : 'previous',
        first_visible_position: index + 1,
      });
    }
    this.scrollOrigin = null;
    this.scheduleAutoplay();
  }

  navigate(direction, automatic = false) {
    // direction vaut -1 ou +1. La boucle fin → début concerne uniquement l'autoplay.
    const atEnd = this.books.scrollLeft >= this.books.scrollWidth - this.books.clientWidth - 2;
    this.scrollToIndex(automatic && atEnd ? 0 : this.firstVisible() + direction, automatic);
  }

  scrollToIndex(index, automatic, navigationType = 'button') {
    // Math.min/Math.max bornent l'indice pour qu'il désigne toujours une carte.
    // Le navigateur borne à son tour la position réelle à la fin du contenu.
    const item = this.books.children[Math.max(0, Math.min(this.results.length - 1, index))];
    if (!item) return;
    if (automatic) this.pendingNavigation = null;
    else this.manualInteraction(navigationType);
    clearTimeout(this.autoplayTimer);
    clearTimeout(this.scrollTimer);
    this.scrollOrigin = automatic ? 'autoplay' : 'manual';
    const left = item.offsetLeft - this.books.firstElementChild.offsetLeft;
    this.books.scrollTo({ left, behavior: this.motion.matches || automatic ? 'instant' : 'smooth' });
    this.updateNavigation();
    // Couvre aussi le cas où le navigateur ne produit aucun scroll (extrémité).
    this.scrollTimer = setTimeout(() => this.settleScroll(), 250);
  }

  scheduleAutoplay() {
    // Une seule minuterie à la fois : annuler d'abord celle qui était prévue.
    // Chaque reprise attend ainsi un délai complet. Contrairement à setInterval,
    // aucun rythme permanent ne continue de tourner pendant une suspension.
    clearTimeout(this.autoplayTimer);
    if (this.autoplayButton) {
      this.autoplayButton.textContent = this.motion?.matches ? 'Défilement automatique désactivé (mouvements réduits)'
        : this.paused ? 'Reprendre le défilement' : 'Mettre en pause le défilement';
      this.autoplayButton.disabled = Boolean(this.motion?.matches) || (this.results?.length || 0) < 2;
    }
    if (!this.isConnected || this.mode !== 'carousel' || !this.hasAttribute('autoplay') || this.motion?.matches
        // Chacune de ces conditions suffit à empêcher le prochain mouvement.
        || this.paused || this.collapsed || this.hovering || this.touching || this.shadowRoot.activeElement
        || document.hidden || this.loading || this.scrollOrigin || !this.books?.isConnected
        || this.books.scrollWidth <= this.books.clientWidth + 1) return;
    const delay = Math.min(integer(this.getAttribute('autoplay-delay'), 5000), 2147483647);
    // La borne supérieure correspond à la limite courante des délais setTimeout.
    this.autoplayTimer = setTimeout(() => this.navigate(1, true), delay);
  }

  renderPagination(container, position) {
    // La même fonction remplit les barres du haut et du bas à partir de this.page.
    // position les distingue pour rendre le focus à celle effectivement utilisée.
    container.replaceChildren();
    container.hidden = !this.pageSize || this.totalPages <= 1;
    if (container.hidden) return;
    const button = (label, page, kind, disabled = false) => {
      const node = element('button', { type: 'button', part: `pagination-button pagination-${kind}${kind === 'number' && page === this.page ? ' pagination-current' : ''}`,
        'data-focus': `pagination-${position}-${kind}-${kind === 'number' ? page : ''}`,
        'aria-current': kind === 'number' && page === this.page ? 'page' : null,
        'aria-label': kind === 'number' ? `Page ${page}` : label }, label);
      node.disabled = disabled;
      node.addEventListener('click', () => {
        if (page === this.page) return;
        const fromPage = this.page;
        this.page = page;
        this.updateResults();
        const target = [...container.querySelectorAll('button')].find(button => button.dataset.focus === node.dataset.focus && !button.disabled)
          // Si « Suivant » vient de devenir désactivé, le numéro courant constitue
          // une cible de focus utilisable dans la même barre de pagination.
          || container.querySelector('[aria-current="page"]');
        target?.focus({ preventScroll: true });
        this.live.textContent = `Page ${this.page} sur ${this.totalPages}`;
        this.emitInteraction('pagination_change', { from_page: fromPage, page: this.page,
          page_size: this.pageSize, navigation_type: kind === 'number' ? 'page_number' : kind,
          pagination_position: position });
      });
      container.append(node);
    };
    button('Précédent', this.page - 1, 'previous', this.page === 1);
    const numbers = new Set([1, this.totalPages]);
    // Set supprime les doublons (notamment page 1 = dernière page). On montre
    // les extrémités et les pages voisines plutôt que des centaines de boutons.
    for (let page = Math.max(1, this.page - 2); page <= Math.min(this.totalPages, this.page + 2); page++) numbers.add(page);
    let previous = 0;
    for (const page of [...numbers].sort((a, b) => a - b)) {
      if (previous && page - previous > 1) container.append(element('span', { 'aria-hidden': 'true' }, '…'));
      button(String(page), page, 'number');
      previous = page;
    }
    button('Suivant', this.page + 1, 'next', this.page === this.totalPages);
    container.append(element('span', { class: 'summary', part: 'pagination-summary' }, `Page ${this.page} sur ${this.totalPages}`));
    this.live.part.add('pagination-status');
  }

  book(doc, position) {
    // Produit une carte ou une ligne, toujours entièrement contenue dans un vrai lien.
    // aria-posinset/aria-setsize exposent sa position globale aux lecteurs d'écran.
    const item = element('li', { class: 'book', part: 'book', role: 'listitem', 'aria-posinset': position, 'aria-setsize': this.results.length });
    const link = element('a', { class: 'book-link', part: 'book-link', target: '_blank', rel: 'noopener noreferrer',
      href: url(doc.record_url, this.dataUrl) || PRIMO + encodeURIComponent(text(doc.biblionumber)) });
    const title = [text(doc.title), text(doc.subtitle)].filter(Boolean).join(' : ') || 'Sans titre';
    // position est fournie après tri, filtre et limite, avant découpage en pages.
    this.trackLink(link, 'document_click', { biblionumber: text(doc.biblionumber), position, page: this.page });
    const compact = this.mode === 'compact';
    const layout = element('div', { class: compact ? 'compact-row' : 'book-layout', part: compact ? 'book-layout compact-row' : 'book-layout' });
    const content = compact ? layout : element('div', { class: 'content', part: 'content' });
    if (compact) layout.part.add('content');
    if (!compact) {
      // Le mode compact ne crée pas de zone de couverture, même vide.
      // Une image décorative a alt="" pour ne pas répéter le titre déjà lu dans le lien.
      const cover = element('div', { class: 'cover', part: 'cover', 'aria-hidden': 'true' });
      const placeholder = () => cover.replaceChildren(element('span', { class: 'placeholder', part: 'cover-placeholder' }, 'Couverture indisponible'));
      const imageUrl = url(doc.local_cover_url, this.dataUrl);
      // On ne lit jamais cover_url ici : cette URL distante est réservée au script Python.
      if (imageUrl) {
        const image = element('img', { src: imageUrl, alt: '', loading: 'lazy', decoding: 'async', part: 'cover-image' });
        image.addEventListener('error', placeholder, { once: true });
        cover.append(image);
      } else placeholder();
      layout.append(cover, content);
    }
    const append = (tag, part, full, maximum = Infinity, keep = maximum) => {
      // Si le texte dépasse la limite, afficher une version courte masquée aux
      // lecteurs d'écran, accompagnée du texte complet masqué seulement visuellement.
      // En compact, conserver une seule version complète : le CSS gère l'ellipsis.
      if (!full) return;
      const node = element(tag, { class: part, part });
      if (full.length > maximum && !compact) {
        node.append(element('span', { 'aria-hidden': 'true' }, full.slice(0, keep) + '...'), element('span', { class: 'sr-only' }, full));
      } else node.textContent = full;
      content.append(node);
    };
    append('span', 'document-type', text(doc.document_type) + (compact && doc.document_type ? ' |' : ''));
    append(compact ? 'span' : 'h3', 'title', title, this.mode === 'list' ? 240 : 140);
    append('span', 'authors', (compact && doc.authors ? '— ' : '') + text(doc.authors), this.mode === 'list' ? 200 : 60, 61);
    const publisher = text(doc.publisher);
    const maximum = this.mode === 'list' ? 200 : 60;
    const meta = element('span', { class: 'meta', part: 'meta' });
    const fullMeta = [publisher, text(doc.date)].filter(Boolean).join(', ');
    if (fullMeta) {
      if (!compact && publisher.length > maximum) {
        meta.append(element('span', { 'aria-hidden': 'true' }, [publisher.slice(0, 61) + '...', text(doc.date)].filter(Boolean).join(', ')), element('span', { class: 'sr-only' }, fullMeta));
      } else meta.textContent = (compact ? '— ' : '') + fullMeta;
      content.append(meta);
    }
    link.append(layout, element('span', { class: 'sr-only' }, ' (nouvel onglet)'));
    item.append(link);
    return item;
  }

  skip() {
    // tabindex=-1 permet de recevoir le focus par JavaScript sans ajouter un arrêt
    // à chaque tabulation. La cible est dans la page hôte, juste après le widget :
    // la prochaine touche Tab poursuit donc la lecture hors de la sélection.
    if (!this.skipTarget?.isConnected) {
      this.skipTarget = element('span', { tabindex: '-1', role: 'group', 'aria-label': 'Fin de la sélection de documents' });
      this.after(this.skipTarget);
    }
    this.skipTarget.focus();
  }
}

// Enregistrer le nom de la balise déclenche sa prise en charge par le navigateur.
// Le garde-fou évite une erreur si une autre copie du module l'a déjà enregistrée.
if (!customElements.get('koha-list-widget')) customElements.define('koha-list-widget', KohaListWidget);
