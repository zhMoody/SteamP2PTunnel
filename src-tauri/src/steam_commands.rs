use crate::app_state::{AppState, TunnelState};
use crate::error::{AppError, AppResult};
use crate::net_manager;
use crate::steam_utils;
use serde::Serialize;
use steamworks::networking_types::NetworkingConnectionState;
use steamworks::{FriendFlags, LobbyId, LobbyType, SteamError, SteamId};
use tauri::State;
use tokio::sync::oneshot;

#[derive(Serialize, Clone)]
pub struct FriendInfo {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Clone)]
pub struct LobbyInfo {
    pub id: String,
    pub name: String,
    pub member_count: usize,
    pub max_members: usize,
}

#[derive(Serialize)]
pub struct JoinLobbyResult {
    pub lobby_id: String,
    pub host_id: String,
}

#[derive(Serialize, Clone)]
pub struct NetworkStatusInfo {
    #[serde(rename = "isHost")]
    pub is_host: bool,
    #[serde(rename = "isConnected")]
    pub is_connected: bool,
    #[serde(rename = "tcpClientCount")]
    pub tcp_client_count: usize,
    #[serde(rename = "statusMessage")]
    pub status_message: String,
    pub ping: i32,
    #[serde(rename = "connectionType")]
    pub connection_type: String,
}

#[derive(Serialize, Clone)]
pub struct MemberInfo {
    pub id: String,
    pub name: String,
    pub ping: i32,
    pub relay: String,
}

#[tauri::command]
pub fn get_friends(state: State<'_, AppState>) -> Vec<FriendInfo> {
    let friends = state.steam_client.friends();
    let list = friends.get_friends(FriendFlags::IMMEDIATE);
    list.into_iter()
        .map(|f| FriendInfo {
            id: f.id().raw().to_string(),
            name: f.name(),
        })
        .collect()
}

#[tauri::command]
pub async fn create_lobby(state: State<'_, AppState>) -> AppResult<String> {
    let (tx, rx) = oneshot::channel();
    {
        let matchmaking = state.steam_client.matchmaking();
        matchmaking.create_lobby(
            LobbyType::Public,
            4,
            move |result: Result<LobbyId, SteamError>| {
                let _ = tx.send(result);
            },
        );
    }
    let lobby_id = rx
        .await
        .map_err(|_| AppError::Internal("Canceled".to_string()))?
        .map_err(AppError::from)?;

    {
        let mut tunnel_state = state.state.lock();
        *tunnel_state = TunnelState::Hosting(lobby_id);
        log::info!("State updated to Hosting({})", lobby_id.raw());
    }

    let friends = state.steam_client.friends();
    friends.set_rich_presence("steam_display", Some("#Status_InLobby"));
    friends.set_rich_presence("connect", Some(&lobby_id.raw().to_string()));
    Ok(lobby_id.raw().to_string())
}

#[tauri::command]
pub async fn search_lobbies(state: State<'_, AppState>) -> AppResult<Vec<LobbyInfo>> {
    let (tx, rx) = oneshot::channel();
    {
        let matchmaking = state.steam_client.matchmaking();
        matchmaking.request_lobby_list(move |lobbies: Result<Vec<LobbyId>, SteamError>| {
            let _ = tx.send(lobbies);
        });
    }
    let lobbies = rx
        .await
        .map_err(|_| AppError::Internal("Canceled".to_string()))?
        .map_err(AppError::from)?;

    let matchmaking = state.steam_client.matchmaking();
    let mut result = Vec::new();
    for lobby_id in lobbies {
        let member_count = matchmaking.lobby_member_count(lobby_id);
        let member_limit = matchmaking.lobby_member_limit(lobby_id).unwrap_or(4);
        let name = format!("Lobby {}", lobby_id.raw());
        result.push(LobbyInfo {
            id: lobby_id.raw().to_string(),
            name,
            member_count,
            max_members: member_limit,
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn join_lobby(
    state: State<'_, AppState>,
    lobby_id_str: String,
) -> AppResult<JoinLobbyResult> {
    let lobby_id_u64 = lobby_id_str
        .parse::<u64>()
        .map_err(|_| AppError::Parse("Invalid Lobby ID".to_string()))?;
    let lobby_id = LobbyId::from_raw(lobby_id_u64);

    // Use stop_network to correctly reset token and connections
    net_manager::stop_network(&state);

    let (tx, rx) = oneshot::channel();
    {
        let matchmaking = state.steam_client.matchmaking();
        matchmaking.join_lobby(lobby_id, move |result: Result<LobbyId, ()>| {
            let _ = tx.send(result);
        });
    }
    let joined_lobby_id = rx
        .await
        .map_err(|_| AppError::Internal("Canceled".to_string()))?
        .map_err(|_| AppError::Lobby(format!("Failed to join lobby {}", lobby_id_str)))?;

    {
        let mut tunnel_state = state.state.lock();
        *tunnel_state = TunnelState::Joined(joined_lobby_id);
        log::info!("State updated to Joined({})", joined_lobby_id.raw());
    }

    state
        .steam_client
        .friends()
        .set_rich_presence("steam_display", Some("#Status_InLobby"));
    state
        .steam_client
        .friends()
        .set_rich_presence("connect", Some(&lobby_id_str));
    let host_id = {
        let matchmaking = state.steam_client.matchmaking();
        matchmaking.lobby_owner(joined_lobby_id)
    };
    Ok(JoinLobbyResult {
        lobby_id: joined_lobby_id.raw().to_string(),
        host_id: host_id.raw().to_string(),
    })
}

#[tauri::command]
pub async fn connect_to_host(
    state: State<'_, AppState>,
    host_id_str: String,
    local_port: u16,
) -> AppResult<()> {
    let host_id_u64 = host_id_str
        .parse::<u64>()
        .map_err(|_| AppError::Parse("Invalid Host ID".to_string()))?;
    let host_id = SteamId::from_raw(host_id_u64);
    let my_id = state.steam_client.user().steam_id();
    if host_id != my_id {
        net_manager::start_network_client(&state, host_id, local_port).await
    } else {
        log::info!("Player is the host, no need to connect_to_host.");
        Ok(())
    }
}

#[tauri::command]
pub fn leave_lobby(state: State<'_, AppState>) {
    let lobby_id_opt = {
        let tunnel_state = state.state.lock();
        match *tunnel_state {
            TunnelState::Hosting(id) => Some(id),
            TunnelState::Joined(id) => Some(id),
            TunnelState::Idle => None,
        }
    };

    net_manager::stop_network(&state);

    if let Some(lobby_id) = lobby_id_opt {
        state.steam_client.matchmaking().leave_lobby(lobby_id);
        state.steam_client.friends().clear_rich_presence();
        log::info!("Left lobby and cleared rich presence.");
    }
}

#[tauri::command]
pub fn start_hosting(state: State<'_, AppState>, local_port: u16) -> AppResult<()> {
    {
        let mut port = state.local_game_port.lock();
        *port = local_port;
    }
    net_manager::start_network_host(&state)
}

#[tauri::command]
pub fn stop_hosting(state: State<'_, AppState>) {
    leave_lobby(state);
}

#[tauri::command]
pub fn send_invite(state: State<'_, AppState>, friend_id_str: String) -> AppResult<()> {
    let friend_id_u64 = friend_id_str
        .parse::<u64>()
        .map_err(|_| AppError::Parse("Invalid Friend ID".to_string()))?;
    let tunnel_state = state.state.lock();

    let lobby_id_opt = match *tunnel_state {
        TunnelState::Hosting(id) => Some(id),
        TunnelState::Joined(id) => Some(id),
        TunnelState::Idle => None,
    };

    if let Some(lobby_id) = lobby_id_opt {
        let success = steam_utils::invite_user_to_lobby(lobby_id.raw(), friend_id_u64);
        if success {
            Ok(())
        } else {
            Err(AppError::Lobby("Failed to send invite".to_string()))
        }
    } else {
        Err(AppError::Lobby("Not in a lobby".to_string()))
    }
}

#[tauri::command]
pub fn get_lobby_members(state: State<'_, AppState>) -> Vec<MemberInfo> {
    let tunnel_state = *state.state.lock();
    let lobby_id_opt = match tunnel_state {
        TunnelState::Hosting(id) => Some(id),
        TunnelState::Joined(id) => Some(id),
        TunnelState::Idle => None,
    };

    if let Some(lobby_id) = lobby_id_opt {
        let matchmaking = state.steam_client.matchmaking();
        let friends = state.steam_client.friends();
        let members = matchmaking.lobby_members(lobby_id);
        let my_id = state.steam_client.user().steam_id();

        // 获取所有活动的真实句柄
        let active_handles = state.active_handles.lock();

        members
            .into_iter()
            .map(|member_id| {
                let friend_obj = friends.get_friend(member_id);

                let mut ping = -1;
                let mut relay = "Unknown".to_string();

                if member_id == my_id {
                    ping = 0;
                    relay = "本地 (Local)".to_string();
                } else {
                    // 遍历所有活动句柄，寻找匹配该成员 SteamID 的连接
                    for &handle in active_handles.iter() {
                        if let Some(stats) = steam_utils::get_stats_from_handle(handle) {
                            // 重新通过底层 API 获取该句柄对应的 SteamID
                            unsafe {
                                let sockets_ptr = steamworks_sys::SteamAPI_SteamNetworkingSockets_SteamAPI_v012();
                                let mut info: steamworks_sys::SteamNetConnectionInfo_t = std::mem::zeroed();
                                if steamworks_sys::SteamAPI_ISteamNetworkingSockets_GetConnectionInfo(sockets_ptr, handle, &mut info) {
                                    let remote_id = info.m_identityRemote.__bindgen_anon_1.m_steamID64;
                                    if remote_id == member_id.raw() {
                                        ping = stats.ping;
                                        relay = stats.connection_type;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                MemberInfo {
                    id: member_id.raw().to_string(),
                    name: friend_obj.name(),
                    ping,
                    relay,
                }
            })
            .collect()
    } else {
        Vec::new()
    }
}

#[tauri::command]
pub fn get_network_status(state: State<'_, AppState>) -> NetworkStatusInfo {
    let tunnel_state = *state.state.lock();
    let client_count = state.connections.lock().len();
    let is_host = matches!(tunnel_state, TunnelState::Hosting(_));

    let mut ping = -1;
    let mut connection_type = "未连接 (Not Connected)".to_string();
    let mut is_connected = false;

    // 从活动句柄中获取第一个有效句柄的状态作为概览
    let active_handles = state.active_handles.lock();
    if let Some(&handle) = active_handles.first() {
        if let Some(stats) = steam_utils::get_stats_from_handle(handle) {
            ping = stats.ping;
            connection_type = stats.connection_type;
            is_connected = stats.state == NetworkingConnectionState::Connected;
        }
    }

    let status_message = match tunnel_state {
        TunnelState::Hosting(_) => format!("正在主持 ({} 名玩家连接)", client_count),
        TunnelState::Joined(_) => "已加入大厅".to_string(),
        TunnelState::Idle => "空闲".to_string(),
    };

    NetworkStatusInfo {
        is_host,
        is_connected,
        tcp_client_count: client_count,
        status_message,
        ping,
        connection_type,
    }
}
