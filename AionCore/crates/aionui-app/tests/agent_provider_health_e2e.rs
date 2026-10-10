//! Provider health-check route auth and validation tests.

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::json;
use tower::ServiceExt;

use common::{body_json, build_app, json_with_token, setup_and_login};

#[tokio::test]
async fn model_benchmark_requires_authentication() {
    let (app, _services) = build_app().await;
    let request = Request::builder()
        .method("POST")
        .uri("/api/providers/p1/model-bench")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"model":"test","prompt":"hello"}"#))
        .unwrap();
    // CSRF runs before authentication for POST requests in external-identity mode.
    let status = app.clone().oneshot(request).await.unwrap().status();
    assert!(status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN);
    let catalog = Request::builder()
        .uri("/api/model-bench/models")
        .body(Body::empty())
        .unwrap();
    assert_eq!(app.oneshot(catalog).await.unwrap().status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn model_benchmark_requires_csrf_for_external_identity() {
    let (mut app, services) = build_app().await;
    let (token, _) = setup_and_login(&mut app, &services, "admin", "StrongP@ss1").await;
    let request = Request::builder()
        .method("POST")
        .uri("/api/providers/p1/model-bench")
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {token}"))
        .body(Body::from(r#"{"model":"test","prompt":"hello"}"#))
        .unwrap();
    assert_eq!(app.oneshot(request).await.unwrap().status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn provider_health_check_unauthenticated_is_rejected() {
    let (app, _services) = build_app().await;

    let req = Request::builder()
        .method("POST")
        .uri("/api/agents/provider-health-check")
        .header("content-type", "application/json")
        .body(Body::from(
            serde_json::to_vec(&json!({"provider_id": "p1", "model": "gpt-4o"})).unwrap(),
        ))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();

    assert!(
        resp.status() == StatusCode::UNAUTHORIZED || resp.status() == StatusCode::FORBIDDEN,
        "expected auth rejection, got {}",
        resp.status()
    );
}

#[tokio::test]
async fn provider_health_check_requires_csrf_for_post() {
    let (mut app, services) = build_app().await;
    let (token, _csrf) = setup_and_login(&mut app, &services, "admin", "StrongP@ss1").await;

    let req = Request::builder()
        .method("POST")
        .uri("/api/agents/provider-health-check")
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {token}"))
        .body(Body::from(
            serde_json::to_vec(&json!({"provider_id": "p1", "model": "gpt-4o"})).unwrap(),
        ))
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn provider_health_check_validates_required_fields() {
    let (mut app, services) = build_app().await;
    let (token, csrf) = setup_and_login(&mut app, &services, "admin", "StrongP@ss1").await;

    let req = json_with_token(
        "POST",
        "/api/agents/provider-health-check",
        json!({"provider_id": "", "model": "gpt-4o"}),
        &token,
        &csrf,
    );
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let json = body_json(resp).await;
    assert_eq!(json["code"], "BAD_REQUEST");
    assert!(
        json["error"]
            .as_str()
            .is_some_and(|message| message.contains("provider_id is required")),
        "expected provider_id validation error, got {json}"
    );
}
