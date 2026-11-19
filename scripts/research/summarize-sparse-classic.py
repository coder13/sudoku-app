"""Check the manifests and identity classes, then print calibration totals as JSON."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
import json
from pathlib import Path

from classic_sudoku_oracle import verify_identities


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def value_range(values):
    return [min(values), max(values)] if values else None


def summarize(source, replay):
    manifest, *outcomes, finished = source
    assert manifest['status'] == 'manifest' and finished['status'] == 'finished'
    assert len(outcomes) == len(manifest['jobs']) == finished['jobs']
    assert {row['job'] for row in outcomes} == {job['job'] for job in manifest['jobs']}
    groups = defaultdict(list)
    for row in outcomes:
        job = manifest['jobs'][row['job']]
        assert row['status'] == 'outcome' and job['route'] == row['route'] and job['request'] == row['request']
        groups[row['route'], json.dumps(row['request']['clues'])].append(row)

    summaries = []
    for (route, clues), cases in sorted(groups.items()):
        outcomes = [row['response']['result'] for row in cases]
        statuses = Counter(result['status'] for result in outcomes)
        known_attempts = sum(result['attempts'] for result in outcomes if result['attempts'] is not None)
        elapsed = sum(row['seconds'] for row in cases)
        accepted = []
        for row in cases:
            if row['response']['result']['status'] == 'matched':
                verified = replay.pop(row['job'])
                assert verified['puzzle'] == row['response']['result']['puzzle']
                accepted.append(verified)
        mutation_checks = Counter(check['outcome'] for result in outcomes for check in result.get('checks', []))
        source_keys = manifest['templates']
        summaries.append({
            'route': route, 'clues': json.loads(clues), 'jobs': len(cases),
            'statuses': statuses, 'attempts': known_attempts,
            'unknownAttemptJobs': sum(result['attempts'] is None for result in outcomes),
            'matches': len(accepted), 'matchPerKnownAttempt': len(accepted) / known_attempts if known_attempts else None,
            'mutationChecks': mutation_checks, 'rawPuzzles': len({row['puzzle'] for row in accepted}),
            'distinct': len({row['key'] for row in accepted}),
            'storedTemplateIdentities': len({row['key'] for row in accepted if row['key'] in source_keys}),
            'secondsPerMatch': elapsed / len(accepted) if accepted else None, 'jobSeconds': elapsed,
            'first': Counter(row['first'] or 'none' for row in accepted),
            'humanResult': Counter(
                row['rating']['status'] if isinstance(row['rating']['status'], str)
                else row['rating']['status']['solved'] for row in accepted
            ),
            'scoreRange': value_range([row['rating']['score']['points'] for row in accepted]),
            'stepRange': value_range([row['steps'] for row in accepted]),
        })
    assert not replay, replay
    return {
        'wallSeconds': finished['wallSeconds'], 'jobs': finished['jobs'],
        'attemptCap': manifest['jobs'][0]['request']['maxAttempts'],
        'groups': summaries,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('replay', type=Path)
    parser.add_argument('runs', nargs='+', type=Path)
    args = parser.parse_args()
    replay = rows(args.replay)
    assert replay[0]['status'] == 'manifest' and replay[-1]['status'] == 'finished'
    keys = {row['grid']: row['key'] for row in replay if row['status'] == 'identity'}
    verified = [row for row in replay if row['status'] == 'verified']
    assert len(verified) == replay[-1]['matchedJobs']
    output = {
        'inputs': {path.name: sha256(path.read_bytes()).hexdigest() for path in [*args.runs, args.replay]},
        'independentIdentityCheck': verify_identities(keys),
        'matchedJobs': len(verified),
        'matchedIdentityCount': len({row['key'] for row in verified}),
        'humanPaths': replay[-1]['traces'],
        'exactPuzzles': replay[-1]['exactPuzzles'],
        'runs': {},
    }
    for index, path in enumerate(args.runs):
        source = rows(path)
        source[0]['templates'] = {keys[grid] for grid in source[0]['templates']}
        by_job = {row['job']: row for row in verified if row['input'] == index}
        output['runs'][path.stem] = summarize(source, by_job)
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
