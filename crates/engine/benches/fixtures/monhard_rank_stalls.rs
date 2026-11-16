use sudoku_app_engine::Technique;

// The expanded profile stalled on these seven source lines in an evenly
// spaced sample of 512 out of 55,088 Monhard puzzles.
// https://github.com/denis-berthier/Sudoku-classif/blob/main/Monhard-until-2023-08-15-TE23/puzzles.txt
pub const STALLS: &[(usize, &str)] = &[
    (
        108,
        "98.76.5..7.4..5......4.9.8.6.......3......8.2.......5.5.789.....6...49...4.5.6.7.",
    ),
    (
        432,
        "98.76.5..7.4.58......4.9...69.....3.......8.........2.5.7.......6..4.95..4...6.87",
    ),
    (
        647,
        "98.76.5..7.5..4.6.....85.9.3.7......2.......8......7....96.74.....45..79....986.5",
    ),
    (
        2803,
        "98.76.5..7.5..4.6.....85..73...9...82..............9...9...86.5..76..4.....45..79",
    ),
    (
        7762,
        "98.76.5..7.5.489.......9...6...5....49..87.....74......74....3..6.....21...6.....",
    ),
    (
        27706,
        "987......6..8...........5..4.3.5.21....41..53.....38.4.2.18..3....3.21.5....45.8.",
    ),
    (
        49051,
        "98.76.5..7.5..9....648.....8.647..5.5...9.....7...6.4..98............3.2........1",
    ),
];

pub fn profile() -> Vec<Technique> {
    use Technique::*;
    let mut order = Technique::DEFAULT_ORDER.to_vec();
    let aic = order
        .iter()
        .position(|&technique| technique == Aic)
        .unwrap();
    order.splice(
        aic..aic,
        [UniqueLoop, AlignedPairExclusion, AlignedTripletExclusion],
    );
    let forcing = order
        .iter()
        .position(|&technique| technique == ForcingChain)
        .unwrap();
    order.splice(forcing..forcing, [Tridagon, FrankenFish, MutantFish]);
    order.extend([
        KrakenFish1,
        KrakenFish2,
        DynamicForcingNet,
        AdvancedForcingNet,
        TridagonForcingNet,
        NestedForcingNet,
    ]);
    order
}
