use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Steam API error: {0}")]
    Steam(#[from] steamworks::SteamError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Lobby error: {0}")]
    Lobby(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        #[derive(Serialize)]
        struct StructuredError {
            #[serde(rename = "type")]
            error_type: String,
            message: String,
        }

        let error_type = match self {
            AppError::Steam(_) => "Steam",
            AppError::Io(_) => "IO",
            AppError::Network(_) => "Network",
            AppError::Internal(_) => "Internal",
            AppError::Parse(_) => "Parse",
            AppError::Lobby(_) => "Lobby",
        };

        StructuredError {
            error_type: error_type.to_string(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
