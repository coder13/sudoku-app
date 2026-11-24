use sudoku_app_engine::{
    Analysis, HintAction, HintChoices, SolverProfile, Technique, analyze, candidates, hint_choices,
    parse_givens, rate_puzzle, solve, solve_logically,
};

const GIVENS: &str =
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

#[test]
fn every_build_validates_solves_rates_and_finds_sound_hint_choices() {
    let givens = parse_givens(GIVENS).unwrap();
    let solution = parse_givens(SOLUTION).unwrap();
    assert_eq!(analyze(&givens), Analysis::Unique);
    assert_eq!(solve(&givens), Some(solution));
    assert_eq!(candidates(&givens).unwrap()[2], 0b1011);
    let trace = solve_logically(&givens, Technique::default_order()).unwrap();
    assert_eq!(trace.board, solution);
    assert_eq!(
        rate_puzzle(&givens, Technique::default_order()).unwrap(),
        trace.rating()
    );
    let HintChoices::Choices(hints) = hint_choices(&givens, None).unwrap() else {
        panic!("the fixture has several independently valid hint choices");
    };
    assert!(hints.len() > 1);
    for hint in hints {
        for action in hint.actions {
            match action {
                HintAction::Place(candidate) => {
                    assert_eq!(solution[candidate.cell], candidate.digit)
                }
                HintAction::Eliminate(candidate) => {
                    assert_ne!(solution[candidate.cell], candidate.digit)
                }
            }
        }
    }
    let empty = SolverProfile::from_ids(std::iter::empty::<&str>()).unwrap();
    let stalled = solve_logically(&givens, empty.technique_order()).unwrap();
    assert_eq!(stalled.board, givens);
    assert!(stalled.steps.is_empty());
}
