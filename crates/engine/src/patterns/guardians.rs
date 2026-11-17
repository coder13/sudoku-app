use super::{Candidate, PEERS, cell_bit, cells};
use std::collections::BTreeSet;

#[derive(Debug, PartialEq, Eq)]
pub(super) enum GuardianGroup {
    SingleDigit(u8, u128),
    Mixed(Vec<Candidate>),
}

// A weak link to either endpoint needs a live candidate that conflicts with
// every guardian in that endpoint. Use pairs of such witnesses to enumerate
// the partitions that can participate in a chain.
pub(super) fn visit_partitions(
    guardians: &[Candidate],
    positions: &[u128; 9],
    mut visit: impl FnMut([GuardianGroup; 2]),
) {
    let mut coverage = [0u64; crate::CELLS * 9];
    for (index, guardian) in guardians.iter().enumerate() {
        for (digit, &live) in positions.iter().enumerate() {
            let conflicts = if digit + 1 == usize::from(guardian.digit) {
                PEERS[guardian.cell]
            } else {
                cell_bit(guardian.cell)
            };
            for cell in cells(live & conflicts) {
                coverage[cell * 9 + digit] |= 1 << index;
            }
        }
    }
    let mut witnesses: Vec<_> = coverage.into_iter().filter(|&set| set != 0).collect();
    witnesses.sort_unstable();
    witnesses.dedup();
    let all = (1u64 << guardians.len()) - 1;
    let mut partitions = BTreeSet::new();
    for &left in witnesses.iter().filter(|&&set| set & 1 != 0) {
        for &right in witnesses.iter().filter(|&&set| left | set == all) {
            // Put the first guardian on the left to avoid reversing a partition.
            let required = (all ^ right) | 1;
            let shared = left & right & !1;
            let mut flexible = shared;
            loop {
                let first = required | flexible;
                if first != all && partitions.insert(first) {
                    visit([
                        guardian_group(guardians, first),
                        guardian_group(guardians, all ^ first),
                    ]);
                }
                if flexible == 0 {
                    break;
                }
                flexible = (flexible - 1) & shared;
            }
        }
    }
}

fn guardian_group(guardians: &[Candidate], selected: u64) -> GuardianGroup {
    let members: Vec<_> = guardians
        .iter()
        .enumerate()
        .filter_map(|(i, &candidate)| (selected & (1 << i) != 0).then_some(candidate))
        .collect();
    let digit = members[0].digit;
    if members.iter().all(|member| member.digit == digit) {
        GuardianGroup::SingleDigit(
            digit,
            members
                .into_iter()
                .fold(0, |all, member| all | cell_bit(member.cell)),
        )
    } else {
        GuardianGroup::Mixed(members)
    }
}
