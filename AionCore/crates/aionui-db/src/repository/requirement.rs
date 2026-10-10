use crate::{DbError, models::RequirementRow};
use async_trait::async_trait;

/// The old payload participates in every compare-and-swap, including writes
/// that leave the content revision unchanged (issue decisions and link status).
pub struct SaveRequirementParams<'a> {
    pub row: &'a RequirementRow,
    pub expected_payload: &'a str,
}
#[async_trait]
pub trait IRequirementRepository: Send + Sync {
    async fn list(&self, user_id: &str, project_id: &str) -> Result<Vec<RequirementRow>, DbError>;
    async fn get(&self, user_id: &str, id: &str) -> Result<Option<RequirementRow>, DbError>;
    async fn insert(&self, row: &RequirementRow) -> Result<(), DbError>;
    async fn save(&self, params: SaveRequirementParams<'_>) -> Result<(), DbError>;
    async fn delete(&self, user_id: &str, id: &str, expected_payload: &str) -> Result<(), DbError>;
}
