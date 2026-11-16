use std::io::{self, BufRead, Write};

use super::{
    GenerationOutput, GenerationProfile, GenerationStep, Request, ResponseValue, ResultValue,
    SCORING_VERSION, Technique, execute, grid_string, puzzle_error, rate_puzzle, start_generation,
};
use crate::{VARIANT_SCORING_VERSION, VariantTechnique};
use serde_json::{Value, json};

/// Operation applied to each record by [`run_batch`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BatchCommand {
    /// Rate an 81-character grid string or a JSON rating request.
    Rate,
    /// Run a JSON generation request and report attempts and the result.
    Generate,
    /// Normalize or run exact analysis on a structured variant position.
    Variant,
}

const INVALID_ROW: (&str, &str) = ("invalid-request", "Enter a valid request on one line.");

/// Read one request per line and write one JSON record per nonblank line.
///
/// Invalid records produce a response and leave later records usable.
/// An input or output I/O failure stops the batch and returns the error.
pub fn run_batch(
    input: impl BufRead,
    mut output: impl Write,
    command: BatchCommand,
) -> io::Result<()> {
    for (index, line) in input.split(b'\n').enumerate() {
        let line = line?;
        let line_number = index + 1;
        let row = match std::str::from_utf8(&line).map(str::trim) {
            Ok("") => continue,
            Ok(text) => batch_row(command, line_number, text),
            Err(_) => record(
                line_number,
                Value::Null,
                Value::Null,
                SCORING_VERSION,
                failure(command, INVALID_ROW),
            ),
        };
        serde_json::to_writer(&mut output, &row).map_err(io::Error::other)?;
        writeln!(output)?;
    }
    output.flush()
}

fn batch_row(command: BatchCommand, line: usize, text: &str) -> Value {
    let (seed, order, scoring_version, result) = match batch_request(command, text) {
        Ok(input) => {
            let seed = input["seed"].clone();
            let order = requested_order(&input);
            let scoring_version = match input["type"].as_str() {
                Some("variant" | "generate-variant") => VARIANT_SCORING_VERSION,
                Some("practice-examples" | "techniques") if input["variant"] == true => {
                    VARIANT_SCORING_VERSION
                }
                _ => SCORING_VERSION,
            };
            let result =
                if !seed.is_null() && !seed.as_u64().is_some_and(|n| u32::try_from(n).is_ok()) {
                    Err((
                        "invalid-seed",
                        "Enter a whole seed between 0 and 4294967295.",
                    ))
                } else {
                    serde_json::from_value(input)
                        .map_err(|_| INVALID_ROW)
                        .and_then(|request| evaluate(command, request))
                };
            (seed, order, scoring_version, result)
        }
        Err(error) => (Value::Null, Value::Null, SCORING_VERSION, Err(error)),
    };
    let (order, result) = result.unwrap_or_else(|error| (order, failure(command, error)));
    record(line, seed, order, scoring_version, result)
}

fn failure(command: BatchCommand, (code, error): (&str, &str)) -> Value {
    let status = if code == "search-limit" {
        "exhausted"
    } else {
        "invalid"
    };
    let mut result = json!({ "status": status, "code": code, "error": error });
    if command == BatchCommand::Generate {
        result["attempts"] = json!(0);
    }
    result
}

fn record(line: usize, seed: Value, order: Value, scoring_version: u32, result: Value) -> Value {
    json!({
        "line": line,
        "seed": seed,
        "techniqueOrder": order,
        "scoringVersion": scoring_version,
        "result": result,
    })
}

fn batch_request(command: BatchCommand, text: &str) -> ResultValue {
    let mut input = if command == BatchCommand::Rate && !text.starts_with(['{', '[']) {
        json!({ "values": text })
    } else {
        serde_json::from_str::<Value>(text).map_err(|_| INVALID_ROW)?
    };
    input
        .as_object_mut()
        .ok_or(INVALID_ROW)?
        .entry("type")
        .or_insert_with(|| {
            json!(match command {
                BatchCommand::Rate => "rate",
                BatchCommand::Generate => "generate-constrained",
                BatchCommand::Variant => "variant",
            })
        });
    Ok(input)
}

fn requested_order(input: &Value) -> Value {
    let order = match input["type"].as_str() {
        Some("variant") => return Value::Null,
        Some("generate-targeted") if input["target"]["type"] == "difficulty" => {
            &input["target"]["techniqueOrder"]
        }
        Some("generate-targeted") => &Value::Null,
        _ => &input["techniqueOrder"],
    };
    if order.is_null() {
        if input["type"] == "generate-variant" {
            json!(VariantTechnique::DEFAULT_ORDER)
        } else {
            json!(Technique::DEFAULT_ORDER)
        }
    } else {
        order.clone()
    }
}

fn evaluate(command: BatchCommand, request: Request) -> ResultValue<(Value, Value)> {
    match (command, request) {
        (
            BatchCommand::Rate,
            Request::Rate {
                values,
                technique_order,
            },
        ) => {
            let puzzle = values.clone();
            let ResponseValue::Json(rating) = execute(Request::Rate {
                values,
                technique_order,
            })?
            else {
                unreachable!("rating uses the JSON response");
            };
            Ok((
                rating["techniqueOrder"].clone(),
                json!({ "status": "rated", "puzzle": puzzle, "rating": rating }),
            ))
        }
        (BatchCommand::Generate, request) => generate(request),
        (
            BatchCommand::Variant,
            request @ (Request::Variant { .. }
            | Request::PracticeExamples { variant: true, .. }
            | Request::Techniques { variant: true }),
        ) => {
            let ResponseValue::Json(value) = execute(request)? else {
                unreachable!("variant requests use the JSON response");
            };
            let order = value
                .get("techniqueOrder")
                .or_else(|| value["rating"].get("techniqueOrder"))
                .cloned()
                .unwrap_or(Value::Null);
            Ok((order, json!({ "status": "ok", "value": value })))
        }

        _ => Err(INVALID_ROW),
    }
}

fn generate(request: Request) -> ResultValue<(Value, Value)> {
    let (profile, mut search) = start_generation(request)?;
    let order = match &profile {
        GenerationProfile::Classic(profile) => json!(profile.technique_order()),
        GenerationProfile::Variant(order) => json!(order),
    };
    while let Some(step) = search.advance() {
        match step {
            GenerationStep::Matched { attempts, puzzle } => {
                let (board, rating) = match puzzle {
                    GenerationOutput::Board(board) => {
                        let GenerationProfile::Classic(profile) = &profile else {
                            unreachable!("an unstructured grid uses a classic profile");
                        };
                        (board, rate_puzzle(&board, profile.technique_order()))
                    }
                    GenerationOutput::Rated(puzzle) => (puzzle.board, Ok(puzzle.rating)),
                    variant @ GenerationOutput::Variant(_) => {
                        let mut result = variant.into_wire();
                        result["status"] = json!("matched");
                        result["attempts"] = json!(attempts);
                        return Ok((order, result));
                    }
                };
                let mut result = json!({ "status": "matched", "attempts": attempts, "puzzle": grid_string(board) });
                match rating {
                    Ok(rating) => result["rating"] = json!(rating),
                    Err(analysis) => {
                        let (code, error) = puzzle_error(analysis);
                        result["ratingError"] = json!({ "code": code, "error": error });
                    }
                }
                return Ok((order, result));
            }
            GenerationStep::Exhausted { attempts } => {
                return Ok((
                    order,
                    json!({ "status": "exhausted", "attempts": attempts }),
                ));
            }
            GenerationStep::Pending { .. } | GenerationStep::Cancelled { .. } => {}
        }
    }
    unreachable!("a batch search advances to a match or exhaustion")
}
