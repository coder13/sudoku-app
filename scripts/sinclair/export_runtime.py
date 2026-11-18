"""Export frozen model parameters and reference profiles for on-device generation."""
import argparse
import gzip
import json
from pathlib import Path

import numpy as np

from edition import RESEARCH, annotate, priors
from model import PathModel, split_records
from pool import LEVELS, ROOT


def export(output):
    data = json.loads((RESEARCH / "model.json").read_text())
    with gzip.open(RESEARCH / "reference-traces.jsonl.gz", "rt") as source:
        training = split_records([json.loads(line) for line in source])["train"]
    replays = [row["human"] for row in training if row.get("human")]
    data["replay"]["familyMeans"]["transfer"] = np.mean(replays, axis=0).tolist()
    model = PathModel(data)
    profiles, targets = [], {}
    for family in ("classic", "killer", "x", "transfer"):
        rows = [dict(row, family=family) for row in training if family == "transfer" or row["family"] == family]
        for row in rows:
            annotate(model, row, row["paths"])
        targets[family] = []
        for tier in LEVELS:
            style, _ = priors(model, rows, family, tier)
            profile = dict(bits=style.bits, bitsScale=style.bits_scale,
                           player=style.player_center.tolist(), playerScale=style.player_scale.tolist(),
                           path=style.center.tolist(), pathScale=style.scale.tolist())
            if profile not in profiles:
                profiles.append(profile)
            targets[family].append(profiles.index(profile))
    data.update(profiles=profiles, targets=targets)
    output.write_text(json.dumps(data, sort_keys=True, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "src/sudoku/sinclair-weights.json")
    export(parser.parse_args().output)
