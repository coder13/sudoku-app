#![cfg(feature = "variants")]

use sudoku_app_engine::{Analysis, GridSpec, SizedConstraint, SizedConstraintGrid};

const SIX: GridSpec = GridSpec {
    size: 6,
    box_rows: 2,
    box_columns: 3,
};

#[test]
fn six_by_six_nonconsecutive_propagates_and_honors_white_dot_exceptions() {
    let mut digits = [0; 36];
    digits[0] = 2;
    let ordinary =
        SizedConstraintGrid::new(SIX, &[SizedConstraint::NonConsecutive { except: vec![] }])
            .unwrap();
    let masks = ordinary.candidates(&digits).unwrap().unwrap();
    assert_eq!(masks[1] & ((1 << 0) | (1 << 2)), 0);

    let exempt = SizedConstraintGrid::new(
        SIX,
        &[SizedConstraint::NonConsecutive {
            except: vec![[1, 0]],
        }],
    )
    .unwrap();
    let masks = exempt.candidates(&digits).unwrap().unwrap();
    assert_eq!(masks[1] & ((1 << 0) | (1 << 2)), (1 << 0) | (1 << 2));
}

#[test]
fn nonconsecutive_accepts_the_published_mixed_flockers_solution() {
    let rules = [
        SizedConstraint::NonConsecutive { except: vec![] },
        SizedConstraint::Whispers {
            cells: vec![9, 16, 21],
            min_difference: 3,
        },
        SizedConstraint::Inequality {
            less: 2,
            greater: 1,
        },
        SizedConstraint::Inequality {
            less: 25,
            greater: 24,
        },
    ];
    let grid = SizedConstraintGrid::new(SIX, &rules).unwrap();
    let solution: Vec<u8> = "642513315246531462264135426351153624"
        .bytes()
        .map(|byte| byte - b'0')
        .collect();
    assert_eq!(grid.analyze(&solution, 100_000), Analysis::Unique);
}

#[test]
fn invalid_or_duplicate_nonconsecutive_exceptions_are_rejected() {
    for except in [vec![[0, 7]], vec![[0, 1], [1, 0]]] {
        assert!(
            SizedConstraintGrid::new(SIX, &[SizedConstraint::NonConsecutive { except }]).is_none()
        );
    }
    assert!(
        SizedConstraintGrid::new(
            SIX,
            &[SizedConstraint::Inequality {
                less: 0,
                greater: 7
            }]
        )
        .is_none()
    );
}
