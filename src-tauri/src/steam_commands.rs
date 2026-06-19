use crate::app_state::{AppState, TunnelState};
use crate::error::{AppError, AppResult};
use crate::net_manager;
use serde::Serialize;
use steamworks::networking_types::NetworkingConnectionState;
use steamworks::{FriendFlags, LobbyId, LobbyType, SteamError, SteamId};
use tauri::State;
use tokio::sync::oneshot;

#[derive(Serialize, Clone)]
pub struct FriendInfo {
    pub id: String,
    pub name: String,
    pub state: String,      // "在线", "离开", "忙碌", "离线" 等
    pub game_id: u32,       // 正在玩的游戏 AppId，0=没在玩，480=本应用
    pub state_priority: u8, // 0=在线/游戏中, 1=离开/交易中, 2=忙碌, 3=隐身, 4=离线
    pub in_this_game: bool, // 是否也在玩本应用 (AppId 480)
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
    let mut result: Vec<FriendInfo> = list
        .into_iter()
        .map(|f| {
            let (state_str, priority) = match f.state() {
                steamworks::FriendState::Online => ("在线", 0u8),
                steamworks::FriendState::LookingToPlay => ("游戏中", 0u8),
                steamworks::FriendState::LookingToTrade => ("交易中", 1u8),
                steamworks::FriendState::Away => ("离开", 1u8),
                steamworks::FriendState::Snooze => ("离开", 1u8),
                steamworks::FriendState::Busy => ("忙碌", 2u8),
                steamworks::FriendState::Invisible => ("隐身", 3u8),
                steamworks::FriendState::Offline => ("离线", 4u8),
            };
            let game_id = match f.game_played() {
                Some(g) => g.game.app_id().0,
                None => 0,
            };
            let in_this_game = game_id == 480;

            FriendInfo {
                id: f.id().raw().to_string(),
                name: f.name(),
                state: state_str.to_string(),
                game_id,
                state_priority: priority,
                in_this_game,
            }
        })
        .collect();
    result.sort_by_key(|f| f.state_priority);
    result
}

/// 后端代理 Steam API，避免前端 CORS 问题
#[tauri::command]
pub async fn resolve_game_name(app_id: u32) -> Option<String> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}&l=schinese",
        app_id
    );
    if let Ok(resp) = reqwest::get(&url).await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            return json[&app_id.to_string()]["data"]["name"]
                .as_str()
                .map(|s| s.to_string());
        }
    }
    None
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
        Err(AppError::Network(
            "Cannot connect to yourself. You are the host.".to_string(),
        ))
    }
}

#[tauri::command]
pub fn leave_lobby(state: State<'_, AppState>) {
    let lobby_id_opt = {
        let mut tunnel_state = state.state.lock();
        let id_opt = match *tunnel_state {
            TunnelState::Hosting(id) => Some(id),
            TunnelState::Joined(id) => Some(id),
            TunnelState::Idle => None,
        };
        *tunnel_state = TunnelState::Idle;
        id_opt
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
    let friend_id = SteamId::from_raw(friend_id_u64);
    let tunnel_state = state.state.lock();

    let lobby_id = match *tunnel_state {
        TunnelState::Hosting(id) => Some(id),
        TunnelState::Joined(id) => Some(id),
        TunnelState::Idle => None,
    };

    match lobby_id {
        Some(lobby_id) => {
            let mm_ptr = unsafe { steamworks::sys::SteamAPI_SteamMatchmaking_v009() };
            let result = unsafe {
                steamworks::sys::SteamAPI_ISteamMatchmaking_InviteUserToLobby(
                    mm_ptr,
                    lobby_id.raw(),
                    friend_id.raw(),
                )
            };
            let friend_name = state.steam_client.friends().get_friend(friend_id).name();
            log::info!(
                "📨 InviteUserToLobby → {}: {}",
                friend_name,
                if result { "成功" } else { "失败" }
            );
            if !result {
                return Err(AppError::Network("邀请发送失败".to_string()));
            }
            Ok(())
        }
        None => Err(AppError::Lobby("Not in a lobby".to_string())),
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

        // 从 HashMap 中查找每个成员的连接状态
        let connections = state.connections.lock();
        let sockets = state.steam_client.networking_sockets();
        let conn_count = connections.len();

        members
            .into_iter()
            .map(|member_id| {
                let friend_obj = friends.get_friend(member_id);
                let member_id_str = member_id.raw().to_string();

                let mut ping = -1;
                let mut relay = "Unknown".to_string();

                if member_id == my_id {
                    ping = 0;
                    relay = "本地 (Local)".to_string();
                } else if let Some(conn) = connections.get(&member_id) {
                    log::debug!(
                        "🔍 查询成员 {} 的连接状态 ({} 条活动连接中)",
                        friend_obj.name(),
                        conn_count
                    );
                    match sockets.get_realtime_connection_status(conn, 0) {
                        Ok((info, _lanes)) => {
                            ping = info.ping();
                            let state_result = info.connection_state();
                            relay = match state_result {
                                Ok(state) => {
                                    log::debug!(
                                        "✅ 成员 {} 连接状态: {:?}, ping={}ms",
                                        friend_obj.name(),
                                        state,
                                        ping
                                    );
                                    match state {
                                        NetworkingConnectionState::Connected => {
                                            "P2P (Connected)".to_string()
                                        }
                                        _ => format!("{:?}", state),
                                    }
                                }
                                Err(_) => {
                                    log::warn!(
                                        "⚠️ 成员 {} 无法获取连接状态枚举值",
                                        friend_obj.name()
                                    );
                                    format!("ping={}", ping)
                                }
                            };
                        }
                        Err(e) => {
                            log::warn!(
                                "⚠️ 成员 {} 的 get_realtime_connection_status 失败: {:?}",
                                friend_obj.name(),
                                e
                            );
                            relay = "Error".to_string();
                        }
                    }
                } else {
                    log::debug!(
                        "📌 成员 {} (id={}) 不在活动连接表中 (my_id={})",
                        friend_obj.name(),
                        member_id_str,
                        my_id.raw()
                    );
                }

                MemberInfo {
                    id: member_id_str,
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
    let connections = state.connections.lock();
    let client_count = connections.len();
    let is_host = matches!(tunnel_state, TunnelState::Hosting(_));

    let mut ping = -1;
    let mut connection_type = "未连接 (Not Connected)".to_string();
    let mut is_connected = false;

    // 从 HashMap 中获取第一个连接的实时状态作为概览
    let sockets = state.steam_client.networking_sockets();
    if let Some((_id, conn)) = connections.iter().next() {
        if let Ok((info, _lanes)) = sockets.get_realtime_connection_status(conn, 0) {
            ping = info.ping();
            if let Ok(state) = info.connection_state() {
                is_connected = state == NetworkingConnectionState::Connected;
                connection_type = match state {
                    NetworkingConnectionState::Connected => "P2P (Connected)".to_string(),
                    _ => format!("{:?}", state),
                };
            }
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
