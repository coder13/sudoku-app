"""Run reproducible sparse Classic construction, mutation, and pool experiments."""
import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
from hashlib import sha256
import json
from multiprocessing import get_context
from pathlib import Path
import platform
import random
import re
import subprocess
from time import monotonic

from classic_sudoku_oracle import count_solutions


RESTRICTED = [
    'hidden-single-box', 'full-house', 'naked-single', 'hidden-single',
    'naked-pair', 'hidden-pair', 'x-wing', 'xy-wing',
]
TRIES = 24
MUTATION_NODES = 60_000
VERIFY_NODES = 500_000
CASE_SECONDS = 12


def emit(row):
    print(json.dumps(row, separators=(',', ':')), flush=True)


def added_cases(route, counts, seeds, **options):
    return [(route, clues, seed, options) for clues in counts for seed in range(1, seeds + 1)]


def plan():
    sparse = range(17, 21)
    cases = [
        *added_cases('fresh', sparse, 64),
        *added_cases('fresh-nearby', [[21, 23], [24, 28]], 32),
        *added_cases('fresh-hard', [[24, 28]], 32, difficulty='hard'),
        *added_cases('fresh-hard-restricted', [[24, 28]], 32, difficulty='hard', techniqueOrder=RESTRICTED),
        *added_cases('fresh-lower-score', [[22, 26]], 32, score=[0, 1000]),
        *added_cases('fresh-higher-score', [[22, 26]], 32, score=[1001, 1600]),
        *added_cases('fresh-first-naked-single', [[22, 27]], 24,
                     technique={'id': 'naked-single', 'mode': 'first'}),
        *added_cases('fresh-first-x-wing', [[22, 27]], 24,
                     technique={'id': 'x-wing', 'mode': 'first'}),
        *added_cases('mutation', sparse, 64),
        *added_cases('pool', sparse, 32),
        *added_cases('pool-lower-score', [[17, 20]], 24, score=[0, 1000]),
        *added_cases('pool-higher-score', [[17, 20]], 24, score=[1001, 1600]),
        *added_cases('pool-first-x-wing', [[17, 20]], 24,
                     technique={'id': 'x-wing', 'mode': 'first'}),
    ]
    return cases


def native(engine, request, seconds):
    process = subprocess.run(
        [str(engine), 'batch-generate', '-'],
        input=json.dumps(request) + '\n', capture_output=True, text=True, timeout=seconds,
    )
    if process.returncode:
        raise RuntimeError(process.stderr)
    return json.loads(process.stdout)


def mutate(clues, seed, attempts, node_limit, source_pool, deadline):
    chooser = random.Random(seed)
    events = []
    for attempt in range(1, attempts + 1):
        if monotonic() >= deadline:
            return {'status': 'timeout', 'attempts': len(events), 'checks': events}
        source, solution = chooser.choice(source_pool)
        removed = chooser.choice([cell for cell, digit in enumerate(source) if digit != '0'])
        added = chooser.sample([cell for cell, digit in enumerate(source) if digit == '0'], clues - 16)
        digits = list(source)
        digits[removed] = '0'
        for cell in added:
            digits[cell] = solution[cell]
        puzzle = ''.join(digits)
        result = count_solutions(puzzle, node_limit)
        events.append({'source': source, 'removedCell': removed, 'addedCells': added,
                       'puzzle': puzzle, 'outcome': result['status'], 'nodes': result['nodes']})
        if result['status'] == 'unique':
            assert result['first'] == solution
            return {'status': 'matched', 'attempts': attempt, 'puzzle': puzzle, 'checks': events}
    return {'status': 'exhausted', 'attempts': attempts, 'checks': events}


def run_case(engine, source_pool, job):
    start = monotonic()
    request = job['request']
    try:
        if request['type'] == 'single-clue-exchange':
            reply = {'result': mutate(request['clues'], request['seed'], request['maxAttempts'],
                                      request['oracleNodes'], source_pool, start + CASE_SECONDS)}
        else:
            reply = native(engine, request, CASE_SECONDS)
    except subprocess.TimeoutExpired:
        reply = {'result': {'status': 'timeout', 'attempts': None}}
    generation_elapsed = monotonic() - start
    result = reply['result']
    truth = None
    if result['status'] == 'matched':
        puzzle = result['puzzle']
        clues = request['clues']
        lower, upper = [clues, clues] if isinstance(clues, int) else clues
        assert len(puzzle) == 81 and lower <= 81 - puzzle.count('0') <= upper, job
        truth = count_solutions(puzzle, VERIFY_NODES)
    return {'status': 'outcome', **job, 'seconds': generation_elapsed, 'response': reply, 'truth': truth}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('native_engine', type=Path)
    parser.add_argument('templates_rs', type=Path)
    parser.add_argument('--workers', type=int, default=6)
    size = parser.add_mutually_exclusive_group()
    size.add_argument('--pilot', action='store_true')
    size.add_argument('--extended-fresh', action='store_true')
    size.add_argument('--tight-mutation', action='store_true')
    args = parser.parse_args()
    assert args.workers >= 1
    engine = args.native_engine.resolve()
    attempts = 4 if args.pilot else 128 if args.extended_fresh else TRIES
    choices = list(re.finditer(r'"([0-9]{81})"', args.templates_rs.read_text()))
    assert len(choices) == 17
    templates = [match[1] for match in choices]
    sparse_source = [puzzle for puzzle in templates if puzzle.count('0') == 64]
    source_pool = []
    source_checks = {}
    for grid in sparse_source:
        truth = count_solutions(grid, VERIFY_NODES)
        assert truth['status'] == 'unique', (grid, truth)
        source_pool.append((grid, truth['first']))
        source_checks[grid] = truth

    jobs = []
    if args.extended_fresh:
        cases = added_cases('fresh', range(17, 21), 256)
    elif args.tight_mutation:
        cases = added_cases('mutation', range(17, 21), 64)
    else:
        cases = plan()
    for route, clues, seed, flags in cases:
        if args.pilot and seed > 2:
            continue
        request_type = 'generate-from-pool' if route.startswith('pool') else 'generate-constrained'
        request = {'type': request_type, 'seed': seed, 'maxAttempts': attempts,
                   'clues': clues, 'includeRating': True, **flags}
        if route == 'mutation':
            request['type'] = 'single-clue-exchange'
            request['oracleNodes'] = 128 if args.tight_mutation else MUTATION_NODES
        jobs.append({'job': len(jobs), 'route': route, 'request': request})

    emit({'status': 'manifest', 'jobs': jobs, 'workerCount': args.workers, 'pilot': args.pilot,
          'extendedFresh': args.extended_fresh, 'tightMutation': args.tight_mutation,
          'nativeSha256': sha256(engine.read_bytes()).hexdigest(),
          'templatesSha256': sha256(args.templates_rs.read_bytes()).hexdigest(),
          'python': platform.python_version(), 'platform': platform.platform(),
          'caseTimeoutSeconds': CASE_SECONDS, 'verifyNodes': VERIFY_NODES,
          'templates': templates, 'mutationSourceTruth': source_checks})
    start = monotonic()
    with ProcessPoolExecutor(max_workers=args.workers, mp_context=get_context('fork')) as workers:
        pending = [workers.submit(run_case, engine, source_pool, job) for job in jobs]
        for result in as_completed(pending):
            emit(result.result())
    emit({'status': 'finished', 'wallSeconds': monotonic() - start, 'jobs': len(jobs)})


if __name__ == '__main__':
    main()
