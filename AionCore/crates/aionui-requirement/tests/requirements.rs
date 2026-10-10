use aionui_api_types::*;
use aionui_auth::{
    AuthIdentityMode, AuthState, CookieConfig, CurrentUser, JwtService, auth_middleware, csrf_middleware,
};
use aionui_db::{
    Database, IConversationRepository, SqliteConversationRepository, SqliteProjectStore, SqliteRequirementRepository,
    SqliteUserRepository, init_database_memory,
};
use aionui_requirement::{RequirementError, RequirementRouterState, RequirementService, requirement_routes};
use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
    middleware::from_fn_with_state,
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

const USER: &str = "system_default_user";
async fn setup() -> (Arc<RequirementService>, Database) {
    let db = init_database_memory().await.unwrap();
    sqlx::query(
        "INSERT INTO users(id,username,password_hash,created_at,updated_at) VALUES('other','other','hash',1,1)",
    )
    .execute(db.pool())
    .await
    .unwrap();
    for (id, user) in [("project", USER), ("second", USER), ("foreign", "other")] {
        sqlx::query(
            "INSERT INTO projects(project_id,user_id,name,kind,created_at,updated_at) VALUES(?,?,?,'standard',1,1)",
        )
        .bind(id)
        .bind(user)
        .bind(id)
        .execute(db.pool())
        .await
        .unwrap();
    }
    let service = Arc::new(RequirementService::new(
        Arc::new(SqliteRequirementRepository::new(db.pool().clone())),
        Arc::new(SqliteProjectStore::new(db.pool().clone())),
        Arc::new(SqliteConversationRepository::new(db.pool().clone())),
    ));
    (service, db)
}
fn create_request(complete: bool) -> CreateRequirementRequest {
    serde_json::from_value(json!({"content":if complete {full_content()} else {json!({"title":"保存筛选条件"})},"sources":[{"kind":"user","label":"产品负责人","excerpt":"已核实的原始需求"}],"questions":[]})).unwrap()
}
fn full_content() -> Value {
    json!({"title":"保存筛选条件","audience":"已登录的产品经理","scenario":"返回需求列表时","problem":"筛选条件丢失导致重复输入","goal":"再次打开页面恢复上次筛选","scope":"仅保存当前用户的筛选设置","rules":"点击保存后记录当前筛选值","exceptions":"空筛选按默认条件展示；保存失败提示重试","acceptance":"保存后刷新页面，筛选值与保存前一致，其他用户不受影响"})
}
fn update_request(detail: &RequirementDetail, title: &str) -> UpdateRequirementRequest {
    let mut content = detail.card.content.clone();
    content.title = title.into();
    UpdateRequirementRequest {
        expected_revision: detail.card.revision,
        content,
        sources: detail.card.sources.clone(),
        questions: detail.card.questions.clone(),
        status: None,
    }
}
fn rule_request(revision: i64) -> CheckRequirementRequest {
    CheckRequirementRequest {
        expected_revision: revision,
        kind: None,
        based_on_revision: None,
        summary: String::new(),
        issues: vec![],
    }
}
fn router(service: Arc<RequirementService>, user: &str) -> Router {
    let mut current = CurrentUser::local_default();
    current.id = user.into();
    requirement_routes(RequirementRouterState { service }).layer(axum::Extension(current))
}
async fn send(router: &Router, method: &str, url: &str, body: Option<Value>) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(url);
    let body = if let Some(value) = body {
        builder = builder.header("content-type", "application/json");
        Body::from(value.to_string())
    } else {
        Body::empty()
    };
    let response = router.clone().oneshot(builder.body(body).unwrap()).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

#[tokio::test]
async fn route_crud_persists_content_sources_questions_and_versions() {
    let (service, _db) = setup().await;
    let routes = router(service.clone(), USER);
    let (status,body)=send(&routes,"POST","/api/projects/project/requirements",Some(json!({"content":{"title":"新需求"},"questions":[{"text":"谁可用？","resolved":false,"answer":""}],"sources":[{"kind":"user","label":"业务方","excerpt":"访谈记录"}]}))).await;
    assert_eq!(status, StatusCode::CREATED);
    let detail: RequirementDetail = serde_json::from_value(body["data"].clone()).unwrap();
    assert_eq!(detail.card.revision, 1);
    assert_eq!(detail.versions.len(), 1);
    assert!(!detail.card.questions[0].id.is_empty());
    assert!(!detail.card.sources[0].id.is_empty());
    let (status, body) = send(&routes, "GET", "/api/projects/project/requirements", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"].as_array().unwrap().len(), 1);
    let update = update_request(&detail, "更新后的需求");
    let updated = service.update(USER, &detail.card.id, update).await.unwrap();
    assert_eq!(updated.card.revision, 2);
    assert_eq!(updated.versions.len(), 2);
    assert_eq!(updated.versions[0].snapshot.content.title, "新需求");
    let fetched = service.get(USER, &detail.card.id).await.unwrap();
    assert_eq!(fetched.card.content.title, "更新后的需求");
    let (status, body) = send(
        &routes,
        "DELETE",
        &format!("/api/requirements/{}?expected_revision=1", detail.card.id),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["code"], "REQUIREMENT_CONFLICT");
    let (status, body) = send(
        &routes,
        "DELETE",
        &format!("/api/requirements/{}?expected_revision=2", detail.card.id),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["deleted"], true);
    assert!(matches!(
        service.get(USER, &detail.card.id).await,
        Err(RequirementError::NotFound)
    ));
}

#[tokio::test]
async fn invalid_missing_oversized_and_duplicate_inputs_are_rejected() {
    let (service, _db) = setup().await;
    let routes = router(service.clone(), USER);
    for body in [
        json!({"content":{"title":" "}}),
        json!({"content":{"title":"a".repeat(301)}}),
        json!({"content":{"title":"ok","scope":"a".repeat(30001)}}),
        json!({"content":{"title":"ok"},"questions":[{"text":"问题","resolved":true,"answer":""}]}),
        json!({"content":{"title":"ok"},"sources":[{"kind":"file","label":"文件","excerpt":""}]}),
        json!({"content":{"title":"ok"},"sources":[{"id":"same","kind":"user","label":"甲"},{"id":"same","kind":"user","label":"乙"}]}),
        json!({"content":{"title":"ok"},"sources":[{"kind":"user","label":"甲","fields":["token"]}]}),
    ] {
        let (status, body) = send(&routes, "POST", "/api/projects/project/requirements", Some(body)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["code"], "REQUIREMENT_INVALID");
    }
    let (status, body) = send(&routes, "POST", "/api/projects/project/requirements", Some(json!({}))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["code"], "BAD_REQUEST");
}

#[tokio::test]
async fn user_and_project_boundaries_apply_to_every_operation() {
    let (service, _db) = setup().await;
    let detail = service.create(USER, "project", create_request(true)).await.unwrap();
    let id = &detail.card.id;
    assert!(matches!(
        service.create(USER, "foreign", create_request(true)).await,
        Err(RequirementError::NotFound)
    ));
    assert!(matches!(
        service.list("other", "project").await,
        Err(RequirementError::NotFound)
    ));
    assert!(matches!(
        service.get("other", id).await,
        Err(RequirementError::NotFound)
    ));
    assert!(matches!(
        service.update("other", id, update_request(&detail, "盗改")).await,
        Err(RequirementError::NotFound)
    ));
    assert!(matches!(
        service.delete("other", id, 1).await,
        Err(RequirementError::NotFound)
    ));
    assert!(matches!(
        service.check("other", id, rule_request(1)).await,
        Err(RequirementError::NotFound)
    ));
    assert!(matches!(
        service.confirm("other", id, 1).await,
        Err(RequirementError::NotFound)
    ));
    assert!(matches!(
        service.export("other", id).await,
        Err(RequirementError::NotFound)
    ));
    assert!(matches!(
        service
            .link(
                "other",
                id,
                CreateRequirementLinkRequest {
                    expected_revision: 1,
                    kind: "file".into(),
                    label: "文件".into(),
                    path: "/x".into()
                }
            )
            .await,
        Err(RequirementError::NotFound)
    ));
    let routes = router(service, "other");
    let (status, body) = send(&routes, "GET", &format!("/api/requirements/{id}"), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["code"], "REQUIREMENT_NOT_FOUND");
    assert!(!body.to_string().contains("SELECT"));
}

#[tokio::test]
async fn checks_and_confirmation_require_current_complete_verified_content() {
    let (service, _db) = setup().await;
    let mut detail = service.create(USER, "project", create_request(false)).await.unwrap();
    let id = detail.card.id.clone();
    assert!(matches!(
        service.confirm(USER, &id, 1).await,
        Err(RequirementError::ConfirmBlocked(_))
    ));
    detail = service.check(USER, &id, rule_request(1)).await.unwrap();
    assert!(
        detail.checks[0]
            .issues
            .iter()
            .any(|i| i.field == "audience" && i.severity == "blocking")
    );
    let check_id = detail.checks[0].id.clone();
    let issue_id = detail.checks[0].issues[0].id.clone();
    assert!(matches!(
        service
            .resolve_issue(
                USER,
                &id,
                &check_id,
                &issue_id,
                ResolveRequirementIssueRequest {
                    expected_revision: 1,
                    status: "accepted".into(),
                    resolution: String::new()
                }
            )
            .await,
        Err(RequirementError::Invalid(_))
    ));
    for issue in detail.checks[0].issues.clone() {
        service
            .resolve_issue(
                USER,
                &id,
                &check_id,
                &issue.id,
                ResolveRequirementIssueRequest {
                    expected_revision: 1,
                    status: "accepted".into(),
                    resolution: "人工确认".into(),
                },
            )
            .await
            .unwrap();
    }
    assert!(matches!(
        service.confirm(USER, &id, 1).await,
        Err(RequirementError::ConfirmBlocked(_))
    ));
    let mut request = update_request(&detail, "保存筛选条件");
    request.content = serde_json::from_value(full_content()).unwrap();
    let updated = service.update(USER, &id, request).await.unwrap();
    assert_eq!(updated.card.revision, 2);
    assert!(matches!(
        service.confirm(USER, &id, 2).await,
        Err(RequirementError::ConfirmBlocked(_))
    ));
    detail = service.check(USER, &id, rule_request(2)).await.unwrap();
    assert!(detail.checks.last().unwrap().issues.is_empty());
    detail = service.confirm(USER, &id, 2).await.unwrap();
    assert_eq!(detail.card.status, "confirmed");
    assert_eq!(detail.versions.len(), 2);
    detail = service
        .update(USER, &id, update_request(&detail, "增加筛选条件保存"))
        .await
        .unwrap();
    assert_eq!(detail.card.status, "review");
    assert_eq!(detail.card.revision, 3);
    assert!(matches!(
        service
            .resolve_issue(
                USER,
                &id,
                &check_id,
                &issue_id,
                ResolveRequirementIssueRequest {
                    expected_revision: 3,
                    status: "resolved".into(),
                    resolution: "已修改".into()
                }
            )
            .await,
        Err(RequirementError::Conflict)
    ));
}

#[tokio::test]
async fn reopening_current_blocking_issue_revokes_confirmation_without_changing_content_revision() {
    let (service, _db) = setup().await;
    let detail = service.create(USER, "project", create_request(true)).await.unwrap();
    let id = detail.card.id.clone();
    service.check(USER, &id, rule_request(1)).await.unwrap();
    let review = CheckRequirementRequest {
        expected_revision: 1,
        kind: Some("ai".into()),
        based_on_revision: Some(1),
        summary: "人工处理后确认".into(),
        issues: vec![
            RequirementIssue {
                field: "rules".into(),
                severity: "blocking".into(),
                message: "请确认筛选保存的覆盖范围".into(),
                ..Default::default()
            },
            RequirementIssue {
                field: "acceptance".into(),
                severity: "warning".into(),
                message: "建议增加异常验收".into(),
                ..Default::default()
            },
        ],
    };
    let old = service
        .check(USER, &id, review.clone())
        .await
        .unwrap()
        .checks
        .pop()
        .unwrap();
    let current = service.check(USER, &id, review).await.unwrap().checks.pop().unwrap();
    for check in [&old, &current] {
        for issue in &check.issues {
            service
                .resolve_issue(
                    USER,
                    &id,
                    &check.id,
                    &issue.id,
                    ResolveRequirementIssueRequest {
                        expected_revision: 1,
                        status: "accepted".into(),
                        resolution: "已与业务方核实".into(),
                    },
                )
                .await
                .unwrap();
        }
    }
    let mut detail = service.confirm(USER, &id, 1).await.unwrap();
    assert_eq!(detail.card.status, "confirmed");
    let versions = detail.versions.clone();
    let content = serde_json::to_value(&detail.card.content).unwrap();
    for (check, issue) in [(&old, &old.issues[0]), (&current, &current.issues[1])] {
        detail = service
            .resolve_issue(
                USER,
                &id,
                &check.id,
                &issue.id,
                ResolveRequirementIssueRequest {
                    expected_revision: 1,
                    status: "open".into(),
                    resolution: String::new(),
                },
            )
            .await
            .unwrap();
        assert_eq!(detail.card.status, "confirmed");
    }
    detail = service
        .resolve_issue(
            USER,
            &id,
            &current.id,
            &current.issues[0].id,
            ResolveRequirementIssueRequest {
                expected_revision: 1,
                status: "open".into(),
                resolution: String::new(),
            },
        )
        .await
        .unwrap();
    assert_eq!(detail.card.status, "review");
    assert_eq!(detail.card.revision, 1);
    assert_eq!(serde_json::to_value(&detail.card.content).unwrap(), content);
    assert_eq!(
        serde_json::to_value(&detail.versions).unwrap(),
        serde_json::to_value(&versions).unwrap()
    );
    assert_eq!(service.get(USER, &id).await.unwrap().card.status, "review");
    assert!(matches!(
        service.confirm(USER, &id, 1).await,
        Err(RequirementError::ConfirmBlocked(_))
    ));
}

#[tokio::test]
async fn unresolved_questions_cannot_be_bypassed_by_issue_acceptance() {
    let (service, _db) = setup().await;
    let mut request = create_request(true);
    request.questions.push(RequirementQuestion {
        text: "是否覆盖移动端？".into(),
        ..Default::default()
    });
    let detail = service.create(USER, "project", request).await.unwrap();
    let id = detail.card.id;
    let detail = service.check(USER, &id, rule_request(1)).await.unwrap();
    let check = &detail.checks[0];
    let issue = check.issues.iter().find(|i| i.field == "questions").unwrap();
    service
        .resolve_issue(
            USER,
            &id,
            &check.id,
            &issue.id,
            ResolveRequirementIssueRequest {
                expected_revision: 1,
                status: "accepted".into(),
                resolution: "以后处理".into(),
            },
        )
        .await
        .unwrap();
    assert!(matches!(
        service.confirm(USER, &id, 1).await,
        Err(RequirementError::ConfirmBlocked(_))
    ));
}

#[tokio::test]
async fn ai_reports_reject_stale_results_and_reset_client_issue_decisions() {
    let (service, _db) = setup().await;
    let detail = service.create(USER, "project", create_request(true)).await.unwrap();
    let id = detail.card.id.clone();
    let issue = RequirementIssue {
        field: "rules".into(),
        severity: "blocking".into(),
        message: "存在冲突".into(),
        status: "accepted".into(),
        resolution: "伪造已处理".into(),
        ..Default::default()
    };
    let request = CheckRequirementRequest {
        expected_revision: 1,
        kind: Some("ai".into()),
        based_on_revision: Some(1),
        summary: "模型审查".into(),
        issues: vec![issue],
    };
    let mut detail = service.check(USER, &id, request.clone()).await.unwrap();
    let saved = detail.checks.last().unwrap();
    assert_eq!(saved.issues[0].status, "open");
    assert!(saved.issues[0].resolution.is_empty());
    assert!(!saved.issues[0].id.is_empty());
    detail = service
        .update(USER, &id, update_request(&detail, "内容已改"))
        .await
        .unwrap();
    assert_eq!(detail.card.revision, 2);
    assert!(matches!(
        service.check(USER, &id, request).await,
        Err(RequirementError::Conflict)
    ));
    let stale = CheckRequirementRequest {
        expected_revision: 2,
        kind: Some("ai".into()),
        based_on_revision: Some(1),
        summary: String::new(),
        issues: vec![],
    };
    assert!(matches!(
        service.check(USER, &id, stale).await,
        Err(RequirementError::Conflict)
    ));
    assert_eq!(service.get(USER, &id).await.unwrap().checks.len(), 1);
}

#[tokio::test]
async fn document_links_need_manual_acknowledgement_after_each_content_change() {
    let (service, _db) = setup().await;
    let detail = service.create(USER, "project", create_request(true)).await.unwrap();
    let id = detail.card.id.clone();
    let mut detail = service
        .link(
            USER,
            &id,
            CreateRequirementLinkRequest {
                expected_revision: 1,
                kind: "document".into(),
                label: "PRD".into(),
                path: "/workspace/PRD.md".into(),
            },
        )
        .await
        .unwrap();
    let link_id = detail.links[0].id.clone();
    assert!(detail.links[0].needs_review);
    detail = service.acknowledge(USER, &id, &link_id, 1).await.unwrap();
    assert!(!detail.links[0].needs_review);
    assert_eq!(detail.links[0].synced_revision, 1);
    detail = service
        .update(USER, &id, update_request(&detail, "调整后的需求"))
        .await
        .unwrap();
    assert!(detail.links[0].needs_review);
    assert_eq!(detail.links[0].synced_revision, 1);
    assert!(matches!(
        service.acknowledge(USER, &id, &link_id, 1).await,
        Err(RequirementError::Conflict)
    ));
    assert!(matches!(
        service.acknowledge("other", &id, &link_id, 2).await,
        Err(RequirementError::NotFound)
    ));
    let export = service.export(USER, &id).await.unwrap();
    assert!(export.markdown.contains("调整后的需求"));
    assert!(export.markdown.contains("待核对"));
    assert!(export.markdown.contains("/workspace/PRD.md"));
    assert!(export.filename.ends_with("-v2.md"));
    detail = service.unlink(USER, &id, &link_id, 2).await.unwrap();
    assert!(detail.links.is_empty());
}

#[tokio::test]
async fn concurrent_content_edits_have_one_winner_and_keep_the_audit_history() {
    let (service, _db) = setup().await;
    let detail = service.create(USER, "project", create_request(true)).await.unwrap();
    let id = &detail.card.id;
    let a = update_request(&detail, "编辑甲");
    let b = update_request(&detail, "编辑乙");
    let (a, b) = tokio::join!(service.update(USER, id, a), service.update(USER, id, b));
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    assert!(matches!(a, Err(RequirementError::Conflict)) || matches!(b, Err(RequirementError::Conflict)));
    let detail = service.get(USER, id).await.unwrap();
    assert_eq!(detail.card.revision, 2);
    assert_eq!(detail.versions.len(), 2);
    assert_eq!(detail.versions[0].snapshot.content.title, "保存筛选条件");
}

#[tokio::test]
async fn owned_sources_allow_cross_project_and_unbound_chats_but_reject_foreign_messages() {
    let (service, db) = setup().await;
    let conversations = SqliteConversationRepository::new(db.pool().clone());
    for (id, user, project) in [
        ("mine", USER, Some("project")),
        ("second-conv", USER, Some("second")),
        ("unbound-conv", USER, None),
        ("foreign-conv", "other", Some("foreign")),
    ] {
        conversations
            .create(&aionui_db::models::ConversationRow {
                id: id.into(),
                user_id: user.into(),
                name: id.into(),
                r#type: "acp".into(),
                extra: "{}".into(),
                model: None,
                status: Some("pending".into()),
                source: Some("aionui".into()),
                channel_chat_id: None,
                pinned: false,
                pinned_at: None,
                created_at: 1,
                updated_at: 1,
                project_id: project.map(String::from),
                folder_id: None,
                name_source: None,
            })
            .await
            .unwrap();
        conversations
            .insert_message(
                user,
                &aionui_db::models::MessageRow {
                    id: format!("{id}-database-message"),
                    conversation_id: id.into(),
                    msg_id: Some(format!("{id}-stream-message")),
                    r#type: "text".into(),
                    content: "{\"content\":\"complete original source text\"}".into(),
                    position: Some("left".into()),
                    status: Some("finish".into()),
                    hidden: false,
                    created_at: 1,
                    backend_turn_id: None,
                },
            )
            .await
            .unwrap();
    }
    // The source retains its actual identity, whether it belongs to this
    // project, a different owned project, or no project at all.
    for conversation_id in ["mine", "second-conv", "unbound-conv"] {
        for suffix in ["database-message", "stream-message"] {
            let mut request = create_request(true);
            request.sources = vec![RequirementSource {
                kind: "conversation".into(),
                label: "消息".into(),
                excerpt: "complete original source text".into(),
                conversation_id: Some(conversation_id.into()),
                message_id: Some(format!("{conversation_id}-{suffix}")),
                ..Default::default()
            }];
            let detail = service.create(USER, "project", request).await.unwrap();
            assert_eq!(detail.card.project_id, "project");
            assert_eq!(detail.card.sources[0].conversation_id.as_deref(), Some(conversation_id));
            assert_eq!(
                detail.card.sources[0].message_id,
                Some(format!("{conversation_id}-{suffix}"))
            );
            assert!(
                service
                    .export(USER, &detail.card.id)
                    .await
                    .unwrap()
                    .markdown
                    .contains("complete original source text")
            );
        }
    }
    for (conversation_id, message_id) in [
        ("foreign-conv", "foreign-conv-database-message"),
        ("foreign-conv", "foreign-conv-stream-message"),
        ("mine", "foreign-conv-database-message"),
        ("mine", "foreign-conv-stream-message"),
        ("mine", "second-conv-database-message"),
        ("mine", "nonexistent"),
    ] {
        let mut request = create_request(true);
        request.sources = vec![RequirementSource {
            kind: "conversation".into(),
            label: "消息".into(),
            conversation_id: Some(conversation_id.into()),
            message_id: Some(message_id.into()),
            ..Default::default()
        }];
        assert!(matches!(
            service.create(USER, "project", request).await,
            Err(RequirementError::NotFound)
        ));
    }
    let detail = service.create(USER, "project", create_request(true)).await.unwrap();
    let mut update = update_request(&detail, "从另一个项目补充来源");
    update.sources.push(RequirementSource {
        kind: "conversation".into(),
        label: "另一个已拥有项目的消息".into(),
        conversation_id: Some("second-conv".into()),
        message_id: Some("second-conv-stream-message".into()),
        ..Default::default()
    });
    let detail = service.update(USER, &detail.card.id, update).await.unwrap();
    assert_eq!(detail.card.revision, 2);
    let mut forged = update_request(&detail, "外国来源");
    forged.sources.last_mut().unwrap().conversation_id = Some("foreign-conv".into());
    forged.sources.last_mut().unwrap().message_id = Some("foreign-conv-stream-message".into());
    assert!(matches!(
        service.update(USER, &detail.card.id, forged).await,
        Err(RequirementError::NotFound)
    ));
    assert!(matches!(
        service.create(USER, "foreign", create_request(true)).await,
        Err(RequirementError::NotFound)
    ));
}

#[tokio::test]
async fn protected_routes_enforce_auth_and_csrf_before_mutation() {
    let (service, db) = setup().await;
    let jwt = Arc::new(JwtService::new("requirement-test-secret-only".into()));
    let auth = AuthState {
        jwt_service: jwt.clone(),
        user_repo: Arc::new(SqliteUserRepository::new(db.pool().clone())),
        identity_mode: AuthIdentityMode::UserSession,
        runtime_token_verifier: None,
    };
    let routes = requirement_routes(RequirementRouterState {
        service: service.clone(),
    })
    .route_layer(from_fn_with_state(auth, auth_middleware))
    .layer(from_fn_with_state(
        Arc::new(CookieConfig {
            secure: false,
            same_site: "Lax",
        }),
        csrf_middleware,
    ));
    let (status, body) = send(&routes, "GET", "/api/projects/project/requirements", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["code"], "UNAUTHORIZED");
    let (status, body) = send(
        &routes,
        "POST",
        "/api/projects/project/requirements",
        Some(json!({"content":{"title":"非法写入"}})),
    )
    .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["code"], "CSRF_INVALID");
    let token = jwt.sign(USER, "admin").unwrap();
    for invalid_csrf in [false, true] {
        let mut request = Request::builder()
            .method("POST")
            .uri("/api/projects/project/requirements")
            .header("authorization", format!("Bearer {token}"))
            .header("content-type", "application/json");
        if invalid_csrf {
            request = request
                .header("cookie", "aionui-csrf-token=one")
                .header("x-csrf-token", "two");
        }
        let response = routes
            .clone()
            .oneshot(
                request
                    .body(Body::from("{\"content\":{\"title\":\"CSRF blocked\"}}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    let request = Request::builder()
        .method("POST")
        .uri("/api/projects/project/requirements")
        .header("authorization", format!("Bearer {token}"))
        .header("content-type", "application/json")
        .header("cookie", "aionui-csrf-token=same")
        .header("x-csrf-token", "same")
        .body(Body::from("{\"content\":{\"title\":\"合法写入\"}}"))
        .unwrap();
    let response = routes.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    assert_eq!(service.list(USER, "project").await.unwrap().len(), 1);
}

#[tokio::test]
async fn project_deletion_cascades_cards_and_orphans_are_never_exposed() {
    let (service, db) = setup().await;
    let detail = service.create(USER, "project", create_request(true)).await.unwrap();
    sqlx::query("DELETE FROM projects WHERE project_id='project'")
        .execute(db.pool())
        .await
        .unwrap();
    assert!(matches!(
        service.get(USER, &detail.card.id).await,
        Err(RequirementError::NotFound)
    ));
    let (count,): (i64,) = sqlx::query_as("SELECT count(*) FROM requirement_cards WHERE id=?")
        .bind(&detail.card.id)
        .fetch_one(db.pool())
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn metadata_compare_and_swap_rejects_lost_updates_without_changing_content_revision() {
    use aionui_db::{DbError, IRequirementRepository, SaveRequirementParams};
    let (service, db) = setup().await;
    let detail = service.create(USER, "project", create_request(true)).await.unwrap();
    let repo = SqliteRequirementRepository::new(db.pool().clone());
    let original = repo.get(USER, &detail.card.id).await.unwrap().unwrap();
    let mut first = original.clone();
    let mut first_detail = detail.clone();
    first_detail.card.status = "review".into();
    first.payload = serde_json::to_string(&first_detail).unwrap();
    repo.save(SaveRequirementParams {
        row: &first,
        expected_payload: &original.payload,
    })
    .await
    .unwrap();
    let mut stale = original.clone();
    let mut stale_detail = detail;
    stale_detail.card.status = "archived".into();
    stale.payload = serde_json::to_string(&stale_detail).unwrap();
    assert!(matches!(
        repo.save(SaveRequirementParams {
            row: &stale,
            expected_payload: &original.payload
        })
        .await,
        Err(DbError::Conflict(_))
    ));
    let detail = service.get(USER, &first.id).await.unwrap();
    assert_eq!(detail.card.status, "review");
    assert_eq!(detail.card.revision, 1);
    assert_eq!(detail.versions.len(), 1);
}

#[tokio::test]
async fn deleting_source_chat_preserves_editable_historical_excerpt_but_not_forged_references() {
    let (service, db) = setup().await;
    let conversations = SqliteConversationRepository::new(db.pool().clone());
    conversations
        .create(&aionui_db::models::ConversationRow {
            id: "historical-chat".into(),
            user_id: USER.into(),
            name: "Source discussion".into(),
            r#type: "acp".into(),
            extra: "{}".into(),
            model: None,
            status: Some("pending".into()),
            source: Some("aionui".into()),
            channel_chat_id: None,
            pinned: false,
            pinned_at: None,
            created_at: 1,
            updated_at: 1,
            project_id: Some("project".into()),
            folder_id: None,
            name_source: None,
        })
        .await
        .unwrap();
    let excerpt = "完整的历史需求摘录：保存筛选条件，刷新后恢复；此原文应在删除聊天后继续保留。";
    conversations
        .insert_message(
            USER,
            &aionui_db::models::MessageRow {
                id: "historical-message".into(),
                conversation_id: "historical-chat".into(),
                msg_id: Some("historical-stream-id".into()),
                r#type: "text".into(),
                content: serde_json::json!({"content":excerpt}).to_string(),
                position: Some("right".into()),
                status: Some("finish".into()),
                hidden: false,
                created_at: 1,
                backend_turn_id: None,
            },
        )
        .await
        .unwrap();
    let mut request = create_request(true);
    request.sources = vec![RequirementSource {
        id: "verified-source".into(),
        kind: "conversation".into(),
        label: "历史需求对话".into(),
        excerpt: excerpt.into(),
        conversation_id: Some("historical-chat".into()),
        message_id: Some("historical-stream-id".into()),
        ..Default::default()
    }];
    let detail = service.create(USER, "project", request).await.unwrap();
    conversations.delete(USER, "historical-chat").await.unwrap();
    assert!(conversations.get(USER, "historical-chat").await.unwrap().is_none());
    assert!(
        conversations
            .get_message(USER, "historical-chat", "historical-message")
            .await
            .unwrap()
            .is_none()
    );
    let updated = service
        .update(USER, &detail.card.id, update_request(&detail, "删除原聊天后的内容修订"))
        .await
        .unwrap();
    assert_eq!(updated.card.revision, 2);
    assert_eq!(updated.card.sources, detail.card.sources);
    assert_eq!(updated.versions[1].snapshot.sources[0].excerpt, excerpt);
    let export = service.export(USER, &detail.card.id).await.unwrap();
    assert!(export.markdown.contains(excerpt));
    assert!(export.markdown.contains("删除原聊天后的内容修订"));
    assert!(matches!(
        service
            .update("other", &detail.card.id, update_request(&updated, "跨用户尝试"))
            .await,
        Err(RequirementError::NotFound)
    ));
    for field in ["id", "conversation_id", "message_id"] {
        let mut forged = update_request(&updated, "伪造引用");
        match field {
            "id" => forged.sources[0].id = "new-unverified-source".into(),
            "conversation_id" => forged.sources[0].conversation_id = Some("missing-chat".into()),
            _ => forged.sources[0].message_id = Some("different-message".into()),
        }
        assert!(matches!(
            service.update(USER, &detail.card.id, forged).await,
            Err(RequirementError::NotFound)
        ));
    }
    let persisted = service.get(USER, &detail.card.id).await.unwrap();
    assert_eq!(persisted.card.revision, 2);
    assert_eq!(persisted.card.sources[0].excerpt, excerpt);
    assert_eq!(persisted.versions.len(), 2);
}
