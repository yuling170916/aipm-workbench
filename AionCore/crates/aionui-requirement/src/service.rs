use std::collections::HashSet;
use std::fmt::Write;
use std::sync::Arc;

use aionui_api_types::*;
use aionui_common::{generate_id, now_ms};
use aionui_db::{
    IConversationRepository, IProjectStore, IRequirementRepository, SaveRequirementParams, models::RequirementRow,
};

use crate::RequirementError;

#[derive(Clone)]
pub struct RequirementService {
    repo: Arc<dyn IRequirementRepository>,
    projects: Arc<dyn IProjectStore>,
    conversations: Arc<dyn IConversationRepository>,
}

impl RequirementService {
    pub fn new(
        repo: Arc<dyn IRequirementRepository>,
        projects: Arc<dyn IProjectStore>,
        conversations: Arc<dyn IConversationRepository>,
    ) -> Self {
        Self {
            repo,
            projects,
            conversations,
        }
    }

    async fn project(&self, user: &str, project: &str) -> Result<(), RequirementError> {
        self.projects
            .get_project(user, project)
            .await?
            .ok_or(RequirementError::NotFound)?;
        Ok(())
    }

    pub async fn list(&self, user: &str, project: &str) -> Result<Vec<RequirementCard>, RequirementError> {
        self.project(user, project).await?;
        self.repo
            .list(user, project)
            .await?
            .into_iter()
            .map(|row| decode(&row).map(|detail| detail.card))
            .collect()
    }

    async fn load(&self, user: &str, id: &str) -> Result<(RequirementRow, RequirementDetail), RequirementError> {
        let row = self.repo.get(user, id).await?.ok_or(RequirementError::NotFound)?;
        self.project(user, &row.project_id).await?;
        let detail = decode(&row)?;
        Ok((row, detail))
    }

    pub async fn get(&self, user: &str, id: &str) -> Result<RequirementDetail, RequirementError> {
        Ok(self.load(user, id).await?.1)
    }

    pub async fn create(
        &self,
        user: &str,
        project: &str,
        mut request: CreateRequirementRequest,
    ) -> Result<RequirementDetail, RequirementError> {
        self.project(user, project).await?;
        self.validate_card(
            user,
            &request.content,
            &mut request.sources,
            &mut request.questions,
            &[],
        )
        .await?;
        let id = generate_id();
        let now = now_ms();
        let card = RequirementCard {
            number: format!("REQ-{}", &id[id.len() - 8..].to_uppercase()),
            id,
            project_id: project.into(),
            revision: 1,
            status: "draft".into(),
            content: request.content,
            sources: request.sources,
            questions: request.questions,
            created_at: now,
            updated_at: now,
        };
        let mut detail = RequirementDetail {
            card,
            checks: vec![],
            versions: vec![],
            links: vec![],
        };
        snapshot(&mut detail);
        self.repo.insert(&encode(user, &detail)?).await?;
        tracing::info!(requirement_id = %detail.card.id, revision = 1, "Requirement created");
        Ok(detail)
    }

    async fn validate_card(
        &self,
        user: &str,
        content: &RequirementContent,
        sources: &mut [RequirementSource],
        questions: &mut [RequirementQuestion],
        historical_sources: &[RequirementSource],
    ) -> Result<(), RequirementError> {
        if content.title.trim().is_empty() {
            return invalid("Title is required");
        }
        if content.title.chars().count() > 300 {
            return invalid("Title exceeds 300 characters");
        }
        for (_, value) in fields(content) {
            if value.chars().count() > 30000 {
                return invalid("Content field exceeds 30000 characters");
            }
        }
        if content.priority.as_ref().is_some_and(|v| v.chars().count() > 100) {
            return invalid("Priority exceeds 100 characters");
        }
        if sources.len() > 100 || questions.len() > 100 {
            return invalid("Maximum 100 sources and questions");
        }
        let mut ids = HashSet::new();
        for source in sources {
            if source.id.is_empty() {
                source.id = generate_id();
            }
            if source.id.len() > 100 || !ids.insert(source.id.clone()) {
                return invalid("Invalid or duplicate source id");
            }
            if source
                .path
                .as_ref()
                .is_some_and(|path| path.len() > 4096 || path.contains('\0'))
                || source.conversation_id.as_ref().is_some_and(|value| value.len() > 100)
                || source.message_id.as_ref().is_some_and(|value| value.len() > 100)
            {
                return invalid("Source reference exceeds size limit");
            }
            if !["conversation", "file", "user", "ai"].contains(&source.kind.as_str()) {
                return invalid("Invalid source kind");
            }
            if source.label.trim().is_empty() || source.label.len() > 1000 || source.excerpt.len() > 60000 {
                return invalid("Invalid source label or excerpt");
            }
            if source.fields.iter().any(|field| !is_field(field)) || source.fields.len() > 10 {
                return invalid("Invalid source field");
            }
            if source.kind == "file"
                && source
                    .path
                    .as_deref()
                    .is_none_or(|path| path.trim().is_empty() || path.len() > 4096)
            {
                return invalid("File source requires a path");
            }
            if source.kind == "conversation" && source.conversation_id.is_none() {
                return invalid("Conversation source requires conversation_id");
            }
            if source.message_id.is_some() && source.conversation_id.is_none() {
                return invalid("message_id requires conversation_id");
            }
            // The card owns its historical excerpt. Deleting the original chat
            // must not make the card uneditable; only an unchanged, previously
            // authorized reference identity may bypass a new resource lookup.
            let historical_reference = historical_sources.iter().any(|previous| {
                previous.id == source.id
                    && previous.conversation_id == source.conversation_id
                    && previous.message_id == source.message_id
            });
            if !historical_reference && let Some(conversation_id) = &source.conversation_id {
                // A user's unbound chat or another owned project may supply a
                // requirement. Source access is user-scoped, while the card's
                // destination project was independently authorized above.
                self.conversations
                    .get(user, conversation_id)
                    .await?
                    .ok_or(RequirementError::NotFound)?;
                if let Some(message_id) = &source.message_id {
                    let message = self
                        .conversations
                        .get_message(user, conversation_id, message_id)
                        .await?;
                    // Live bubbles carry a stream msg_id; history carries a DB id.
                    // Both lookups enforce the same user and conversation scope.
                    if message.is_none()
                        && self
                            .conversations
                            .get_message_by_msg_id_any(user, conversation_id, message_id)
                            .await?
                            .is_none()
                    {
                        return Err(RequirementError::NotFound);
                    }
                }
            }
        }
        ids.clear();
        for question in questions {
            if question.id.is_empty() {
                question.id = generate_id();
            }
            if question.id.len() > 100 || !ids.insert(question.id.clone()) {
                return invalid("Invalid or duplicate question id");
            }
            if question.text.trim().is_empty() || question.text.len() > 10000 || question.answer.len() > 30000 {
                return invalid("Invalid question");
            }
            if question.resolved && question.answer.trim().is_empty() {
                return invalid("Resolved questions require an answer");
            }
        }
        Ok(())
    }

    pub async fn update(
        &self,
        user: &str,
        id: &str,
        mut request: UpdateRequirementRequest,
    ) -> Result<RequirementDetail, RequirementError> {
        let (row, mut detail) = self.load(user, id).await?;
        revision(&detail, request.expected_revision)?;
        self.validate_card(
            user,
            &request.content,
            &mut request.sources,
            &mut request.questions,
            &detail.card.sources,
        )
        .await?;
        if request
            .status
            .as_deref()
            .is_some_and(|status| !["draft", "review", "archived"].contains(&status))
        {
            return invalid("Invalid editable status");
        }
        let changed = detail.card.content != request.content
            || detail.card.sources != request.sources
            || detail.card.questions != request.questions;
        detail.card.content = request.content;
        detail.card.sources = request.sources;
        detail.card.questions = request.questions;
        if changed {
            detail.card.revision += 1;
            detail.card.status = if detail.card.status == "confirmed" {
                "review".into()
            } else {
                request.status.clone().unwrap_or_else(|| "draft".into())
            };
            for link in &mut detail.links {
                link.needs_review = true;
                link.updated_at = now_ms();
            }
        } else if let Some(status) = request.status {
            detail.card.status = status;
        }
        detail.card.updated_at = now_ms();
        if changed {
            snapshot(&mut detail);
        }
        self.save(user, &row, detail).await
    }

    async fn save(
        &self,
        user: &str,
        previous: &RequirementRow,
        detail: RequirementDetail,
    ) -> Result<RequirementDetail, RequirementError> {
        let row = encode(user, &detail)?;
        self.repo
            .save(SaveRequirementParams {
                row: &row,
                expected_payload: &previous.payload,
            })
            .await?;
        tracing::info!(requirement_id = %detail.card.id, revision = detail.card.revision, "Requirement updated");
        Ok(detail)
    }

    pub async fn delete(
        &self,
        user: &str,
        id: &str,
        expected: i64,
    ) -> Result<DeleteRequirementResponse, RequirementError> {
        let (row, detail) = self.load(user, id).await?;
        revision(&detail, expected)?;
        self.repo.delete(user, id, &row.payload).await?;
        tracing::info!(requirement_id = %id, "Requirement deleted");
        Ok(DeleteRequirementResponse { deleted: true })
    }

    pub async fn check(
        &self,
        user: &str,
        id: &str,
        request: CheckRequirementRequest,
    ) -> Result<RequirementDetail, RequirementError> {
        let (row, mut detail) = self.load(user, id).await?;
        revision(&detail, request.expected_revision)?;
        editable(&detail)?;
        let kind = request.kind.as_deref().unwrap_or("rules");
        if !["rules", "ai"].contains(&kind) {
            return invalid("Invalid check kind");
        }
        if request.based_on_revision.is_some_and(|v| v != detail.card.revision)
            || (kind == "ai" && request.based_on_revision.is_none())
        {
            return Err(RequirementError::Conflict);
        }
        let mut issues = if kind == "rules" {
            rule_issues(&detail.card)
        } else {
            request.issues
        };
        if issues.len() > 100 || request.summary.len() > 30000 {
            return invalid("Check exceeds size limit");
        }
        for issue in &mut issues {
            if !is_field(&issue.field) && issue.field != "general" {
                return invalid("Invalid issue field");
            }
            if !["blocking", "warning", "info"].contains(&issue.severity.as_str())
                || issue.message.trim().is_empty()
                || issue.message.len() > 10000
                || issue.suggestion.len() > 10000
            {
                return invalid("Invalid check issue");
            }
            issue.id = generate_id();
            issue.status = "open".into();
            issue.resolution.clear();
        }
        detail.checks.push(RequirementCheck {
            id: generate_id(),
            kind: kind.into(),
            based_on_revision: detail.card.revision,
            summary: if kind == "rules" {
                format!("规则体检发现 {} 项问题", issues.len())
            } else {
                request.summary
            },
            issues,
            created_at: now_ms(),
        });
        detail.card.status = "review".into();
        detail.card.updated_at = now_ms();
        self.save(user, &row, detail).await
    }

    pub async fn resolve_issue(
        &self,
        user: &str,
        id: &str,
        check_id: &str,
        issue_id: &str,
        request: ResolveRequirementIssueRequest,
    ) -> Result<RequirementDetail, RequirementError> {
        let (row, mut detail) = self.load(user, id).await?;
        revision(&detail, request.expected_revision)?;
        editable(&detail)?;
        if !["open", "resolved", "accepted"].contains(&request.status.as_str()) {
            return invalid("Invalid issue status");
        }
        if request.status != "open" && request.resolution.trim().is_empty() {
            return invalid("Resolved or accepted issues require a resolution");
        }
        if request.resolution.len() > 10000 {
            return invalid("Resolution exceeds size limit");
        }
        let check_index = detail
            .checks
            .iter()
            .position(|check| check.id == check_id)
            .ok_or(RequirementError::NotFound)?;
        let check = &detail.checks[check_index];
        if check.based_on_revision != detail.card.revision {
            return Err(RequirementError::Conflict);
        }
        let is_latest = !detail.checks[check_index + 1..]
            .iter()
            .any(|other| other.kind == check.kind && other.based_on_revision == detail.card.revision);
        let check = &mut detail.checks[check_index];
        let issue = check
            .issues
            .iter_mut()
            .find(|issue| issue.id == issue_id)
            .ok_or(RequirementError::NotFound)?;
        let reopen_blocking = is_latest && issue.severity == "blocking" && request.status == "open";
        issue.status = request.status;
        issue.resolution = request.resolution;
        if reopen_blocking && detail.card.status == "confirmed" {
            detail.card.status = "review".into();
        }
        detail.card.updated_at = now_ms();
        self.save(user, &row, detail).await
    }

    pub async fn confirm(&self, user: &str, id: &str, expected: i64) -> Result<RequirementDetail, RequirementError> {
        let (row, mut detail) = self.load(user, id).await?;
        revision(&detail, expected)?;
        editable(&detail)?;
        if detail
            .card
            .questions
            .iter()
            .any(|q| !q.resolved || q.answer.trim().is_empty())
        {
            return blocked("Unanswered questions remain");
        }
        if fields(&detail.card.content)
            .iter()
            .any(|(name, value)| *name != "exceptions" && value.trim().is_empty())
        {
            return blocked("Required fields are incomplete");
        }
        let latest_rules = detail
            .checks
            .iter()
            .rev()
            .find(|c| c.kind == "rules" && c.based_on_revision == expected);
        if latest_rules.is_none() {
            return blocked("Run local rules on the current revision before confirming");
        }
        for kind in ["rules", "ai"] {
            if detail
                .checks
                .iter()
                .rev()
                .find(|c| c.kind == kind && c.based_on_revision == expected)
                .is_some_and(|c| c.issues.iter().any(|i| i.severity == "blocking" && i.status == "open"))
            {
                return blocked("Open blocking issues remain");
            }
        }
        detail.card.status = "confirmed".into();
        detail.card.updated_at = now_ms();
        self.save(user, &row, detail).await
    }

    pub async fn link(
        &self,
        user: &str,
        id: &str,
        request: CreateRequirementLinkRequest,
    ) -> Result<RequirementDetail, RequirementError> {
        let (row, mut detail) = self.load(user, id).await?;
        revision(&detail, request.expected_revision)?;
        if !["file", "document"].contains(&request.kind.as_str())
            || request.label.trim().is_empty()
            || request.label.len() > 1000
            || request.path.trim().is_empty()
            || request.path.len() > 4096
            || request.path.contains('\0')
        {
            return invalid("Invalid document reference");
        }
        if detail.links.len() >= 100 {
            return invalid("Maximum 100 document references");
        }
        if detail.links.iter().any(|link| link.path == request.path) {
            return invalid("Document reference already exists");
        }
        let now = now_ms();
        detail.links.push(RequirementLink {
            id: generate_id(),
            kind: request.kind,
            label: request.label,
            path: request.path,
            needs_review: true,
            synced_revision: 0,
            created_at: now,
            updated_at: now,
        });
        detail.card.updated_at = now;
        self.save(user, &row, detail).await
    }

    pub async fn unlink(
        &self,
        user: &str,
        id: &str,
        link_id: &str,
        expected: i64,
    ) -> Result<RequirementDetail, RequirementError> {
        let (row, mut detail) = self.load(user, id).await?;
        revision(&detail, expected)?;
        let index = detail
            .links
            .iter()
            .position(|link| link.id == link_id)
            .ok_or(RequirementError::NotFound)?;
        detail.links.remove(index);
        detail.card.updated_at = now_ms();
        self.save(user, &row, detail).await
    }

    pub async fn acknowledge(
        &self,
        user: &str,
        id: &str,
        link_id: &str,
        expected: i64,
    ) -> Result<RequirementDetail, RequirementError> {
        let (row, mut detail) = self.load(user, id).await?;
        revision(&detail, expected)?;
        let link = detail
            .links
            .iter_mut()
            .find(|link| link.id == link_id)
            .ok_or(RequirementError::NotFound)?;
        link.needs_review = false;
        link.synced_revision = detail.card.revision;
        link.updated_at = now_ms();
        detail.card.updated_at = now_ms();
        self.save(user, &row, detail).await
    }

    pub async fn export(&self, user: &str, id: &str) -> Result<RequirementExport, RequirementError> {
        let detail = self.get(user, id).await?;
        let card = &detail.card;
        let mut markdown = format!(
            "# {}\n\n- 编号：{}\n- 版本：{}\n- 状态：{}\n\n",
            card.content.title, card.number, card.revision, card.status
        );
        let labels = [
            "标题",
            "目标用户",
            "使用场景",
            "问题",
            "目标",
            "需求范围",
            "业务规则",
            "异常边界",
            "验收标准",
        ];
        for ((_, value), label) in fields(&card.content).into_iter().zip(labels) {
            let _ = writeln!(
                markdown,
                "## {label}\n\n{}\n",
                if value.trim().is_empty() { "待确认" } else { value }
            );
        }
        if let Some(priority) = &card.content.priority {
            let _ = writeln!(markdown, "## 优先级\n\n{priority}\n");
        }
        markdown.push_str("## 信息来源\n\n");
        for source in &card.sources {
            let _ = writeln!(
                markdown,
                "- {}（{}）：{}",
                source.label,
                source.kind,
                source.excerpt.replace('\n', " ")
            );
        }
        markdown.push_str("\n## 待确认问题\n\n");
        for question in &card.questions {
            let _ = writeln!(
                markdown,
                "- [{}] {}：{}",
                if question.resolved { "x" } else { " " },
                question.text,
                question.answer
            );
        }
        markdown.push_str("\n## 体检记录\n\n");
        for check in &detail.checks {
            let _ = writeln!(
                markdown,
                "### {} / 版本 {}\n\n{}\n",
                check.kind, check.based_on_revision, check.summary
            );
            for issue in &check.issues {
                let _ = writeln!(
                    markdown,
                    "- [{} / {}] {} — {}",
                    issue.severity, issue.status, issue.message, issue.resolution
                );
            }
        }
        markdown.push_str("\n## 关联文档\n\n");
        for link in &detail.links {
            let _ = writeln!(
                markdown,
                "- {}：{}（{}，已同步版本 {}）",
                link.label,
                link.path,
                if link.needs_review {
                    "待核对"
                } else {
                    "人工标记已同步"
                },
                link.synced_revision
            );
        }
        Ok(RequirementExport {
            filename: format!("{}-v{}.md", card.number, card.revision),
            markdown,
        })
    }
}

fn fields(content: &RequirementContent) -> [(&'static str, &str); 9] {
    [
        ("title", &content.title),
        ("audience", &content.audience),
        ("scenario", &content.scenario),
        ("problem", &content.problem),
        ("goal", &content.goal),
        ("scope", &content.scope),
        ("rules", &content.rules),
        ("exceptions", &content.exceptions),
        ("acceptance", &content.acceptance),
    ]
}
fn is_field(field: &str) -> bool {
    [
        "title",
        "audience",
        "scenario",
        "problem",
        "goal",
        "scope",
        "rules",
        "exceptions",
        "acceptance",
        "priority",
        "sources",
        "questions",
    ]
    .contains(&field)
}
fn invalid<T>(reason: &str) -> Result<T, RequirementError> {
    Err(RequirementError::Invalid(reason.into()))
}
fn blocked<T>(reason: &str) -> Result<T, RequirementError> {
    Err(RequirementError::ConfirmBlocked(reason.into()))
}
fn revision(detail: &RequirementDetail, expected: i64) -> Result<(), RequirementError> {
    if expected != detail.card.revision {
        Err(RequirementError::Conflict)
    } else {
        Ok(())
    }
}
fn editable(detail: &RequirementDetail) -> Result<(), RequirementError> {
    if detail.card.status == "archived" {
        invalid("Archived cards must be reopened before review")
    } else {
        Ok(())
    }
}
fn decode(row: &RequirementRow) -> Result<RequirementDetail, RequirementError> {
    serde_json::from_str(&row.payload).map_err(|_| RequirementError::Internal)
}
fn encode(user: &str, detail: &RequirementDetail) -> Result<RequirementRow, RequirementError> {
    Ok(RequirementRow {
        id: detail.card.id.clone(),
        project_id: detail.card.project_id.clone(),
        user_id: user.into(),
        revision: detail.card.revision,
        payload: serde_json::to_string(detail).map_err(|_| RequirementError::Internal)?,
        created_at: detail.card.created_at,
        updated_at: detail.card.updated_at,
    })
}
fn snapshot(detail: &mut RequirementDetail) {
    detail.versions.push(RequirementVersion {
        id: generate_id(),
        revision: detail.card.revision,
        created_at: now_ms(),
        snapshot: detail.card.clone(),
    });
}
fn issue(field: &str, severity: &str, message: &str, suggestion: &str) -> RequirementIssue {
    RequirementIssue {
        field: field.into(),
        severity: severity.into(),
        message: message.into(),
        suggestion: suggestion.into(),
        ..Default::default()
    }
}
fn rule_issues(card: &RequirementCard) -> Vec<RequirementIssue> {
    let mut issues = vec![];
    for (field, value) in fields(&card.content) {
        if field != "exceptions" && value.trim().is_empty() {
            issues.push(issue(
                field,
                "blocking",
                "必填信息尚未补充",
                "明确该字段的内容后重新运行规则体检",
            ));
        }
        if ["尽快", "合理", "适当", "大概", "尽量", "友好", "待定", "待补充", "TBD"]
            .iter()
            .any(|term| value.contains(term))
        {
            issues.push(issue(
                field,
                "warning",
                "存在模糊或待定表达",
                "补充明确条件、数量、边界或时间",
            ));
        }
    }
    if card.questions.iter().any(|q| !q.resolved) {
        issues.push(issue(
            "questions",
            "blocking",
            "仍有待确认问题",
            "向相关人员核实并填写回答",
        ));
    }
    if card.sources.is_empty() || card.sources.iter().all(|source| source.kind == "ai") {
        issues.push(issue(
            "sources",
            "warning",
            "缺少可追溯的人工或原始信息来源",
            "补充对话、文件或人工核实来源；AI 推测不可当作已核实事实",
        ));
    }
    if !card.content.acceptance.trim().is_empty() && card.content.acceptance.chars().count() < 12 {
        issues.push(issue(
            "acceptance",
            "warning",
            "验收标准过于简略",
            "写出操作条件、预期结果以及可判断是否通过的标准",
        ));
    }
    if card.content.exceptions.trim().is_empty() {
        issues.push(issue(
            "exceptions",
            "warning",
            "尚未说明异常或边界条件",
            "检查无权限、空数据、失败和重复操作等情况",
        ));
    }
    issues
}
