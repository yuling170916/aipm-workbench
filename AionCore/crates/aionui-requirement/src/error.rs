#[derive(Debug, thiserror::Error)]
pub enum RequirementError {
    #[error("Requirement or project not found")]
    NotFound,
    #[error("{0}")]
    Invalid(String),
    #[error("Requirement changed; refresh and try again")]
    Conflict,
    #[error("{0}")]
    ConfirmBlocked(String),
    #[error("Requirement service unavailable")]
    Internal,
}
impl From<aionui_db::DbError> for RequirementError {
    fn from(error: aionui_db::DbError) -> Self {
        match error {
            aionui_db::DbError::NotFound(_) => Self::NotFound,
            aionui_db::DbError::Conflict(_) => Self::Conflict,
            other => {
                tracing::error!(error = %other, "Requirement storage operation failed");
                Self::Internal
            }
        }
    }
}
