#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RequirementRow {
    pub id: String,
    pub project_id: String,
    pub user_id: String,
    pub revision: i64,
    pub payload: String,
    pub created_at: i64,
    pub updated_at: i64,
}
