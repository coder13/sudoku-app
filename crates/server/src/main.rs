use std::{env, io, net::SocketAddr};

use axum::{
    Json, Router,
    http::{StatusCode, header},
    routing::{get, post},
};
use sudoku_app_engine::{Analysis, analyze, parse_givens};
use serde::{Deserialize, Serialize};
use tower_http::{services::ServeDir, set_header::SetResponseHeaderLayer};

#[derive(Deserialize)]
struct PuzzleRequest {
    puzzle: String,
}

#[derive(Serialize)]
struct PuzzleResponse {
    status: &'static str,
}

async fn analyze_puzzle(
    Json(request): Json<PuzzleRequest>,
) -> Result<Json<PuzzleResponse>, (StatusCode, Json<PuzzleResponse>)> {
    let board = parse_givens(&request.puzzle).ok_or((
        StatusCode::BAD_REQUEST,
        Json(PuzzleResponse {
            status: "invalid-format",
        }),
    ))?;
    let result = tokio::task::spawn_blocking(move || analyze(&board))
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(PuzzleResponse {
                    status: "engine-error",
                }),
            )
        })?;
    let status = match result {
        Analysis::Conflict => "conflict",
        Analysis::Unsolvable => "unsolvable",
        Analysis::Unique => "unique",
        Analysis::Multiple => "multiple",
        Analysis::SearchLimit => "search-limit",
    };
    Ok(Json(PuzzleResponse { status }))
}

fn app(client_dir: &str) -> Router {
    let api = Router::new()
        .route("/health", get(|| async { StatusCode::NO_CONTENT }))
        .route("/v1/puzzles/analyze", post(analyze_puzzle))
        .layer(axum::extract::DefaultBodyLimit::max(2048));

    Router::new()
        .nest("/api", api)
        .fallback_service(ServeDir::new(client_dir))
        .layer(SetResponseHeaderLayer::if_not_present(
            header::CACHE_CONTROL,
            header::HeaderValue::from_static("no-cache"),
        ))
}

#[tokio::main]
async fn main() -> io::Result<()> {
    let address: SocketAddr = env::var("SUDOKU_APP_ADDRESS")
        .unwrap_or_else(|_| "127.0.0.1:8765".to_owned())
        .parse()
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
    let client_dir = env::var("SUDOKU_APP_CLIENT_DIR").unwrap_or_else(|_| "dist/client".to_owned());
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("Sudoku is listening at http://{}", listener.local_addr()?);
    axum::serve(listener, app(&client_dir)).await
}
