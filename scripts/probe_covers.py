"""Tester un petit échantillon réel, sans modifier les ressources de production."""

# Outil de diagnostic volontairement distinct de la conversion quotidienne.
# Exemple : python scripts/probe_covers.py --sample 3 --cover-source amazon
# Contrairement aux tests unitaires, ce script effectue de vrais appels Internet.

import argparse
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path

if __package__:
    # Import lors d'un lancement en module : python -m scripts.probe_covers.
    from .covers import CoverManager, SOURCES
    from .csv_to_json import ROOT, read_documents
else:
    from covers import CoverManager, SOURCES
    from csv_to_json import ROOT, read_documents


def main(argv=None):
    # argparse lit les options et contrôle les noms de fournisseurs acceptés.
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "data/data.csv")
    parser.add_argument("--sample", type=int, default=3)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "cover-probe")
    parser.add_argument("--cover-source", choices=SOURCES, action="append")
    args = parser.parse_args(argv)
    if args.sample < 1:
        parser.error("--sample doit être positif")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s : %(message)s")
    unique = {doc["biblionumber"]: doc for doc in reversed(read_documents(args.input))}
    # Le dictionnaire élimine les notices répétées. Le parcours inversé fait
    # prévaloir les données de leur première occurrence lors des remplacements.
    selected = list(reversed(list(unique.values())))[:args.sample]
    output = args.output_dir / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    # Un dossier daté par exécution évite de réutiliser un ancien cache positif :
    # on veut observer une réponse actuelle du fournisseur, pas un ancien succès.
    output.mkdir(parents=True, exist_ok=True)
    report = {}
    for source in args.cover_source or SOURCES:
        # Chaque fournisseur reçoit une copie des notices et son propre cache.
        # Vider cover_url est intentionnel : sinon l'URL CSV passerait avant le
        # fournisseur que l'on cherche précisément à tester.
        documents = [dict(document, cover_url="", local_cover_url="") for document in selected]
        manager = CoverManager(output / source, (source,), google_api_key=os.environ.get("GOOGLE_BOOKS_API_KEY"))
        stats = manager.populate(documents, output / "report.json")
        report[source] = {"stats": stats, "documents": [
            # Ne garder que les champs utiles au diagnostic, pas tout le résumé.
            {key: document[key] for key in ("biblionumber", "isbn", "ean", "local_cover_url")}
            for document in documents
        ]}
    report_path = output / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Rapport : {report_path}")
    return 0 if all(item["stats"].get("downloaded", 0) for item in report.values()) else 1

# Le code 1 indique ici qu'un fournisseur n'a donné aucune image sur l'échantillon.
# Cela ne suffit pas à prouver une panne : lire les journaux (absence, quota, réseau).


if __name__ == "__main__":
    raise SystemExit(main())
