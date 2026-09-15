# Tests sans réseau de la récupération d'images et des règles de cache.
# Le code réel de décodage et d'écriture est exécuté, mais Mock remplace les
# fournisseurs. On peut ainsi reproduire une panne, un quota ou une URL modifiée
# sans dépendre de la disponibilité des services le jour du test.
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

from PIL import Image

from scripts.covers import (
    CoverError, CoverManager, MissingCover, ProviderBlocked,
    identifiers, isbn10, isbn13, jpeg_bytes,
)
from scripts.csv_to_json import convert, FIELDS


def image_bytes(color="blue", size=(100, 160)):
    # Fabriquer une petite image en mémoire évite de versionner des fichiers binaires.
    # Changer sa couleur permet aussi de distinguer une ancienne couverture d'une nouvelle.
    stream = BytesIO()
    Image.new("RGBA", size, color).save(stream, "PNG")
    return stream.getvalue()


class CoverTests(unittest.TestCase):
    def setUp(self):
        # Dossier neuf et document de référence pour chaque scénario. Les PNG servent
        # de réponses simulées ; le JPEG permet de vérifier la conversion locale réelle.
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.directory = self.root / "covers"
        self.document = {"biblionumber": "272037", "isbn": "978-2-7654-0977-9", "ean": "9782765409779", "cover_url": ""}
        self.png = image_bytes()
        self.jpg = jpeg_bytes(self.png)

    def manager(self, sources=("google", "bnf", "amazon"), **kwargs):
        # **kwargs transmet des options nommées supplémentaires, comme retry_missing.
        # delay=0 accélère les tests : les appels réseau sont simulés, pas envoyés.
        return CoverManager(self.directory, sources, delay=0, **kwargs)

    def seed(self, metadata, data=None):
        # Préparer le disque comme si un traitement avait déjà eu lieu hier.
        # Ce point de départ sert aux tests de réutilisation et de remplacement du cache.
        self.directory.mkdir(exist_ok=True)
        path = self.directory / "272037.jpg"
        path.write_bytes(self.jpg if data is None else data)
        (self.directory / ".cover-cache.json").write_text(json.dumps({
            "covers": {"272037": metadata}, "negative": {},
        }))
        return path

    def test_explicit_url_has_priority_and_stores_provenance(self):
        # return_value fixe la réponse du faux téléchargement. assert_not_called
        # vérifie que les fournisseurs ne sont même pas consultés lorsque l'URL CSV réussit.
        self.document["cover_url"] = "https://example.org/cover.png"
        manager = self.manager()
        manager.fetch = Mock(return_value=self.png)
        manager.provider_image = Mock()
        path = manager.resolve(self.document)
        manager.provider_image.assert_not_called()
        with Image.open(path) as image:
            self.assertEqual(image.format, "JPEG")
        cache = json.loads(manager.cache_path.read_text())
        self.assertEqual(cache["covers"]["272037"]["source_url"], self.document["cover_url"])
        self.assertEqual(cache["covers"]["272037"]["source"], "cover_url")
        self.assertIn("retrieved_at", cache["covers"]["272037"])

    def test_same_url_and_removed_url_reuse_local_image(self):
        # Toute tentative réseau ferait échouer le test : on exige une réutilisation locale.
        url = "https://example.org/a.jpg"
        expected = self.seed({"source": "cover_url", "source_url": url})
        for current in (url, ""):
            manager = self.manager()
            manager.fetch = Mock(side_effect=AssertionError("réseau inattendu"))
            self.document["cover_url"] = current
            self.assertEqual(manager.resolve(self.document), expected)
            manager.fetch.assert_not_called()

    def test_changed_url_replaces_existing_image(self):
        path = self.seed({"source": "cover_url", "source_url": "https://example.org/old"})
        old_bytes = path.read_bytes()
        self.document["cover_url"] = "https://example.org/new"
        manager = self.manager()
        manager.fetch = Mock(return_value=image_bytes("red"))
        manager.resolve(self.document)
        self.assertNotEqual(path.read_bytes(), old_bytes)
        self.assertEqual(manager.cache["covers"]["272037"]["source_url"], self.document["cover_url"])

    def test_explicit_url_overrides_provider_cache(self):
        self.seed({"source": "google"})
        self.document["cover_url"] = "https://example.org/new"
        manager = self.manager()
        manager.fetch = Mock(return_value=self.png)
        manager.resolve(self.document)
        manager.fetch.assert_called_once_with(self.document["cover_url"])

    def test_failed_url_falls_back_and_is_retried_next_run(self):
        # Deux managers successifs représentent deux traitements quotidiens.
        # Le succès du fournisseur au premier passage ne doit pas masquer l'URL CSV au second.
        self.document["cover_url"] = "https://example.org/failing"
        for _ in range(2):
            manager = self.manager(("bnf", "google"))
            manager.fetch = Mock(side_effect=CoverError("HTTP 500"))
            manager.provider_image = Mock(return_value=self.jpg)
            manager.resolve(self.document)
            manager.fetch.assert_called_once()
            manager.provider_image.assert_called_once_with("bnf", identifiers(self.document))
            self.assertFalse(any(key.startswith("cover_url:") for key in manager.cache["negative"]))

    def test_all_sources_fail_preserves_old_image_and_provenance(self):
        path = self.seed({"source": "cover_url", "source_url": "https://example.org/old"})
        self.document["cover_url"] = "https://example.org/new"
        manager = self.manager()
        manager.fetch = Mock(side_effect=CoverError("réseau"))
        manager.provider_image = Mock(side_effect=CoverError("HTTP 503"))
        self.assertEqual(manager.resolve(self.document), path)
        self.assertEqual(path.read_bytes(), self.jpg)
        self.assertEqual(manager.cache["covers"]["272037"]["source_url"], "https://example.org/old")
        self.assertEqual(manager.cache["negative"], {})

    def test_negative_cache_is_provider_specific_and_persistent(self):
        # Recréer le manager force la relecture du cache sur disque : ce test prouve
        # la persistance, pas seulement la conservation dans un objet en mémoire.
        manager = self.manager()
        manager.provider_image = Mock(side_effect=MissingCover("absente"))
        self.assertIsNone(manager.resolve(self.document))
        manager.save()
        self.assertEqual(set(manager.cache["negative"]), {f"{source}:272037" for source in ("google", "bnf", "amazon")})
        second = self.manager()
        second.provider_image = Mock()
        self.assertIsNone(second.resolve(self.document))
        second.provider_image.assert_not_called()
        third = self.manager(retry_missing=True)
        self.assertEqual(third.cache["negative"], {})

    def test_changed_identifiers_invalidate_negative_cache(self):
        manager = self.manager(("google",))
        manager.provider_image = Mock(side_effect=MissingCover("absente"))
        manager.resolve(self.document)
        manager.provider_image = Mock(return_value=self.jpg)
        self.document.update(isbn="9782226250223", ean="")
        self.assertIsNotNone(manager.resolve(self.document))
        manager.provider_image.assert_called_once()

    def test_forbidden_and_quota_suspend_provider_without_negative_cache(self):
        # Une liste side_effect fournit une réponse différente à chaque appel :
        # Google bloque, la BnF réussit, puis la BnF réussit pour la notice suivante.
        manager = self.manager(("google", "bnf"))
        manager.provider_image = Mock(side_effect=[ProviderBlocked("HTTP 429"), self.jpg, self.jpg])
        manager.resolve(self.document)
        manager.resolve(dict(self.document, biblionumber="2"))
        self.assertEqual([call.args[0] for call in manager.provider_image.call_args_list], ["google", "bnf", "bnf"])
        self.assertNotIn("google:272037", manager.cache["negative"])

    def test_corrupt_local_image_is_replaced(self):
        path = self.seed({"source": "bnf"}, b"invalid")
        manager = self.manager(("bnf",))
        manager.provider_image = Mock(return_value=self.jpg)
        self.assertEqual(manager.resolve(self.document), path)
        self.assertEqual(path.read_bytes(), self.jpg)

    def test_corrupt_cache_and_legacy_negative_url(self):
        self.directory.mkdir()
        cache = self.directory / ".cover-cache.json"
        cache.write_text("invalid")
        with self.assertLogs("scripts.covers", level="WARNING"):
            self.assertEqual(self.manager().cache, {"covers": {}, "negative": {}})
        cache.write_text(json.dumps({"negative": {"cover_url:272037": True, "csv:272037": True, "bnf:272037": True}}))
        self.assertEqual(self.manager().cache["negative"], {"bnf:272037": True})

    def test_duplicates_are_downloaded_once_and_use_relative_urls(self):
        manager = self.manager(("bnf",))
        manager.provider_image = Mock(return_value=self.jpg)
        copies = [dict(self.document, list_id="11"), dict(self.document, list_id="32")]
        manager.populate(copies, self.root / "data/data.json")
        manager.provider_image.assert_called_once()
        self.assertEqual([doc["local_cover_url"] for doc in copies], ["../covers/272037.jpg"] * 2)

    def test_network_failure_does_not_block_json_or_excel(self):
        import csv
        source = self.root / "data.csv"
        with source.open("w", newline="", encoding="utf-8") as stream:
            writer = csv.DictWriter(stream, FIELDS, delimiter=";")
            writer.writeheader()
            writer.writerow(dict.fromkeys(FIELDS, "") | self.document | {"list_id": "11"})
        with patch("scripts.covers.CoverManager.fetch", side_effect=CoverError("réseau indisponible")):
            payload = convert(source, self.root / "data.json", self.root / "exports", covers_dir=self.directory)
        self.assertEqual(payload["documents"][0]["local_cover_url"], "")
        self.assertIn("export_xlsx", payload["lists"]["11"])
        self.assertTrue((self.root / "exports/liste-11.xlsx").is_file())

    def test_image_validation(self):
        for data in (b"<html>Forbidden</html>", self.png[:30]):
            with self.assertRaises(CoverError):
                jpeg_bytes(data)
        with self.assertRaises(MissingCover):
            jpeg_bytes(image_bytes(size=(1, 1)))

    def test_google_and_amazon_images_are_limited_to_500_pixels(self):
        large = image_bytes(size=(1000, 600))
        resized = jpeg_bytes(large, max_size=(500, 500))
        with Image.open(BytesIO(resized)) as image:
            self.assertEqual(image.size, (500, 300))

    def test_identifier_normalization_and_amazon_conversion(self):
        self.assertEqual(identifiers(self.document), ["9782765409779"])
        self.assertEqual(identifiers({"isbn": "2765409773", "ean": "9782309508128"}, prefer_ean=True), ["9782309508128"])
        self.assertEqual(identifiers({"isbn": "2765409773", "ean": ""}, prefer_ean=True), ["9782765409779"])
        self.assertEqual(isbn10("9782765409779"), "2765409773")
        self.assertEqual(isbn13("2765409773"), "9782765409779")
        self.assertIsNone(isbn10("9791234567896"))
        self.assertEqual(identifiers({"isbn": "0000000001 | 9782765409770"}), [])

    def test_ean_fallback_for_missing_or_invalid_isbn(self):
        for isbn in (None, "", "sans ISBN", "123", "9782765409770", "2765409774"):
            with self.subTest(isbn=isbn):
                self.assertEqual(identifiers({"isbn": isbn, "ean": "EAN : 978-2-226-25022-3"}),
                                 ["9782226250223"])
        self.assertEqual(identifiers({"ean": "9782226250223"}), ["9782226250223"])
        self.assertEqual(identifiers({"isbn": "2765409773", "ean": "9782226250223"}), ["2765409773"])
        self.assertEqual(identifiers({"isbn": "invalide", "ean": "9782226250220"}), [])

    def test_amazon_converts_fallback_ean_and_never_sends_979(self):
        # Exercer resolve() teste toute la chaîne : ISBN invalide → EAN → conversion
        # Amazon. Une simple vérification isolée de isbn10() ne couvrirait pas ce repli.
        manager = self.manager(("amazon",))
        manager.fetch = Mock(return_value=self.png)
        document = dict(self.document, isbn="invalide", ean="9782765409779")
        self.assertIsNotNone(manager.resolve(document))
        manager.fetch.assert_called_once_with(
            "https://images-na.ssl-images-amazon.com/images/P/2765409773.01.LZZZZZZZ.jpg"
        )
        manager.fetch.reset_mock()
        document = dict(document, biblionumber="2", ean="9791234567896")
        self.assertEqual(identifiers(document), ["9791234567896"])
        self.assertIsNone(manager.resolve(document))
        manager.fetch.assert_not_called()

    def test_extraction_ignores_parasites_and_prefers_first_isbn13(self):
        cases = (
            ("ISBN : 978-2-7654-0977-9 (broché) : 25 EUR", "9782765409779"),
            ("2-7654-0977-3 ; 978-2-226-25022-3 ; 9782765409779", "9782226250223"),
            ("papier 9782765409779 / numérique 9782226250223", "9782765409779"),
            ("ISBN 0-8044-2957-x (rel.) ; 2765409773", "080442957X"),
            ("prix : 25 EUR ; 2765409773 (papier)", "2765409773"),
            ("978 2 7654 0977 9", None),
            ("sans ISBN", None),
        )
        for raw, expected in cases:
            with self.subTest(raw=raw):
                document = {"isbn": raw}
                self.assertEqual(identifiers(document), [expected] if expected else [])
                self.assertEqual(document["isbn"], raw)

    def test_other_sources_keep_native_isbn10_and_amazon_skips_979(self):
        manager = self.manager()
        manager.fetch = Mock(return_value=b'{"items": []}')
        with self.assertRaises(MissingCover):
            manager.provider_image("google", ["2765409773"])
        self.assertIn("isbn%3A2765409773", manager.fetch.call_args.args[0])
        manager.fetch = Mock(return_value=self.png)
        manager.provider_image("bnf", ["2765409773"])
        self.assertIn("EAN=9782765409779", manager.fetch.call_args.args[0])
        manager.fetch.reset_mock()
        with self.assertRaises(MissingCover):
            manager.provider_image("amazon", ["9791234567896"])
        manager.fetch.assert_not_called()

    def test_provider_urls_and_google_key(self):
        manager = self.manager(google_api_key="test-secret")
        payload = {"items": [{"volumeInfo": {"industryIdentifiers": [{"identifier": "9782765409779"}],
                                            "imageLinks": {"thumbnail": "http://books.google.com/image"}}}]}
        manager.fetch = Mock(side_effect=[json.dumps(payload).encode(), self.png])
        self.assertEqual(manager.provider_image("google", ["9782765409779"]), self.jpg)
        self.assertIn("key=test-secret", manager.fetch.call_args_list[0].args[0])
        self.assertEqual(manager.fetch.call_args_list[1].args[0], "https://books.google.com/image")
        manager.fetch = Mock(return_value=self.png)
        manager.provider_image("bnf", ["9782765409779"])
        self.assertEqual(manager.fetch.call_args.args[0],
                 "https://openapi.bnf.fr/couverture/image/image/recupererImage?EAN=9782765409779&couverture=1&taille=originale&largeur=500&hauteur=500")
        manager.provider_image("amazon", ["9782765409779"])
        self.assertIn("/2765409773.01.LZZZZZZZ.jpg", manager.fetch.call_args.args[0])

    def test_google_wrong_edition_is_not_used(self):
        manager = self.manager()
        manager.fetch = Mock(return_value=json.dumps({"items": [{"volumeInfo": {
            "industryIdentifiers": [{"identifier": "9782226250223"}],
            "imageLinks": {"thumbnail": "https://example.org/wrong"},
        }}]}).encode())
        with self.assertRaises(MissingCover):
            manager.provider_image("google", ["9782765409779"])
        manager.fetch.assert_called_once()

    def test_bnf_server_error_is_retried_and_falls_back(self):
        manager = self.manager(("bnf", "amazon"))
        manager.fetch = Mock(side_effect=[CoverError("HTTP 500"), self.png])
        self.assertIsNotNone(manager.resolve(self.document))
        self.assertEqual(manager.cache["covers"]["272037"]["source"], "amazon")
        self.assertNotIn("bnf:272037", manager.cache["negative"])

    def test_missing_http_reason_is_preserved(self):
        manager = self.manager(("bnf",))
        manager.fetch = Mock(side_effect=MissingCover("HTTP 404"))
        with self.assertRaisesRegex(MissingCover, "HTTP 404"):
            manager.provider_image("bnf", identifiers(self.document))

    def test_oversized_response_is_rejected(self):
        manager = self.manager()
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b"x" * 21
        with patch("scripts.covers.MAX_BYTES", 20), patch("scripts.covers.urlopen", return_value=response):
            with self.assertRaisesRegex(CoverError, "12 Mio"):
                manager.fetch("https://example.org/image")

    def test_http_errors_and_timeouts_are_classified(self):
        # Ici, on remplace urlopen plutôt que fetch : la classification HTTP réelle
        # doit être testée. La clé fictive ne doit jamais réapparaître dans l'erreur.
        manager = self.manager()
        for code, error in ((404, MissingCover), (403, ProviderBlocked), (429, ProviderBlocked), (500, CoverError)):
            with self.subTest(code=code), patch("scripts.covers.urlopen", side_effect=HTTPError("https://example.org/?key=secret", code, "error", {}, None)):
                with self.assertRaises(error) as caught:
                    manager.fetch("https://example.org/?key=secret")
                self.assertNotIn("secret", str(caught.exception))
        with patch("scripts.covers.urlopen", side_effect=URLError("DNS")):
            with self.assertRaises(CoverError):
                manager.fetch("https://example.org")
        with self.assertRaises(CoverError):
            manager.fetch("file:///private")

    def test_failed_image_write_keeps_existing_image(self):
        # Simuler un disque plein vérifie qu'une ancienne image utilisable est préservée.
        path = self.seed({"source": "bnf"})
        manager = self.manager()
        manager.fetch = Mock(return_value=image_bytes("red"))
        manager.provider_image = Mock(side_effect=CoverError("indisponible"))
        self.document["cover_url"] = "https://example.org/new"
        with patch("scripts.covers.atomic_write", side_effect=OSError("disque plein")):
            self.assertEqual(manager.resolve(self.document), path)
        self.assertEqual(path.read_bytes(), self.jpg)


if __name__ == "__main__":
    unittest.main()
