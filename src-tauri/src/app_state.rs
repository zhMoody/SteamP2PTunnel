/*
 * @Author: moody
 * @Date: 2026-01-12 01:56:40
 * @LastEditTime: 2026-03-11 14:41:20
 * @FilePath: \src-tauri\src\app_state.rs
 */
use circular_queue::CircularQueue;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use steamworks::networking_sockets::NetConnection;
use steamworks::{Client, LobbyId, SteamId};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TunnelState {
    Idle,
    Hosting(LobbyId),
    Joined(LobbyId),
}

#[derive(Serialize, Clone)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Clone)]
pub struct AppState {
    pub steam_client: Client,
    pub state: Arc<Mutex<TunnelState>>,
    pub local_game_port: Arc<Mutex<u16>>,
    pub cancel_token: Arc<Mutex<CancellationToken>>,
    /// P2P 连接表，以远端 SteamId 为 key
    pub connections: Arc<Mutex<HashMap<SteamId, NetConnection>>>,
    pub logs: Arc<Mutex<CircularQueue<LogEntry>>>,
}

impl AppState {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let client = Client::init_app(480)?;
        eprintln!("[INIT] ✅ Steam Client initialized");

        // CRITICAL: Initialize authentication for P2P
        eprintln!("[INIT] 🔐 正在初始化 P2P 认证...");
        super::steam_utils::init_authentication(&client);

        Ok(Self {
            steam_client: client,
            state: Arc::new(Mutex::new(TunnelState::Idle)),
            local_game_port: Arc::new(Mutex::new(0)),
            cancel_token: Arc::new(Mutex::new(CancellationToken::new())),
            connections: Arc::new(Mutex::new(HashMap::new())),
            logs: Arc::new(Mutex::new(CircularQueue::with_capacity(500))),
        })
    }
}