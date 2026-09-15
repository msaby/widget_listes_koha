"""Récupération des couvertures, indépendante des exports bibliographiques."""

# Ce module s'exécute côté Python, jamais dans le navigateur.
# CoverManager garde les réglages et les résultats d'une exécution. Pour chaque
# notice, resolve() choisit une image : cache local → URL CSV prioritaire si
# nécessaire → fournisseurs. populate() applique cette logique à tous les documents.
# « Cache positif » = image récupérée + provenance ; « cache négatif » = absence
# explicite chez un fournisseur, permettant d'éviter de refaire la même requête.

from collections import Counter
from datetime import datetime, timezone
from io import BytesIO
from http.client import HTTPException
import json
import logging
import math
import os
from pathlib import Path
import re
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

LOGGER = logging.getLogger(__name__)
SOURCES = ("google", "bnf", "amazon")
BNF_ENDPOINT = "https://openapi.bnf.fr/couverture/image/image/recupererImage"
MAX_BYTES = 12 * 1024 * 1024


class CoverError(Exception):
    """Erreur retentable, ne contenant ni URL privée ni clé d'API."""


class MissingCover(CoverError):
    """Absence explicite pouvant être mémorisée pour un fournisseur."""


class ProviderBlocked(CoverError):
    """Authentification, protection ou quota : suspendre ce fournisseur."""


def identifiers(document, *, prefer_ean=False):
    """Extraire un identifiant valide, avec une priorité configurable."""
    fields = ("ean", "isbn") if prefer_ean else ("isbn", "ean")
    for field in fields:
        # On recherche dans l'ISBN avant l'EAN. Le return du premier identifiant
        # valide empêche d'utiliser un EAN différent quand l'ISBN convient déjà.
        text = (document.get(field) or "").replace("-", "")
        # re.search renvoie la première séquence correspondante. Le « or » n'essaie
        # les 10 caractères que si aucune séquence de 13 chiffres n'a été trouvée.
        match = re.search(r"[0-9]{13}", text) or re.search(r"[0-9]{9}[0-9Xx]", text)
        if match:
            value = match.group().upper()
            if len(value) == 13:
                # Clé EAN-13 : la somme pondérée des chiffres (poids 1, 3, 1, 3…)
                # doit être un multiple de 10. % calcule le reste d'une division.
                valid = sum(int(c) * (1 if i % 2 == 0 else 3)
                            for i, c in enumerate(value)) % 10 == 0
                if field == "isbn":
                    valid = valid and value.startswith(("978", "979"))
            else:
                # Clé ISBN-10 : poids de 10 à 1 et reste nul modulo 11 ; X vaut 10.
                valid = sum((10 if c == "X" else int(c)) * (10 - i)
                            for i, c in enumerate(value)) % 11 == 0
            if valid:
                return [isbn13(value) if prefer_ean and len(value) == 10 else value]
    return []


def isbn13(value):
    # Sert à comparer les deux écritures d'un même ISBN dans les réponses Google.
    # On enlève la clé ISBN-10, ajoute 978 et calcule une nouvelle clé EAN-13.
    # Cela ne change ni le champ bibliographique ni le format de la requête Google.
    if len(value) == 13:
        return value
    base = "978" + value[:9]
    return base + str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(base))) % 10)


def isbn10(value):
    # Amazon attend 10 caractères, même lorsque l'identifiant provient du champ EAN.
    # Seul le préfixe 978 permet cette conversion ; None signifie « ne pas envoyer ».
    if len(value) == 10:
        return value
    if not value.startswith("978"):
        return None
    base = value[3:12]
    # [3:12] retire 978 et l'ancienne clé. La nouvelle clé complète les 9 chiffres
    # restants pour obtenir un total divisible par 11 ; 10 s'écrit X.
    check = (-sum(int(c) * (10 - i) for i, c in enumerate(base))) % 11
    return base + ("X" if check == 10 else str(check))


def jpeg_bytes(data, max_size=None):
    """Décoder réellement l'image et rejeter HTML, images cassées et pixels vides."""
    try:
        with warnings.catch_warnings():
            # Une image très grande après décompression peut saturer la mémoire.
            # On traite l'avertissement de Pillow comme une erreur récupérable.
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                # BytesIO présente les octets téléchargés comme un fichier en mémoire.
                # image.load() force le décodage : une extension .jpg seule ne prouve rien.
                if min(image.size) < 32:
                    raise MissingCover("image trop petite (placeholder possible)")
                image.load()
                rgba = ImageOps.exif_transpose(image).convert("RGBA")
                if max_size and (rgba.width > max_size[0] or rgba.height > max_size[1]):
                    rgba.thumbnail(max_size, Image.Resampling.LANCZOS)
                # JPEG ne gère pas la transparence : poser l'image RGBA (couleurs +
                # canal alpha) sur du blanc évite un fond noir. EXIF donne l'orientation.
                background = Image.new("RGB", rgba.size, "white")
                background.paste(rgba, mask=rgba.getchannel("A"))
                output = BytesIO()
                background.save(output, format="JPEG", quality=90)
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as exc:
        raise CoverError("réponse non exploitable comme image") from exc


def atomic_write(path, data):
    # Écrit des octets (image ou JSON encodé en UTF-8) dans un fichier temporaire
    # du même dossier, puis remplace le fichier final seulement après succès.
    # fdopen transforme le descripteur numérique de mkstemp en objet fichier.
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class CoverManager:
    # Une instance correspond à un lancement : blocked n'est pas persistant,
    # tandis que cache est relu depuis le disque puis sauvegardé pour demain.
    def __init__(self, directory, sources=SOURCES, *, timeout=10, delay=0.3,
                 google_api_key=None, retry_missing=False):
        if any(source not in SOURCES for source in sources):
            raise ValueError("Fournisseur de couvertures inconnu")
        if not math.isfinite(timeout) or timeout <= 0 or not math.isfinite(delay) or delay < 0:
            raise ValueError("Délai réseau positif et intervalle non négatif requis")
        self.directory = Path(directory)
        self.sources = tuple(dict.fromkeys(sources))
        # dict.fromkeys supprime les doublons sans changer l'ordre demandé.
        # Counter initialise implicitement à zéro les compteurs utilisés avec += 1.
        self.timeout = timeout
        self.delay = delay
        self.google_api_key = google_api_key
        self.last_request = None
        self.blocked = set()
        self.stats = Counter()
        self.cache_path = self.directory / ".cover-cache.json"
        self.cache = {"covers": {}, "negative": {}}
        # Un premier lancement n'a pas encore de cache. Un cache illisible est
        # également toléré : les fichiers d'images seront vérifiés individuellement.
        try:
            cached = json.loads(self.cache_path.read_text(encoding="utf-8"))
            for section in self.cache:
                if isinstance(cached.get(section), dict):
                    self.cache[section] = cached[section]
        except FileNotFoundError:
            pass
        except (OSError, ValueError, AttributeError):
            LOGGER.warning("Cache de couvertures illisible : reconstruction des métadonnées")
        self.cache["covers"] = {
            key: value for key, value in self.cache["covers"].items()
            if isinstance(value, dict)
        }
        # Éliminer aussi les éventuels anciens caches négatifs d'URL CSV.
        self.cache["negative"] = {} if retry_missing else {
            key: value for key, value in self.cache["negative"].items()
            if key.split(":", 1)[0] in SOURCES
        }

    def fetch(self, url):
        # Point d'entrée unique des appels HTTP. Les tests remplacent cette méthode
        # par un Mock pour simuler les fournisseurs sans accès Internet.
        if urlsplit(url).scheme not in ("http", "https") or not urlsplit(url).hostname:
            raise CoverError("URL HTTP(S) requise")
        if self.last_request is not None:
            # monotonic mesure une durée sans être affecté par une correction de
            # l'horloge système. Le délai minimal évite d'enchaîner les requêtes en rafale.
            time.sleep(max(0, self.delay - (time.monotonic() - self.last_request)))
        self.last_request = time.monotonic()
        self.stats["requests"] += 1
        try:
            request = Request(url, headers={"User-Agent": "koha-list-widget/1.0", "Accept": "image/*, application/json"})
            with urlopen(request, timeout=self.timeout) as response:
                data = response.read(MAX_BYTES + 1)
                # Un octet de plus permet de détecter un dépassement, sans lire
                # toute une réponse potentiellement énorme.
                if len(data) > MAX_BYTES:
                    raise CoverError("réponse supérieure à 12 Mio")
                return data
        except HTTPError as exc:
            # Classer les erreurs décide du comportement de resolve() : absence
            # mémorisable, fournisseur bloqué pour ce lancement, ou panne retentable.
            # On ne reprend pas l'URL de l'exception, qui pourrait contenir une clé.
            code = exc.code
            exc.close()
            if code in (404, 410):
                raise MissingCover(f"HTTP {code}") from None
            if code in (401, 403, 429):
                raise ProviderBlocked(f"HTTP {code} : accès refusé ou quota") from None
            raise CoverError(f"HTTP {code}, erreur retentable") from None
        except (URLError, TimeoutError, OSError, HTTPException):
            raise CoverError("connexion impossible ou délai réseau dépassé") from None

    def provider_image(self, source, ids):
        # Cette méthode retourne des octets JPEG validés ; elle n'écrit pas le cache.
        # La BnF accepte aussi les EAN non livres. Google et Amazon sont ici limités
        # aux identifiants de livres ; seul Amazon reçoit une conversion en ISBN-10.
        candidates = ([isbn13(value) if len(value) == 10 else value for value in ids]
                  if source == "bnf" else
                  [value for value in ids if len(value) == 10 or value.startswith(("978", "979"))])
        if source == "amazon":
            # map applique isbn10 à chaque candidat, filter enlève les None,
            # puis dict.fromkeys élimine d'éventuels doublons après conversion.
            candidates = list(dict.fromkeys(filter(None, map(isbn10, candidates))))
        if not candidates:
            raise MissingCover("aucun identifiant compatible")
        transient = False
        last_error = ""
        last_missing = "aucune couverture exploitable"
        for value in candidates:
            try:
                if source == "google":
                    # Google nécessite deux étapes : trouver une notice par ISBN,
                    # puis télécharger l'une des URL d'image de cette notice.
                    query = {"q": "isbn:" + value, "maxResults": 10}
                    if self.google_api_key:
                        query["key"] = self.google_api_key
                    payload = json.loads(self.fetch("https://www.googleapis.com/books/v1/volumes?" + urlencode(query)))
                    if not isinstance(payload, dict) or "error" in payload:
                        raise CoverError("réponse Google invalide")
                    urls = []
                    for item in payload.get("items", []):
                        info = item.get("volumeInfo", {})
                        returned = [identifier
                                    for entry in info.get("industryIdentifiers", [])
                                    for identifier in identifiers({"isbn": entry.get("identifier", "")})]
                        if isbn13(value) not in [isbn13(identifier) for identifier in returned]:
                            # Une recherche peut renvoyer une autre édition : ne pas
                            # prendre sa couverture si ses identifiants ne correspondent pas.
                            continue
                        links = info.get("imageLinks", {})
                        url = next((links[key] for key in ("large", "medium", "small", "thumbnail", "smallThumbnail") if links.get(key)), None)
                        if url:
                            urls.append(url.replace("http://", "https://", 1))
                    if not urls:
                        raise MissingCover("aucune couverture Google correspondant à l'ISBN")
                elif source == "bnf":
                    # La BnF renvoie directement une image. urlencode protège les
                    # valeurs des paramètres et assemble la partie située après le ?.
                    query = {"EAN": value, "couverture": "1", "taille": "originale",
                             "largeur": 500, "hauteur": 500}
                    urls = [BNF_ENDPOINT + "?" + urlencode(query)]
                else:
                    urls = [f"https://images-na.ssl-images-amazon.com/images/P/{value}.01.LZZZZZZZ.jpg"]
                for url in urls:
                    try:
                        limit = (500, 500) if source in ("google", "amazon") else None
                        return jpeg_bytes(self.fetch(url), max_size=limit)
                    except MissingCover as exc:
                        last_missing = str(exc)
                        continue
                    except ProviderBlocked:
                        raise
                    except CoverError as exc:
                        transient = True
                        last_error = str(exc)
                # Essayer les autres ISBN/EAN lorsqu'une image manque.
            except MissingCover as exc:
                last_missing = str(exc)
                continue
            except ProviderBlocked:
                raise
            except (CoverError, ValueError, TypeError, AttributeError) as exc:
                transient = True
                last_error = str(exc) if isinstance(exc, CoverError) else "réponse fournisseur mal formée"
        if transient:
            # Une panne parmi les essais empêche de conclure à une absence certaine.
            # C'est notamment important pour les HTTP 500 actuellement renvoyés par la BnF.
            raise CoverError(last_error or "échec retentable de récupération ou de décodage")
        raise MissingCover(last_missing)

    def resolve(self, document):
        # Retour : chemin Path d'une image utilisable, ou None si tout a échoué.
        # Le nom local dépend de la notice Koha, pas de l'ISBN : il reste stable.
        number = document["biblionumber"]
        if not re.fullmatch(r"[0-9]+", number):
            raise ValueError("Identifiant de notice invalide")
        path = self.directory / f"{number}.jpg"
        url = document.get("cover_url", "").strip()
        metadata = self.cache["covers"].get(number, {})
        existing = False
        if path.is_file():
            try:
                jpeg_bytes(path.read_bytes())
                existing = True
            except (CoverError, OSError):
                LOGGER.warning("Notice %s : couverture locale invalide", number)
        if existing and (not url or (metadata.get("source") == "cover_url" and metadata.get("source_url") == url)):
            # Une URL disparue ne supprime pas une image déjà acquise. En revanche,
            # une URL nouvelle doit être essayée même lorsqu'un JPEG existe déjà.
            self.stats["reused"] += 1
            return path
        if url:
            try:
                data = jpeg_bytes(self.fetch(url))
                return self.store(number, path, data, "cover_url", url)
            except (CoverError, OSError, ValueError) as exc:
                self.stats["cover_url_failures"] += 1
                reason = str(exc) if isinstance(exc, CoverError) else type(exc).__name__
                LOGGER.warning("Notice %s : échec cover_url (%s) ; essai des fournisseurs", number, reason)
        ids = identifiers(document)
        # Les échecs de l'URL CSV n'ont ajouté aucune entrée négative : cette URL
        # sera donc retentée lors d'un traitement ultérieur, avant les fournisseurs.
        for source in self.sources:
            if source in self.blocked:
                continue
            source_ids = identifiers(document, prefer_ean=True) if source == "bnf" else ids
            key = f"{source}:{number}"
            negative = self.cache["negative"].get(key)
            # Les nouvelles entrées négatives contiennent les identifiants essayés.
            # Si ceux-ci changent, il faut réinterroger le fournisseur. True est
            # l'ancien format de cache, conservé pour compatibilité.
            if negative is True or (isinstance(negative, dict) and negative.get("identifiers") == source_ids):
                self.stats["negative_hits"] += 1
                continue
            try:
                data = self.provider_image(source, source_ids)
                return self.store(number, path, data, source)
            except MissingCover as exc:
                self.cache["negative"][key] = {"identifiers": source_ids}
                self.stats[f"{source}_missing"] += 1
                LOGGER.info("Notice %s : %s : %s", number, source, exc)
            except ProviderBlocked as exc:
                self.blocked.add(source)
                self.stats[f"{source}_blocked"] += 1
                LOGGER.warning("%s : %s ; fournisseur suspendu jusqu'au prochain lancement", source, exc)
            except (CoverError, OSError, ValueError) as exc:
                self.stats[f"{source}_errors"] += 1
                LOGGER.warning("Notice %s : %s : %s", number, source, exc)
        if existing:
            # Si la nouvelle source est en panne, mieux vaut garder l'ancienne
            # image valide et sa provenance que remplacer le JPEG par une erreur.
            self.stats["reused"] += 1
            return path
        self.stats["missing"] += 1
        return None

    def store(self, number, path, data, source, source_url=None):
        # Enregistrer une image positive comporte deux fichiers : JPEG et cache.
        # Ils ne forment pas une transaction unique ; l'ordre ci-dessous prépare
        # une reprise prudente si le processus s'arrête entre les deux écritures.
        # Retirer l'ancienne provenance avant le remplacement : en cas d'arrêt
        # entre image et cache, la prochaine conversion retentera l'URL CSV.
        previous = self.cache["covers"].pop(number, None)
        try:
            atomic_write(self.cache_path, json.dumps(self.cache, ensure_ascii=False, indent=2).encode("utf-8"))
            atomic_write(path, data)
        except OSError:
            if previous is not None:
                self.cache["covers"][number] = previous
            raise
        metadata = {"source": source, "retrieved_at": datetime.now(timezone.utc).isoformat()}
        if source_url:
            metadata["source_url"] = source_url
        self.cache["covers"][number] = metadata
        self.cache["negative"].pop(f"{source}:{number}", None)
        self.save()
        self.stats["downloaded"] += 1
        self.stats[f"{source}_downloaded"] += 1
        return path

    def save(self):
        # Une panne d'écriture du cache est signalée, mais ne doit pas empêcher
        # la génération des données bibliographiques par le script appelant.
        try:
            atomic_write(self.cache_path, json.dumps(self.cache, ensure_ascii=False, indent=2).encode("utf-8"))
        except OSError:
            LOGGER.warning("Impossible d'enregistrer le cache de couvertures")
            self.stats["cache_errors"] += 1

    def populate(self, documents, json_path):
        # Plusieurs listes Koha peuvent contenir la même notice. On la traite
        # une seule fois, puis on recopie son URL locale dans toutes ses occurrences.
        grouped = {}
        for document in documents:
            grouped.setdefault(document["biblionumber"], []).append(document)
        for number, copies in grouped.items():
            selected = next((doc for doc in copies if doc.get("cover_url", "").strip()), copies[0])
            if len({doc.get("cover_url", "").strip() for doc in copies if doc.get("cover_url", "").strip()}) > 1:
                LOGGER.warning("Notice %s : cover_url contradictoires ; première URL conservée", number)
            try:
                path = self.resolve(selected)
                local_url = quote(Path(os.path.relpath(path.resolve(), Path(json_path).resolve().parent)).as_posix(), safe="/.") if path else ""
                # L'URL est relative au JSON, pas à la page web qui affichera le widget.
                # Un chemin Windows devient ainsi une URL comme ../covers/272037.jpg.
            except Exception as exc:
                # Une notice ou un fichier de cache ne doit jamais bloquer JSON/XLSX.
                LOGGER.warning("Notice %s : traitement couverture interrompu (%s)", number, type(exc).__name__)
                self.stats["errors"] += 1
                local_url = ""
            for document in copies:
                document["local_cover_url"] = local_url
        self.save()
        LOGGER.info("Couvertures (%d notices uniques) : %s", len(grouped), dict(self.stats))
        return dict(self.stats)
