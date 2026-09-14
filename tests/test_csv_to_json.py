# Tests du trajet CSV → objets Python → fichiers JSON et Excel.
# Lancer : python -m unittest discover -s tests -v
# unittest découvre les méthodes dont le nom commence par test_. Chaque scénario
# prépare une entrée, appelle le vrai code puis compare le résultat attendu avec assert*.
import csv
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.csv_to_json import FIELDS, PRIMO_PREFIX, convert, main, read_documents


class PipelineTests(unittest.TestCase):
    def setUp(self):
        # setUp est rejoué avant CHAQUE test. Les fichiers sont isolés dans un dossier
        # temporaire ; addCleanup le supprimera même si une assertion échoue.
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source.csv"
        self.output = self.root / "data/data.json"
        self.exports = self.root / "exports"

    def write_csv(self, rows, fields=FIELDS):
        # Construire un vrai CSV teste aussi les guillemets et les retours à la ligne.
        # L'union « dictionnaire | row » remplace les cellules vides par les valeurs du cas.
        with self.source.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=fields, delimiter=";")
            writer.writeheader()
            for row in rows:
                writer.writerow(dict.fromkeys(fields, "") | row)

    def test_round_trip_and_complete_lists(self):
        # Le point-virgule dans le titre et le résumé multiligne ne doivent pas
        # créer de fausses colonnes/lignes. Les zéros des ISBN/EAN doivent survivre.
        self.write_csv([
            {"biblionumber": str(index), "list_id": "11" if index < 20 else "32",
             "title": "L'été ; à l'université", "abstract": "Résumé\n" * 500,
             "isbn": "0012345678", "ean": "0001234567890", "opac_suppressed": "1",
             "holdings": '[{"library":"MEDP","callnumber":"É 42 / A"}]'}
            for index in range(1, 22)
        ])
        result = convert(self.source, self.output, self.exports)
        # Relire le fichier écrit, plutôt que vérifier seulement l'objet retourné,
        # permet de détecter un problème de sérialisation ou d'encodage.
        self.assertEqual(result, json.loads(self.output.read_text(encoding="utf-8")))
        self.assertEqual(len(result["documents"]), 21)
        self.assertEqual(set(result["lists"]), {"11", "32"})
        document = result["documents"][0]
        self.assertEqual(document["holdings"], [{"library": "MEDP", "callnumber": "É 42 / A"}])
        self.assertEqual(document["isbn"], "0012345678")
        self.assertEqual(document["ean"], "0001234567890")
        self.assertEqual(document["abstract"], "Résumé\n" * 500)
        self.assertEqual(document["record_url"], PRIMO_PREFIX + "1")
        self.assertEqual(document["local_cover_url"], "")
        self.assertEqual(result["lists"]["11"]["export_xlsx"], "../exports/liste-11.xlsx")
        self.assertTrue((self.exports / "liste-32.xlsx").exists())

    def test_invalid_holdings_are_logged_and_replaced(self):
        # subTest nomme chaque variante d'un même scénario. assertLogs intercepte
        # les avertissements et permet de vérifier que la notice fautive est identifiable.
        for holdings in ("broken", "{}", "null", '["item"]', '[{"library":null}]'):
            with self.subTest(holdings=holdings):
                self.write_csv([{"biblionumber": "1", "list_id": "11", "holdings": holdings}])
                with self.assertLogs("scripts.csv_to_json", level="WARNING") as logs:
                    documents = read_documents(self.source)
                self.assertEqual(documents[0]["holdings"], [])
                self.assertIn("notice 1", logs.output[0])

    def test_empty_holdings_and_optional_cells(self):
        for holdings in ("", "[]", "[{}]"):
            self.write_csv([{"biblionumber": "1", "list_id": "11", "holdings": holdings}])
            document = read_documents(self.source)[0]
            self.assertIsInstance(document["holdings"], list)
            self.assertEqual(document["authors"], "")

    def test_invalid_identifiers_and_header_preserve_existing_json(self):
        # « previous » représente un ancien JSON publié : une mauvaise entrée
        # doit être rejetée avant de l'écraser.
        self.output.parent.mkdir()
        self.output.write_text("previous", encoding="utf-8")
        for value in ("", "0", "-1", "../11", "1.5"):
            self.write_csv([{"biblionumber": "1", "list_id": value}])
            with self.assertRaises(ValueError):
                convert(self.source, self.output, self.exports)
            self.assertEqual(self.output.read_text(), "previous")
        self.write_csv([], fields=("biblionumber",))
        with self.assertRaisesRegex(ValueError, "En-tête"):
            read_documents(self.source)

    def test_conflicting_metadata_fails_before_exports(self):
        self.write_csv([
            {"biblionumber": "1", "list_id": "11", "list": "A"},
            {"biblionumber": "2", "list_id": "11", "list": "B"},
        ])
        with self.assertRaisesRegex(ValueError, "contradictoires"):
            convert(self.source, self.output, self.exports)
        self.assertFalse(self.exports.exists())

    def test_excel_failure_still_writes_json_without_export_link(self):
        # patch remplace temporairement une fonction, ici par une erreur de disque.
        # On vérifie la tolérance à l'échec, sans devoir réellement verrouiller un fichier.
        self.write_csv([{"biblionumber": "1", "list_id": "11"}])
        with patch("scripts.csv_to_json.write_excel", side_effect=OSError("verrouillé")):
            with self.assertLogs("scripts.csv_to_json", level="ERROR"):
                status = main(["--input", str(self.source), "--output", str(self.output),
                               "--exports-dir", str(self.exports), "--skip-covers"])
        self.assertEqual(status, 1)
        result = json.loads(self.output.read_text())
        self.assertNotIn("export_xlsx", result["lists"]["11"])
        self.assertEqual(len(result["documents"]), 1)

    def test_header_only_csv(self):
        self.write_csv([])
        self.assertEqual(convert(self.source, self.output, self.exports), {"lists": {}, "documents": []})

    def test_json_write_failure_preserves_previous_file(self):
        # Simuler l'échec au tout dernier remplacement vérifie l'écriture atomique
        # ET le nettoyage du fichier temporaire après une exception.
        self.write_csv([])
        self.output.parent.mkdir()
        self.output.write_text("previous")
        with patch("scripts.csv_to_json.os.replace", side_effect=OSError("verrouillé")):
            with self.assertRaises(OSError):
                convert(self.source, self.output, self.exports)
        self.assertEqual(self.output.read_text(), "previous")
        self.assertEqual(list(self.output.parent.iterdir()), [self.output])


if __name__ == "__main__":
    # Permet également de lancer les tests de ce module comme programme principal.
    unittest.main()
