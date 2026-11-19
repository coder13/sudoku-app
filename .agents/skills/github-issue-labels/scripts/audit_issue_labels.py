#!/usr/bin/env python3
"""Read-only coverage audit for repository issue labels; never infer or apply labels."""

import argparse
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
import sys


def paginated(path):
    result = subprocess.run(
        ["gh", "api", "--paginate", "--slurp", path],
        check=True, capture_output=True, text=True,
    )
    return [item for page in json.loads(result.stdout) for item in page]


def main():
    catalog = json.loads((Path(__file__).resolve().parents[1] / "references/labels.json").read_text())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=catalog["repository"])
    parser.add_argument("--state", choices=["open", "closed", "all"], default="open")
    parser.add_argument("--format", choices=["text", "json"], default="text")
    args = parser.parse_args()
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", args.repo):
        parser.error("--repo must be owner/name")

    definitions = catalog["labels"]
    names = {label["name"] for label in definitions}
    if len(names) != len(definitions):
        raise ValueError("The label catalog has duplicate names")
    groups = {group: {label["name"] for label in definitions if label["category"] == group}
              for group in ("work", "area")}
    issues = [item for item in paginated(f"repos/{args.repo}/issues?state={args.state}&per_page=100")
              if "pull_request" not in item]
    repository_labels = {label["name"] for label in paginated(f"repos/{args.repo}/labels?per_page=100")}
    needs_labels = []
    counts = Counter()
    for issue in issues:
        applied = {label["name"] for label in issue["labels"]}
        counts.update(applied)
        missing_groups = [group for group, allowed in groups.items() if not applied & allowed]
        if missing_groups:
            needs_labels.append({"number": issue["number"], "title": issue["title"],
                                 "state": issue["state"], "url": issue["html_url"],
                                 "labels": sorted(applied), "missing_groups": missing_groups})
    report = {"repository": args.repo, "state": args.state, "issue_count": len(issues),
              "missing_catalog_labels": sorted(names - repository_labels),
              "issues_needing_labels": sorted(needs_labels, key=lambda issue: issue["number"]),
              "label_counts": dict(sorted(counts.items()))}
    if args.format == "json":
        print(json.dumps(report, indent=2))
    else:
        print(f"{args.repo}: {len(issues)} {args.state} issues; PRs excluded")
        print(f"Missing catalog labels: {', '.join(report['missing_catalog_labels']) or 'none'}")
        print(f"Issues missing work/area labels: {len(needs_labels)}")
        for issue in report["issues_needing_labels"]:
            print(f"#{issue['number']} [{', '.join(issue['missing_groups'])}] {issue['title']}")
    return int(bool(needs_labels or report["missing_catalog_labels"]))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        print(f"Label audit failed: {error}", file=sys.stderr)
        raise SystemExit(2)
