#![cfg(feature = "cli")]

use std::{
    io::Write,
    process::{Command, Stdio},
};

use serde_json::{Value, json};
use sudoku_app_engine::{
    Analysis, SCORING_VERSION, Technique, VARIANT_SCORING_VERSION, VariantPuzzle, analyze,
    opening_techniques, parse_givens, rate_puzzle,
};

const ONE_BLANK: &str =
    "034678912672195348198342567859761423426853791713924856961537284287419635345286179";

// dml50 in https://gitlab.com/scilab/forge/sudoku/-/blob/master/collection/hardest.sdm
const FORCING_NET_OPENER: &str =
    "020400000006080100700003000000060300000200005090007040300000800001000090040500002";

fn run(command: &str, input: impl AsRef<[u8]>) -> Vec<Value> {
    let mut child = Command::new(env!("CARGO_BIN_EXE_sudoku-engine"))
        .args([command, "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_ref())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

#[test]
fn batch_rating_records_order_seed_and_scoring_version_for_each_row() {
    let custom = json!({
        "values": ONE_BLANK,
        "seed": 314,
        "techniqueOrder": ["hidden-single", "full-house"],
    });
    let empty_profile = json!({ "values": ONE_BLANK, "techniqueOrder": [] });
    let mut input = format!("{ONE_BLANK}\nnot a grid\n\n{custom}\n").into_bytes();
    input.extend_from_slice(&[0xff, b'\n']);
    input.extend_from_slice(empty_profile.to_string().as_bytes());
    let records = run("batch-rate", input);
    assert_eq!(records.len(), 5);
    for (record, line) in records.iter().zip([1, 2, 4, 5, 6]) {
        assert_eq!(record["line"], line);
        assert_eq!(record["scoringVersion"], SCORING_VERSION);
    }
    assert_eq!(records[0]["seed"], Value::Null);
    assert_eq!(
        records[0]["techniqueOrder"],
        json!(Technique::DEFAULT_ORDER)
    );
    assert_eq!(records[0]["result"]["rating"]["score"]["points"], 4);
    assert_eq!(records[1]["result"]["status"], "invalid");
    assert_eq!(records[1]["result"]["code"], "invalid-grid");
    assert!(records[1]["result"].get("puzzle").is_none());
    assert_eq!(records[2]["seed"], 314);
    assert_eq!(
        records[2]["techniqueOrder"],
        json!(["hidden-single", "full-house"])
    );
    assert_eq!(records[2]["result"]["rating"]["score"]["points"], 14);
    assert_eq!(records[2]["result"]["puzzle"], ONE_BLANK);
    assert_eq!(records[3]["result"]["code"], "invalid-request");
    assert_eq!(records[4]["techniqueOrder"], json!([]));
    assert_eq!(records[4]["result"]["rating"]["status"], "stalled");
}

#[test]
fn batch_generation_reproduces_verified_matches_and_reports_other_outcomes() {
    // The default batch generation command accepts the constrained request shape.
    let matched = json!({
        "seed": 42,
        "maxAttempts": 1,
        "clues": 80,
        "score": [14, 14],
        "technique": { "id": "hidden-single", "mode": "first" },
        "techniqueOrder": ["hidden-single"],
    });
    let exhausted = json!({ "seed": 43, "maxAttempts": 2, "clues": 80, "score": [0, 0] });
    let invalid = json!({
        "seed": 44,
        "maxAttempts": 10,
        "clues": 80,
        "technique": { "id": "full-house", "mode": "exclusive-opening" },
    });
    let pool = json!({
        "type": "generate-from-pool",
        "seed": 42,
        "maxAttempts": 64,
        "clues": 17,
        "difficulty": "medium",
    });
    let targeted = json!({
        "type": "generate-targeted",
        "seed": 42,
        "maxAttempts": 1,
        "target": { "type": "difficulty", "level": "easy", "techniqueOrder": ["full-house"] },
    });
    let exclusive = json!({
        "seed": 42,
        "maxAttempts": 1,
        "clues": 21,
        "technique": { "id": "forcing-net", "mode": "exclusive-opening" },
        "templates": [FORCING_NET_OPENER],
    });
    let ordered = json!({
        "seed": 42,
        "maxAttempts": 1,
        "clues": 21,
        "technique": { "id": "forcing-net", "mode": "first" },
        "techniqueOrder": ["forcing-net"],
        "templates": [FORCING_NET_OPENER],
    });
    let records = run(
        "batch-generate",
        format!(
            "{matched}\n{exhausted}\n{invalid}\n{{\n{matched}\n{pool}\n{targeted}\n{exclusive}\n{ordered}\n"
        ),
    );
    assert_eq!(records.len(), 9);
    for (record, line) in records.iter().zip(1..=9) {
        assert_eq!(record["line"], line);
        assert_eq!(record["scoringVersion"], SCORING_VERSION);
    }
    assert_eq!(records[0]["seed"], 42);
    assert_eq!(records[0]["techniqueOrder"], json!(["hidden-single"]));
    assert_eq!(records[0]["result"]["rating"]["score"]["points"], 14);
    assert_eq!(records[0]["result"], records[4]["result"]);
    let result = &records[0]["result"];
    assert_eq!(result["status"], "matched");
    assert_eq!(result["attempts"], 1);
    let board = parse_givens(result["puzzle"].as_str().unwrap()).unwrap();
    assert_eq!(analyze(&board), Analysis::Unique);
    assert_eq!(
        result["rating"],
        json!(rate_puzzle(&board, &[Technique::HiddenSingle]).unwrap())
    );
    assert_eq!(
        records[1]["result"],
        json!({ "status": "exhausted", "attempts": 2 })
    );
    assert_eq!(records[2]["seed"], 44);
    assert_eq!(records[2]["result"]["code"], "incompatible-targets");
    assert_eq!(records[2]["result"]["attempts"], 0);
    assert_eq!(records[3]["result"]["code"], "invalid-request");
    assert_eq!(records[3]["techniqueOrder"], Value::Null);
    assert_eq!(records[5]["result"]["status"], "matched");
    assert_eq!(
        records[5]["result"]["puzzle"]
            .as_str()
            .unwrap()
            .replace('0', "")
            .len(),
        17
    );
    assert_eq!(
        records[5]["result"]["rating"]["status"],
        json!({ "solved": "medium" })
    );
    assert_eq!(records[6]["techniqueOrder"], json!(["full-house"]));
    assert_eq!(
        records[6]["result"]["rating"]["techniqueOrder"],
        json!(["full-house"])
    );
    assert_eq!(
        records[7]["result"],
        json!({ "status": "exhausted", "attempts": 1 })
    );
    let result = &records[8]["result"];
    assert_eq!(result["attempts"], 1);
    assert_eq!(result["status"], "matched");
    assert_eq!(result["rating"]["status"], "stalled");
    let transformed = result["puzzle"].as_str().unwrap();
    assert_ne!(transformed, FORCING_NET_OPENER);
    let board = parse_givens(transformed).unwrap();
    assert_eq!(analyze(&board), Analysis::Unique);
    assert_eq!(
        opening_techniques(&board).unwrap(),
        [Technique::ForcingNet, Technique::NestedForcingNet]
    );
}

#[test]
fn batch_variant_positions_round_trip_and_keep_processing_after_invalid_rules() {
    let solution =
        "658492731974316582132875694461523978387149256295768143849251367726934815513687429";
    let mut givens = solution.to_owned();
    givens.replace_range(10..11, ".");
    let position = json!({
        "puzzle": {
            "version": 1,
            "givens": givens,
            "rules": [{ "type": "diagonal", "diagonal": "main" }],
        },
    });
    let rows = [
        json!({ "position": position }),
        json!({ "position": { "puzzle": { "version": 1, "givens": givens, "rules": [{ "type": "thermo", "cells": [0,1] }] } } }),
        json!({ "position": position, "operation": "solve", "maxNodes": 10 }),
        json!({ "position": position, "operation": "analyze", "maxNodes": 0 }),
    ];
    let input = rows.map(|row| row.to_string()).join("\n");
    let output = run("batch-variant", input);
    let serialized = &output[0]["result"]["value"];
    assert_eq!(serialized["puzzle"]["givens"], givens.replace('.', "0"));
    assert_eq!(serialized["puzzle"]["rules"], position["puzzle"]["rules"]);
    assert_eq!(serialized["eliminations"].as_array().unwrap().len(), 81);
    assert!(output[0]["techniqueOrder"].is_null());
    assert_eq!(output[1]["result"]["code"], "unsupported-rule");
    assert_eq!(output[2]["result"]["value"], solution);
    assert_eq!(output[3]["result"]["value"], "search-limit");

    let replay = run(
        "batch-variant",
        json!({ "position": serialized }).to_string(),
    );
    assert_eq!(&replay[0]["result"]["value"], serialized);
}

#[test]
fn batch_variant_generation_records_seed_and_resolved_rules() {
    let request = json!({
        "type": "generate-variant",
        "seed": 41,
        "maxAttempts": 1,
        "template": { "version": 1, "givens": "0".repeat(81) },
        "derivedClues": [{ "type": "killer-cage-sizes", "sizes": vec![3; 27], "coverGrid": true }],
        "givens": 80,
        "variantClues": [27, 27],
        "score": [4, 4],
        "technique": { "id": "naked-single", "mode": "first" },
        "techniqueOrder": ["naked-single"],
    });
    let mut exhausted = request.clone();
    exhausted["maxNodes"] = json!(0);
    let records = run(
        "batch-generate",
        format!("{request}\n{exhausted}\n{request}"),
    );
    assert_eq!(records.len(), 3);
    for (record, line) in records.iter().zip(1..=3) {
        assert_eq!(record["line"], line);
        assert_eq!(record["seed"], 41);
        assert_eq!(record["techniqueOrder"], json!(["naked-single"]));
        assert_eq!(record["scoringVersion"], VARIANT_SCORING_VERSION);
    }
    let result = &records[0]["result"];
    assert_eq!(result, &records[2]["result"]);
    assert_eq!(result["status"], "matched");
    assert_eq!(result["seed"], 41);
    assert_eq!(result["variantClues"], 27);
    assert_eq!(result["rating"]["points"], 4);
    assert_eq!(result["rating"]["rules"], result["puzzle"]["rules"]);
    let puzzle: VariantPuzzle = serde_json::from_value(result["puzzle"].clone()).unwrap();
    let compiled = puzzle.compile().unwrap();
    let expected = parse_givens(result["solution"].as_str().unwrap()).unwrap();
    assert_eq!(
        compiled.analyze(&[0; 81], &[0; 81], 100),
        Ok(Analysis::Unique)
    );
    assert_eq!(compiled.solve(&[0; 81], &[0; 81], 100), Ok(expected));
    assert_eq!(
        records[1]["result"],
        json!({ "status": "exhausted", "attempts": 1 })
    );
}

#[test]
fn batch_variant_catalog_and_examples_use_the_variant_score_version() {
    let catalog = json!({ "type": "techniques", "variant": true });
    let exercises = json!({ "type": "practice-examples", "variant": true, "technique": "renban" });
    let rows = run("batch-variant", format!("{catalog}\n{exercises}"));
    for row in &rows {
        assert_eq!(row["scoringVersion"], VARIANT_SCORING_VERSION);
        assert_eq!(row["result"]["status"], "ok");
    }
    let catalog = &rows[0]["result"]["value"];
    assert_eq!(catalog["scoringVersion"], VARIANT_SCORING_VERSION);
    let examples = rows[1]["result"]["value"].as_array().unwrap();
    assert_eq!(examples.len(), 3);
    assert!(examples.iter().any(|exercise| {
        exercise["position"]["puzzle"]["rules"]
            .as_array()
            .unwrap()
            .len()
            > 1
    }));
    let requests: Vec<_> = examples
        .iter()
        .map(|example| {
            json!({
                "operation": "check-practice-move",
                "position": example["position"],
                "technique": "renban",
                "action": example["suggestion"],
            })
            .to_string()
        })
        .collect();
    let checked = run("batch-variant", requests.join("\n"));
    for (row, exercise) in checked.iter().zip(examples) {
        assert_eq!(row["result"]["value"], exercise["deduction"]);
    }
}
