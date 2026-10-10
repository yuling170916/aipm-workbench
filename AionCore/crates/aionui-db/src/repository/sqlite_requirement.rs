use super::requirement::{IRequirementRepository, SaveRequirementParams};
use crate::{DbError, models::RequirementRow};
use async_trait::async_trait;
use sqlx::SqlitePool;

pub struct SqliteRequirementRepository {
    pool: SqlitePool,
}
impl SqliteRequirementRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}
#[async_trait]
impl IRequirementRepository for SqliteRequirementRepository {
    async fn list(&self, user: &str, project: &str) -> Result<Vec<RequirementRow>, DbError> {
        Ok(sqlx::query_as::<_, RequirementRow>("SELECT r.* FROM requirement_cards r JOIN projects p ON p.project_id=r.project_id AND p.user_id=r.user_id WHERE r.user_id=? AND r.project_id=? ORDER BY r.updated_at DESC,r.id DESC")
            .bind(user).bind(project).fetch_all(&self.pool).await?)
    }
    async fn get(&self, user: &str, id: &str) -> Result<Option<RequirementRow>, DbError> {
        Ok(sqlx::query_as::<_, RequirementRow>("SELECT r.* FROM requirement_cards r JOIN projects p ON p.project_id=r.project_id AND p.user_id=r.user_id WHERE r.user_id=? AND r.id=?")
            .bind(user).bind(id).fetch_optional(&self.pool).await?)
    }
    async fn insert(&self, row: &RequirementRow) -> Result<(), DbError> {
        let result=sqlx::query("INSERT INTO requirement_cards(id,project_id,user_id,revision,payload,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE project_id=? AND user_id=?)")
            .bind(&row.id).bind(&row.project_id).bind(&row.user_id).bind(row.revision).bind(&row.payload).bind(row.created_at).bind(row.updated_at).bind(&row.project_id).bind(&row.user_id).execute(&self.pool).await?;
        if result.rows_affected() != 1 {
            return Err(DbError::NotFound("project".into()));
        }
        Ok(())
    }
    async fn save(&self, params: SaveRequirementParams<'_>) -> Result<(), DbError> {
        let row = params.row;
        let result=sqlx::query("UPDATE requirement_cards SET revision=?,payload=?,updated_at=? WHERE id=? AND user_id=? AND payload=? AND EXISTS(SELECT 1 FROM projects p WHERE p.project_id=requirement_cards.project_id AND p.user_id=?)")
            .bind(row.revision).bind(&row.payload).bind(row.updated_at).bind(&row.id).bind(&row.user_id).bind(params.expected_payload).bind(&row.user_id).execute(&self.pool).await?;
        if result.rows_affected() != 1 {
            return Err(DbError::Conflict("requirement changed".into()));
        }
        Ok(())
    }
    async fn delete(&self, user: &str, id: &str, expected_payload: &str) -> Result<(), DbError> {
        let result=sqlx::query("DELETE FROM requirement_cards WHERE id=? AND user_id=? AND payload=? AND EXISTS(SELECT 1 FROM projects p WHERE p.project_id=requirement_cards.project_id AND p.user_id=?)")
            .bind(id).bind(user).bind(expected_payload).bind(user).execute(&self.pool).await?;
        if result.rows_affected() != 1 {
            return Err(DbError::Conflict("requirement changed".into()));
        }
        Ok(())
    }
}
