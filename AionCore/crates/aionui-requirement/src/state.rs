use crate::RequirementService;
use std::sync::Arc;
#[derive(Clone)]
pub struct RequirementRouterState {
    pub service: Arc<RequirementService>,
}
