use std::collections::BTreeSet;

use crate::{Difficulty, Technique};

/// Internal acceptance rules. These never promote a puzzle to a harder tier.
#[derive(Default)]
pub(super) struct GenerationQuality {
    deductions: usize,
    techniques: BTreeSet<Technique>,
    stretches: usize,
    after_single: bool,
}

impl GenerationQuality {
    pub(super) fn record(&mut self, technique: Technique) {
        if technique.difficulty() < Difficulty::Medium {
            self.after_single = true;
            return;
        }
        if self.deductions == 0 || self.after_single {
            self.stretches += 1;
        }
        self.deductions += 1;
        self.techniques.insert(technique);
        self.after_single = false;
    }

    pub(super) fn accepts(&self, level: Difficulty) -> bool {
        if level < Difficulty::Medium {
            return true;
        }
        if self.deductions < 4 {
            return false;
        }
        // The default mode needs repeated discoveries and more than one kind
        // of elimination. Higher tiers can center on one elegant breakthrough.
        level != Difficulty::Medium || (self.techniques.len() >= 2 && self.stretches >= 2)
    }
}

pub(super) fn lower_tier_orders(level: Difficulty) -> Vec<Vec<Technique>> {
    let canonical: Vec<_> = Technique::DIFFICULTY_ORDER.iter().copied()
        .filter(|technique| technique.difficulty() < level).collect();
    let mut orders = vec![canonical];
    for reverse in [true, false] {
        let mut order = Vec::new();
        for tier in Difficulty::ALL.into_iter().filter(|tier| *tier < level) {
            let mut group: Vec<_> = Technique::DIFFICULTY_ORDER.iter().copied()
                .filter(|technique| technique.difficulty() == tier).collect();
            if reverse {
                group.reverse();
            } else if group.len() > 1 {
                let shift = group.len() / 2;
                group.rotate_left(shift);
            }
            order.extend(group);
        }
        if !orders.contains(&order) {
            orders.push(order);
        }
    }
    orders
}
