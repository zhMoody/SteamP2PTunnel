use crate::app_state::{AppState, ChatMessage, TunnelState};
use crate::error::{AppError, AppResult};
use chrono::Local;
use tauri::{Emitter, State};

/// 发送聊天消息到当前所在大厅
#[tauri::command]
pub fn send_chat_message(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    text: String,
) -> AppResult<()> {
    let tunnel_state = *state.state.lock();
    let lobby_id = match tunnel_state {
        TunnelState::Hosting(id) => id,
        TunnelState::Joined(id) => id,
        TunnelState::Idle => return Err(AppError::Lobby("不在大厅中".to_string())),
    };

    if text.trim().is_empty() || text.len() > 4000 {
        return Err(AppError::Network("消息为空或超过 4KB 限制".to_string()));
    }

    state
        .steam_client
        .matchmaking()
        .send_lobby_chat_message(lobby_id, text.as_bytes())
        .map_err(|e| AppError::Network(format!("发送消息失败: {:?}", e)))?;

    // 立即加入本地聊天记录并推送到前端
    let my_id = state.steam_client.user().steam_id();
    let my_name = state.steam_client.friends().get_friend(my_id).name();
    let msg = ChatMessage {
        sender_id: my_id.raw().to_string(),
        sender_name: my_name,
        text,
        timestamp: Local::now().format("%H:%M:%S").to_string(),
    };
    state.chat_history.lock().push(msg.clone());
    let _ = app_handle.emit("chat-message", msg);

    Ok(())
}

/// 获取聊天记录
#[tauri::command]
pub fn get_chat_history(state: State<'_, AppState>) -> Vec<ChatMessage> {
    state.chat_history.lock().iter().cloned().collect()
}
