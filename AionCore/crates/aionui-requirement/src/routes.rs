#![allow(clippy::disallowed_types)]
use crate::{RequirementError, RequirementRouterState};
use aionui_api_types::*;
use aionui_auth::CurrentUser;
use aionui_common::ApiError;
use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::StatusCode,
    routing::{get, patch, post},
};

/// These bounded metadata endpoints are behind application auth and CSRF.
/// They neither call models nor read or modify referenced external documents.
pub fn requirement_routes(state: RequirementRouterState) -> Router {
    Router::new()
        .route("/api/projects/{project_id}/requirements", get(list).post(create))
        .route("/api/requirements/{id}", get(detail).put(update).delete(remove))
        .route("/api/requirements/{id}/checks", post(check))
        .route(
            "/api/requirements/{id}/checks/{check_id}/issues/{issue_id}",
            patch(resolve),
        )
        .route("/api/requirements/{id}/confirm", post(confirm))
        .route("/api/requirements/{id}/export", get(export))
        .route("/api/requirements/{id}/links", post(link))
        .route("/api/requirements/{id}/links/{link_id}", axum::routing::delete(unlink))
        .route("/api/requirements/{id}/links/{link_id}/acknowledge", post(acknowledge))
        .with_state(state)
}
impl From<RequirementError> for ApiError {
    fn from(error: RequirementError) -> Self {
        let (status, code) = match &error {
            RequirementError::NotFound => (StatusCode::NOT_FOUND, "REQUIREMENT_NOT_FOUND"),
            RequirementError::Invalid(_) => (StatusCode::BAD_REQUEST, "REQUIREMENT_INVALID"),
            RequirementError::Conflict => (StatusCode::CONFLICT, "REQUIREMENT_CONFLICT"),
            RequirementError::ConfirmBlocked(_) => (StatusCode::CONFLICT, "REQUIREMENT_CONFIRM_BLOCKED"),
            RequirementError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "REQUIREMENT_INTERNAL"),
        };
        ApiError::coded(status, code, error.to_string(), None)
    }
}
type DetailResult = Result<Json<ApiResponse<RequirementDetail>>, ApiError>;
async fn list(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path(project): Path<String>,
) -> Result<Json<ApiResponse<Vec<RequirementCard>>>, ApiError> {
    Ok(Json(ApiResponse::ok(state.service.list(&user.id, &project).await?)))
}
async fn create(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path(project): Path<String>,
    body: Result<Json<CreateRequirementRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<ApiResponse<RequirementDetail>>), ApiError> {
    let Json(request) = body.map_err(ApiError::from)?;
    Ok((
        StatusCode::CREATED,
        Json(ApiResponse::ok(
            state.service.create(&user.id, &project, request).await?,
        )),
    ))
}
async fn detail(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
) -> DetailResult {
    Ok(Json(ApiResponse::ok(state.service.get(&user.id, &id).await?)))
}
async fn update(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
    body: Result<Json<UpdateRequirementRequest>, JsonRejection>,
) -> DetailResult {
    let Json(request) = body.map_err(ApiError::from)?;
    Ok(Json(ApiResponse::ok(
        state.service.update(&user.id, &id, request).await?,
    )))
}
async fn remove(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
    Query(query): Query<RequirementRevisionRequest>,
) -> Result<Json<ApiResponse<DeleteRequirementResponse>>, ApiError> {
    Ok(Json(ApiResponse::ok(
        state.service.delete(&user.id, &id, query.expected_revision).await?,
    )))
}
async fn check(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
    body: Result<Json<CheckRequirementRequest>, JsonRejection>,
) -> DetailResult {
    let Json(request) = body.map_err(ApiError::from)?;
    Ok(Json(ApiResponse::ok(
        state.service.check(&user.id, &id, request).await?,
    )))
}
async fn resolve(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path((id, check_id, issue_id)): Path<(String, String, String)>,
    body: Result<Json<ResolveRequirementIssueRequest>, JsonRejection>,
) -> DetailResult {
    let Json(request) = body.map_err(ApiError::from)?;
    Ok(Json(ApiResponse::ok(
        state
            .service
            .resolve_issue(&user.id, &id, &check_id, &issue_id, request)
            .await?,
    )))
}
async fn confirm(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
    body: Result<Json<RequirementRevisionRequest>, JsonRejection>,
) -> DetailResult {
    let Json(request) = body.map_err(ApiError::from)?;
    Ok(Json(ApiResponse::ok(
        state.service.confirm(&user.id, &id, request.expected_revision).await?,
    )))
}
async fn export(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<RequirementExport>>, ApiError> {
    Ok(Json(ApiResponse::ok(state.service.export(&user.id, &id).await?)))
}
async fn link(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path(id): Path<String>,
    body: Result<Json<CreateRequirementLinkRequest>, JsonRejection>,
) -> DetailResult {
    let Json(request) = body.map_err(ApiError::from)?;
    Ok(Json(ApiResponse::ok(state.service.link(&user.id, &id, request).await?)))
}
async fn unlink(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path((id, link_id)): Path<(String, String)>,
    Query(query): Query<RequirementRevisionRequest>,
) -> DetailResult {
    Ok(Json(ApiResponse::ok(
        state
            .service
            .unlink(&user.id, &id, &link_id, query.expected_revision)
            .await?,
    )))
}
async fn acknowledge(
    State(state): State<RequirementRouterState>,
    Extension(user): Extension<CurrentUser>,
    Path((id, link_id)): Path<(String, String)>,
    body: Result<Json<RequirementRevisionRequest>, JsonRejection>,
) -> DetailResult {
    let Json(request) = body.map_err(ApiError::from)?;
    Ok(Json(ApiResponse::ok(
        state
            .service
            .acknowledge(&user.id, &id, &link_id, request.expected_revision)
            .await?,
    )))
}
