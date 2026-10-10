use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct RequirementContent {
    pub title: String,
    pub audience: String,
    pub scenario: String,
    pub problem: String,
    pub goal: String,
    pub scope: String,
    pub rules: String,
    pub exceptions: String,
    pub acceptance: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
}
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct RequirementSource {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub excerpt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub fields: Vec<String>,
}
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct RequirementQuestion {
    pub id: String,
    pub text: String,
    pub resolved: bool,
    pub answer: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequirementCard {
    pub id: String,
    pub project_id: String,
    pub number: String,
    pub revision: i64,
    pub status: String,
    pub content: RequirementContent,
    pub sources: Vec<RequirementSource>,
    pub questions: Vec<RequirementQuestion>,
    pub created_at: i64,
    pub updated_at: i64,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct RequirementIssue {
    pub id: String,
    pub field: String,
    pub severity: String,
    pub message: String,
    pub suggestion: String,
    pub status: String,
    pub resolution: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequirementCheck {
    pub id: String,
    pub kind: String,
    pub based_on_revision: i64,
    pub summary: String,
    pub issues: Vec<RequirementIssue>,
    pub created_at: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequirementVersion {
    pub id: String,
    pub revision: i64,
    pub created_at: i64,
    pub snapshot: RequirementCard,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequirementLink {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub path: String,
    pub needs_review: bool,
    pub synced_revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequirementDetail {
    pub card: RequirementCard,
    pub checks: Vec<RequirementCheck>,
    pub versions: Vec<RequirementVersion>,
    pub links: Vec<RequirementLink>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateRequirementRequest {
    pub content: RequirementContent,
    #[serde(default)]
    pub sources: Vec<RequirementSource>,
    #[serde(default)]
    pub questions: Vec<RequirementQuestion>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateRequirementRequest {
    pub expected_revision: i64,
    pub content: RequirementContent,
    pub sources: Vec<RequirementSource>,
    pub questions: Vec<RequirementQuestion>,
    pub status: Option<String>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequirementRevisionRequest {
    pub expected_revision: i64,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CheckRequirementRequest {
    pub expected_revision: i64,
    pub kind: Option<String>,
    pub based_on_revision: Option<i64>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub issues: Vec<RequirementIssue>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResolveRequirementIssueRequest {
    pub expected_revision: i64,
    pub status: String,
    pub resolution: String,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateRequirementLinkRequest {
    pub expected_revision: i64,
    pub kind: String,
    pub label: String,
    pub path: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct RequirementExport {
    pub filename: String,
    pub markdown: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct DeleteRequirementResponse {
    pub deleted: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_optional_fields_are_omitted_from_frontend_json() {
        let content = serde_json::to_value(RequirementContent::default()).unwrap();
        assert!(!content.as_object().unwrap().contains_key("priority"));
        let source = serde_json::to_value(RequirementSource::default()).unwrap();
        for field in ["conversation_id", "message_id", "path"] {
            assert!(!source.as_object().unwrap().contains_key(field));
        }
        let present = RequirementSource {
            conversation_id: Some("conversation".into()),
            message_id: Some("message".into()),
            path: Some("/workspace/source.md".into()),
            ..Default::default()
        };
        let json = serde_json::to_value(present).unwrap();
        assert_eq!(json["conversation_id"], "conversation");
        assert_eq!(json["message_id"], "message");
        assert_eq!(json["path"], "/workspace/source.md");
    }

    #[test]
    fn legacy_null_fields_deserialize_and_reserialize_as_omitted() {
        let content: RequirementContent = serde_json::from_str(r#"{"title":"Requirement","priority":null}"#).unwrap();
        assert!(
            !serde_json::to_value(content)
                .unwrap()
                .as_object()
                .unwrap()
                .contains_key("priority")
        );
        let source: RequirementSource =
            serde_json::from_str(r#"{"kind":"user","conversation_id":null,"message_id":null,"path":null}"#).unwrap();
        let source = serde_json::to_value(source).unwrap();
        for field in ["conversation_id", "message_id", "path"] {
            assert!(!source.as_object().unwrap().contains_key(field));
        }
    }
}
