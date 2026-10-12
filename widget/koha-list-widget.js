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
// Le module et dist/ sont des dossiers voisins, même sous un préfixe de site.
const DATA_URL = new URL('../dist/prepareddata.json', import.meta.url).href;
const LIBRARIES_URL = new URL('./libraries.json', import.meta.url).href;
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const normalized = value => text(value).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').trim();
// NFD sépare les accents de leurs lettres ; \p{M} enlève ensuite ces marques.
// integer() évite les nombres négatifs, décimaux ou trop grands pour être exacts en JS.
const integer = (value, fallback = null) => /^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const titleKey = value => normalized(value).replace(/^(?:(?:le|la|les|un|une|des|the|a|an)\s+|l['’]\s*)/u, '');
const publicationYear = value => Number(text(value).match(/(?:^|\D)(\d{4})(?:\D|$)/)?.[1]) || null;
const PUBLISHER_WORDS = new Set(['edition', 'editions', 'editeur', 'editeurs', 'librairie', 'libr', 'publisher', 'publishers', 'publishing']);
const displayPublisher = value => text(value).split('|', 1)[0]
  .replace(/[\p{L}\p{M}]+\.?/gu, word => PUBLISHER_WORDS.has(normalized(word.replace(/\.$/, '')))
    || (word.endsWith('.') && normalized(word.slice(0, -1)) === 'ed') ? '' : word)
  .replace(/\s+/g, ' ').replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '').trim();
function displayAuthors(value) {
  const authors = text(value).replace(/[\[\]]/g, '').split(/[,;|]|\s+(?:et|and|avec)\s+/iu).map(part => part.trim()).filter(Boolean);
  if (!authors.length) return '';
  const first = authors[0].replace(/^(?:(?:sous\s+la\s+dir\S*\s+(?:d[eéèêë]\p{M}*\s+|d['’]\s*)|dir\S*\s+par\s+|[eéèêë]\p{M}*d\S*\s+par\s+|par\s+|textes?\s+d[eéèêë]\p{M}*\s+|d[eéèêë]\p{M}*\s+))+/iu, '').trim();
  return first + (authors.length > 1 ? '...' : '');
}
function url(value, base) {
  // Résoudre ../covers/a.jpg nécessite une URL de départ (base). On n'accepte
  // que HTTP(S), jamais un lien javascript: provenant des données reçues.
  if (!text(value).trim()) return '';
  try { const result = new URL(value, base); return /^https?:$/.test(result.protocol) ? result.href : ''; }
  catch { return ''; }
}
const XLSX_HEADERS = ['Lien catalogue', 'Type de document', 'Titre', 'Auteur', 'ISBN', 'EAN',
  'Date', 'Éditeur', 'Pages', 'Résumé', 'Exemplaires', 'Liste'];
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xml = value => text(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function zipFiles(files) {
  // Un XLSX est une archive ZIP. Les entrées non compressées restent lisibles
  // par Excel et évitent une dépendance ou un service externe dans la page.
  const encoder = new TextEncoder();
  const chunks = [], directory = [];
  let offset = 0;
  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name), body = encoder.encode(content);
    let crc = 0xffffffff;
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new Uint8Array(30), localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, body.length, true);
    localView.setUint16(26, nameBytes.length, true);
    chunks.push(local, nameBytes, body);

    const entry = new Uint8Array(46), view = new DataView(entry.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, body.length, true);
    view.setUint32(24, body.length, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint32(42, offset, true);
    directory.push(entry, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, Object.keys(files).length, true);
  endView.setUint16(10, Object.keys(files).length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], { type: XLSX_TYPE });
}

function filteredWorkbook(documents, dataUrl) {
  const cell = (reference, value, style = 0) => `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  const rows = [`<row r="1">${XLSX_HEADERS.map((value, index) => cell(`${String.fromCharCode(65 + index)}1`, value, 1)).join('')}</row>`];
  const hyperlinks = [], relations = [];
  for (const [index, doc] of documents.entries()) {
    const number = index + 2;
    const holdings = Array.isArray(doc.holdings) ? doc.holdings.map(item => {
      if (!item || typeof item !== 'object') return '';
      return [text(item.library), text(item.location), item.callnumber ? `cote ${text(item.callnumber)}` : '']
        .filter(Boolean).join(' — ');
    }).filter(Boolean).join('\n') : '';
    const values = ['Voir dans le catalogue', doc.document_type,
      [text(doc.title), text(doc.subtitle)].filter(Boolean).join(' : '), doc.authors,
      doc.isbn, doc.ean, doc.date, doc.publisher, doc.pages, doc.abstract, holdings, doc.list];
    rows.push(`<row r="${number}">${values.map((value, column) => cell(`${String.fromCharCode(65 + column)}${number}`, value, column === 0 ? 2 : 0)).join('')}</row>`);
    const target = url(doc.record_url, dataUrl) || PRIMO + encodeURIComponent(text(doc.biblionumber));
    hyperlinks.push(`<hyperlink ref="A${number}" r:id="rId${index + 1}"/>`);
    relations.push(`<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xml(target)}" TargetMode="External"/>`);
  }
  const widths = [25, 20, 55, 35, 22, 22, 12, 30, 22, 70, 48, 30];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:L${documents.length + 1}"/><hyperlinks>${hyperlinks.join('')}</hyperlinks></worksheet>`;
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Documents" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font/><font><b/><color rgb="FFFFFFFF"/></font><font><u/><color rgb="FF0563C1"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF28556B"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="1" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="2" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': sheet,
    'xl/worksheets/_rels/sheet1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relations.join('')}</Relationships>`,
  };
  return zipFiles(files);
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
.controls,.pagination { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin:.75rem 0; }
button,input { font:inherit; color:inherit; }
button { border:1px solid var(--koha-border,#bac5cc); border-radius:.35rem; padding:.55rem .85rem; background:var(--koha-surface,#fff); min-height:44px; }
button { cursor:pointer; }
button:hover:not(:disabled) { background:var(--koha-hover,#edf3f6); }
.visibility-toggle { border:0; background:transparent; color:var(--koha-accent,#215a73); font-weight:600; }
.visibility-toggle .action-icon { font-size:.7em; }
.visibility-toggle:hover:not(:disabled) { background:var(--koha-hover,#edf3f6); }
.results-controls { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:end; gap:.5rem 1rem; margin:.75rem 0; }
.results-controls .pagination { min-width:0; margin:0; }
.results-controls .export { justify-self:end; }
.carousel-stage { display:grid; grid-template-columns:44px minmax(0,1fr) 44px; gap:4px; align-items:stretch; }
.carousel-stage .books { min-width:0; }
.carousel-chevron { display:flex; align-items:center; justify-content:center; width:44px; min-width:44px; min-height:44px; height:100%; padding:0; border:0; border-radius:0; color:var(--koha-accent,#215a73); background:transparent; opacity:.75; transition:opacity .15s ease; }
.carousel-chevron:hover:not(:disabled), .carousel-chevron:focus-visible { background:transparent; opacity:1; }
.carousel-chevron span { display:block; font-size:2.5rem; line-height:1; transform:scaleY(1.8); }
.export { color:var(--koha-muted,#495b67); font-size:.875em; text-decoration:none; white-space:nowrap; }
.export:hover { color:var(--koha-accent,#215a73); text-decoration:underline; }
.action-icon { display:inline-block; margin-inline-end:.4em; line-height:1; }
.library-filter { display:flex; flex-wrap:wrap; gap:.4rem; margin:0 0 .75rem; }
.library-chip { min-height:24px; padding:.15rem .65rem; font-size:.75rem; line-height:1.4; border:1px solid var(--koha-accent,#215a73); border-radius:999px; background:transparent; color:var(--koha-accent,#215a73); }
.library-chip:hover:not([aria-pressed=true]) { background:var(--koha-hover,#edf3f6); text-decoration:underline; }
.library-chip[aria-pressed=true], .library-chip[aria-pressed=true]:hover:not(:disabled) { background:var(--koha-accent,#215a73); color:white; font-weight:600; }
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
.compact .book-link { border:0; border-bottom:1px solid var(--koha-border,#bac5cc); border-radius:0; padding:.4rem .35rem; }
.compact-row { min-width:0; }
.compact-primary { display:flex; align-items:baseline; gap:.45rem; min-width:0; white-space:nowrap; }
.compact-primary .document-type { flex:0 0 auto; margin:0; font-size:.72rem; letter-spacing:.03em; text-transform:uppercase; color:var(--koha-muted,#495b67); }
.compact-primary .title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:1rem; }
.compact-details { display:block; margin-top:.1rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--koha-muted,#495b67); font-size:.88rem; line-height:1.3; }
.compact-details .authors,.compact-details .meta { display:inline; margin:0; font-size:inherit; color:inherit; }
.compact-details .authors + .meta::before { content:' · '; }
.empty,.message { padding:1rem 0; }
.summary { margin-inline-start:.5rem; color:var(--koha-muted,#495b67); }
.more-results { display:inline-block; margin-top:1rem; color:var(--koha-accent,#215a73); }
.more-results:hover { text-decoration-thickness:2px; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0; }
.skip:not(:focus) { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); padding:0; border:0; }
@media(max-width:600px) {
 .results-controls { grid-template-columns:1fr; }
 .list .book-layout { grid-template-columns:90px minmax(0,1fr); }
 .list .cover { width:90px; height:130px; }
 .content { padding:.75rem; }
}
@media(prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto !important; animation:none !important; transition:none !important; } }
`;

export class KohaListWidget extends HTMLElement {
  // Seuls ces attributs déclenchent attributeChangedCallback quand ils sont modifiés.
  // Un attribut booléen comme searchable est activé par sa présence, même sans valeur.
  static observedAttributes = ['list_id', 'library-filter', 'list', 'display', 'limit', 'paginate', 'sort',
    'searchable', 'show-list-name', 'description', 'visibility', 'autoplay', 'autoplay-delay', 'export', 'analytics-id', 'more-results-url', 'split-by-library'];

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
    this.activeLibrary = null;
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
    if (this.exportObjectUrl) URL.revokeObjectURL(this.exportObjectUrl);
    this.exportObjectUrl = null;
    this.loadVersion++;
    this.clearTimers();
    this.skipTarget?.remove();
  }

  attributeChangedCallback(name, previous, current) {
    // Adapter un attribut ne nécessite pas toujours de télécharger à nouveau le JSON.
    // Un tri ou un mode change le rendu ; list_id redémarre le chargement.
    if (previous === current) return;
    if (name === 'visibility') this.collapsed = current === 'collapsed';
    if (name === 'list_id') { this.query = ''; this.page = 1; this.activeLibrary = null; }
    if (name === 'library-filter' || name === 'split-by-library') { this.page = 1; this.activeLibrary = null; }
    if (['sort', 'limit', 'paginate', 'display'].includes(name)) this.page = 1;
    if (name === 'searchable' && current === null) this.query = '';
    this.queueUpdate(name === 'list_id');
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
    this.dataUrl = DATA_URL;
    // Les liens des images et exports seront résolus depuis l'URL du JSON.
    this.loading = true;
    this.render();
    this.request = new AbortController();
    try {
      // Le mapping des noms est facultatif : toute erreur laisse les codes bruts.
      const names = fetch(LIBRARIES_URL, { signal: this.request.signal })
        .then(reply => reply.ok ? reply.json() : null).catch(() => null);
      const response = await fetch(this.dataUrl, { cache: 'no-store', signal: this.request.signal });
      // no-store demande des données fraîches. fetch ne rejette pas les HTTP 404/500,
      // d'où la vérification explicite de response.ok avant de décoder le JSON.
      if (!response.ok) throw new Error('HTTP');
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.documents) || !payload.lists || typeof payload.lists !== 'object') throw new Error('Format');
      const mapping = await names;
      if (version !== this.loadVersion) return;
      this.libraryNames = mapping && typeof mapping === 'object' && !Array.isArray(mapping) ? mapping : {};
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
    if (this.exportObjectUrl) URL.revokeObjectURL(this.exportObjectUrl);
    this.exportObjectUrl = null;
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
    const documents = this.data?.documents || [];
    this.selection = documents.filter(doc => doc && integer(text(doc.list_id)) === this.listId);
    const libraries = new Set((this.getAttribute('library-filter') || '').split(',')
      .map(value => value.trim().toUpperCase()).filter(Boolean));
    const inLibrary = doc => Array.isArray(doc?.holdings) && doc.holdings.some(item =>
      item && libraries.has(text(item.library).trim().toUpperCase()));
    // Un code absent de tout le JSON laisse la sélection entière visible.
    this.libraryFilterActive = libraries.size > 0 && documents.some(inLibrary);
    if (this.libraryFilterActive) this.selection = this.selection.filter(inLibrary);
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
      this.visibilityButton = element('button', { type: 'button', class: 'visibility-toggle', part: 'visibility-toggle', 'data-focus': 'visibility',
        'aria-expanded': String(!this.collapsed), 'aria-controls': 'collapsible-content' });
      const updateVisibilityLabel = () => this.visibilityButton.replaceChildren(
        element('span', { class: 'action-icon', 'aria-hidden': 'true' }, this.collapsed ? '▶' : '▼'),
        this.collapsed ? 'Afficher la sélection' : 'Replier la sélection');
      updateVisibilityLabel();
      this.visibilityButton.addEventListener('click', () => {
        // aria-expanded annonce l'état ; aria-controls relie le bouton au contenu.
        // Modifier hidden retire aussi les éléments repliés de la navigation clavier.
        this.collapsed = !this.collapsed;
        this.content.hidden = this.collapsed;
        this.visibilityButton.setAttribute('aria-expanded', String(!this.collapsed));
        updateVisibilityLabel();
        this.live.textContent = this.collapsed ? 'Documents masqués.' : 'Documents affichés.';
        this.scheduleAutoplay?.();
      });
      controls.append(this.visibilityButton);
      this.region.append(controls);
    } else this.collapsed = false;
    this.content.hidden = this.collapsed;
    this.region.append(this.content);
    const moreResultsUrl = url(this.getAttribute('more-results-url'), document.baseURI);
    if (moreResultsUrl) {
      this.region.append(element('a', { class: 'more-results', part: 'more-results', href: moreResultsUrl,
        'data-focus': 'more-results' }, 'Voir plus de résultats'));
    }
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
    const resultsControls = element('div', { class: 'results-controls', part: 'results-controls' });
    this.paginationTop = element('nav', { class: 'pagination', part: 'pagination pagination-top', 'aria-label': 'Pagination en haut de la sélection' });
    resultsControls.append(this.paginationTop);
    if (this.getAttribute('export') === 'xlsx' && exportUrl) {
      const filtered = this.libraryFilterActive;
      const href = filtered ? URL.createObjectURL(filteredWorkbook(this.selection, this.dataUrl)) : exportUrl;
      if (filtered) this.exportObjectUrl = href;
      const codes = [...libraries].join('-').replace(/[^A-Z0-9_-]/g, '_').slice(0, 80);
      const filename = filtered ? `liste-${this.listId}-${codes || 'bibliotheques'}.xlsx` : '';
      const link = element('a', { class: 'export', part: 'export', href, download: filename, 'data-focus': 'export' });
      link.append(element('span', { class: 'action-icon', 'aria-hidden': 'true' }, '⤓'),
        filtered ? 'Télécharger la sélection filtrée au format Excel' : 'Télécharger la liste complète au format Excel');
      this.trackLink(link, 'excel_download');
      resultsControls.append(link);
    }
    this.paginationBottom = element('nav', { class: 'pagination', part: 'pagination pagination-bottom', 'aria-label': 'Pagination en bas de la sélection' });
    this.books = element('ul', { class: 'books', part: 'books', role: 'list' });
    this.carouselStage = null;
    if (this.mode === 'carousel') {
      this.carouselStage = element('div', { class: 'carousel-stage', part: 'carousel-stage' });
      this.previousButton = element('button', { type: 'button', class: 'carousel-chevron', part: 'prev', 'data-focus': 'prev', 'aria-label': 'Documents précédents' });
      this.nextButton = element('button', { type: 'button', class: 'carousel-chevron', part: 'next', 'data-focus': 'next', 'aria-label': 'Documents suivants' });
      this.previousButton.append(element('span', { 'aria-hidden': 'true' }, '❮'));
      this.nextButton.append(element('span', { 'aria-hidden': 'true' }, '❯'));
      this.previousButton.addEventListener('click', () => this.navigate(-1));
      this.nextButton.addEventListener('click', () => this.navigate(1));
      this.carouselStage.append(this.previousButton, this.books, this.nextButton);
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
    this.content.append(resultsControls);
    this.libraryFilter = null;
    if (this.hasAttribute('split-by-library')) {
      const label = code => {
        const name = this.libraryNames && Object.hasOwn(this.libraryNames, code) ? text(this.libraryNames[code]?.name).trim() : '';
        return name || code;
      };
      const present = [...new Set(this.selection.flatMap(doc => Array.isArray(doc?.holdings) ? doc.holdings : [])
        .map(item => text(item?.library).trim()).filter(Boolean))];
      // Une valeur vide ou sans aucun code présent dans les données garde toutes les bibliothèques.
      const wanted = new Set((this.getAttribute('split-by-library') || '').split(',')
        .map(value => value.trim().toUpperCase()).filter(Boolean));
      const restricted = present.filter(code => wanted.has(code.toUpperCase()));
      const codes = (restricted.length ? restricted : present).sort((a, b) => COLLATOR.compare(label(a), label(b)));
      if (!codes.includes(this.activeLibrary)) this.activeLibrary = null;
      if (codes.length > (restricted.length ? 0 : 1)) {
        this.libraryFilter = element('div', { class: 'library-filter', part: 'library-filter', role: 'group', 'aria-label': 'Filtrer par bibliothèque' });
        for (const code of [null, ...codes]) {
          const chip = element('button', { type: 'button', class: 'library-chip', part: 'library-chip', 'data-focus': `library-${code ?? 'all'}`,
            'data-library': code ?? '', 'aria-pressed': String(code === this.activeLibrary) }, code ? label(code) : 'Toutes');
          if (code && label(code) !== code) chip.title = code;
          chip.addEventListener('click', () => {
            this.activeLibrary = code;
            this.page = 1;
            for (const other of this.libraryFilter.children) other.setAttribute('aria-pressed', String(other === chip));
            this.updateResults();
            this.live.textContent = `${this.results.length} document${this.results.length === 1 ? '' : 's'}`
              + (code ? ` pour la bibliothèque ${label(code)}.` : ', toutes bibliothèques.');
          });
          this.libraryFilter.append(chip);
        }
        this.content.append(this.libraryFilter);
      }
    }
    this.content.append(this.carouselStage || this.books, this.paginationBottom);
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
    const library = this.libraryFilter ? this.activeLibrary : null;
    this.results = sorted.filter(doc => {
      if (library && !(Array.isArray(doc.holdings) && doc.holdings.some(item => text(item?.library).trim() === library))) return false;
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
    // Les deux directions restent disponibles aux extrémités pour boucler.
    const unavailable = maximum <= 1 || this.results.length < 2;
    this.previousButton.disabled = unavailable;
    this.nextButton.disabled = unavailable;
  }

  manualInteraction(navigationType = 'scroll', direction = null) {
    // Marquer le geste suspend temporairement l'autoplay, sans changer paused.
    // Mémoriser son départ avant le mouvement. Un scroll seul (autoplay,
    // redimensionnement ou script hôte) ne crée jamais cette intention manuelle.
    this.pendingNavigation ||= { start: this.books.scrollLeft, navigationType };
    this.pendingNavigation.navigationType = navigationType;
    this.pendingNavigation.direction = direction;
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
        direction: pending.direction || (this.books.scrollLeft > pending.start ? 'next' : 'previous'),
        first_visible_position: index + 1,
      });
    }
    this.scrollOrigin = null;
    this.scheduleAutoplay();
  }

  navigate(direction, automatic = false) {
    // direction vaut -1 ou +1 ; les boutons et l'autoplay bouclent aux extrémités.
    const atStart = this.books.scrollLeft <= 1;
    const atEnd = this.books.scrollLeft >= this.books.scrollWidth - this.books.clientWidth - 2;
    const index = direction > 0 && atEnd ? 0
      : direction < 0 && atStart ? this.results.length - 1 : this.firstVisible() + direction;
    this.scrollToIndex(index, automatic, 'button', direction > 0 ? 'next' : 'previous');
  }

  scrollToIndex(index, automatic, navigationType = 'button', direction = null) {
    // Math.min/Math.max bornent l'indice pour qu'il désigne toujours une carte.
    // Le navigateur borne à son tour la position réelle à la fin du contenu.
    const item = this.books.children[Math.max(0, Math.min(this.results.length - 1, index))];
    if (!item) return;
    if (automatic) this.pendingNavigation = null;
    else this.manualInteraction(navigationType, direction);
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
      const label = this.motion?.matches ? 'Défilement automatique désactivé (mouvements réduits)'
        : this.paused ? 'Reprendre le défilement' : 'Mettre en pause le défilement';
      this.autoplayButton.replaceChildren(element('span', { class: 'action-icon', 'aria-hidden': 'true' }, this.paused ? '▶' : 'Ⅱ'), label);
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
        const target = [...container.querySelectorAll('button')].find(button => button.dataset.focus === node.dataset.focus)
          || container.querySelector('[aria-current="page"]');
        target?.focus({ preventScroll: true });
        this.live.textContent = `Page ${this.page} sur ${this.totalPages}`;
        this.emitInteraction('pagination_change', { from_page: fromPage, page: this.page,
          page_size: this.pageSize, navigation_type: kind === 'number' ? 'page_number' : kind,
          pagination_position: position });
      });
      container.append(node);
    };
    button('Précédent', this.page === 1 ? this.totalPages : this.page - 1, 'previous');
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
    button('Suivant', this.page === this.totalPages ? 1 : this.page + 1, 'next');
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
    const primary = compact ? element('div', { class: 'compact-primary' }) : null;
    const details = compact ? element('div', { class: 'compact-details' }) : null;
    if (compact) layout.append(primary, details);
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
      (compact ? (part === 'document-type' || part === 'title' ? primary : details) : content).append(node);
    };
    append('span', 'document-type', text(doc.document_type));
    append(compact ? 'span' : 'h3', 'title', title, this.mode === 'list' ? 240 : 140);
    const authors = displayAuthors(doc.authors);
    append('span', 'authors', authors, this.mode === 'list' ? 200 : 60, 61);
    const publisher = displayPublisher(doc.publisher);
    const maximum = this.mode === 'list' ? 200 : 60;
    const meta = element('span', { class: 'meta', part: 'meta' });
    const fullMeta = [publisher, text(doc.date)].filter(Boolean).join(', ');
    if (fullMeta) {
      if (!compact && publisher.length > maximum) {
        meta.append(element('span', { 'aria-hidden': 'true' }, [publisher.slice(0, 61) + '...', text(doc.date)].filter(Boolean).join(', ')), element('span', { class: 'sr-only' }, fullMeta));
      } else meta.textContent = compact ? [publisher, text(doc.date)].filter(Boolean).join(' · ') : fullMeta;
      (compact ? details : content).append(meta);
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
