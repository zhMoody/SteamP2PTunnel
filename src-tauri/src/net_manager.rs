use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::steam_utils;
use bytes::{Buf, BufMut, BytesMut};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use steamworks::{
    networking_sockets::ListenSocket,
    networking_types::{
        ListenSocketEvent, NetworkingConfigEntry, NetworkingConfigValue,
        NetworkingConnectionState, SendFlags,
    },
    SteamId,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

pub const ID_LEN: usize = 7;
pub const HEADER_SIZE: usize = ID_LEN + 4;
// ... (rest of the TunnelPacket implementation remains the same)

pub struct TunnelPacket {
    pub client_id: String,
    pub msg_type: u32,
    pub payload: Vec<u8>,
}

impl TunnelPacket {
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = BytesMut::with_capacity(HEADER_SIZE + self.payload.len());
        let id_bytes = self.client_id.as_bytes();
        let len = std::cmp::min(id_bytes.len(), ID_LEN);
        buf.put_slice(&id_bytes[0..len]);
        for _ in len..ID_LEN {
            buf.put_u8(0);
        }
        buf.put_u32_le(self.msg_type);
        if self.msg_type == 0 {
            buf.put_slice(&self.payload);
        }
        buf.to_vec()
    }

    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        if data.len() < HEADER_SIZE {
            return None;
        }
        let id_slice = &data[0..ID_LEN];
        let client_id = String::from_utf8_lossy(id_slice)
            .trim_matches(char::from(0))
            .to_string();
        let mut slice = &data[ID_LEN..];
        if slice.len() < 4 {
            return None;
        }
        let msg_type = slice.get_u32_le();
        let payload = slice.to_vec();
        Some(TunnelPacket {
            client_id,
            msg_type,
            payload,
        })
    }
}

// --- 公共函数 ---
pub fn stop_network(state: &AppState) {
    {
        let mut token_guard = state.cancel_token.lock();
        token_guard.cancel();
        *token_guard = CancellationToken::new();
    }
    state.connections.lock().clear();
    log::info!("网络已停止，令牌已重置。");
}

pub async fn start_network_client(
    state: &AppState,
    host_id: SteamId,
    local_port: u16,
) -> AppResult<()> {
    stop_network(state);
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // ... (wait for auth code)
    if !steam_utils::wait_for_auth_ready(&state.steam_client, 30).await {
        log::warn!("⚠️ 30 秒后认证仍未就绪 - 继续尝试连接");
    }
    log::info!("✅ 认证已确认，开始 P2P 连接...");

    let session_token = state.cancel_token.lock().child_token();
    *state.local_game_port.lock() = local_port;

    let networking = state.steam_client.networking_sockets();
    let net_identity = steamworks::networking_types::NetworkingIdentity::new_steam_id(host_id);

    log::info!("🔌 发起 P2P 连接到主机: {:?}", host_id);

    let p2p_options = vec![
        NetworkingConfigEntry::new_int32(NetworkingConfigValue::P2PTransportICEEnable, 0),
        NetworkingConfigEntry::new_int32(NetworkingConfigValue::IPAllowWithoutAuth, 1),
        NetworkingConfigEntry::new_int32(NetworkingConfigValue::TimeoutInitial, 120000),
        NetworkingConfigEntry::new_int32(NetworkingConfigValue::TimeoutConnected, 120000),
    ];

    match networking.connect_p2p(net_identity, 0, p2p_options) {
        Ok(conn) => {
            log::info!("✅ connect_p2p() 返回成功，连接对象已创建");
            log::info!("🔌 P2P 连接已启动，目标主机: {:?}", host_id);

            log::info!("⏳ 等待 P2P 连接建立（握手可能需要 10-30 秒用于中继路由）...");
            let mut success = false;
            let mut last_state: Option<NetworkingConnectionState> = None;
            let mut last_diagnostic = std::time::Instant::now();

            for attempt in 0..1200 {
                if session_token.is_cancelled() {
                    log::warn!("⚠️ 会话被取消，停止等待循环");
                    break;
                }

                if let Some(state_enum) =
                    steam_utils::get_connection_state(&conn, &state.steam_client)
                {
                    if Some(state_enum) != last_state {
                        log::info!(
                            "📡 P2P 连接状态: {} (第 {}/1200 次)",
                            steam_utils::state_to_string(state_enum),
                            attempt
                        );
                        last_state = Some(state_enum);
                    }

                    if last_diagnostic.elapsed() >= std::time::Duration::from_secs(5) {
                        // 诊断日志：仍在等待握手完成
                        log::info!("📊 仍在等待 P2P 握手... (第 {} 次检查)", attempt);
                        last_diagnostic = std::time::Instant::now();
                    }

                    if state_enum == NetworkingConnectionState::Connected {
                        success = true;
                        log::info!("✅ P2P 连接建立成功！");
                        break;
                    } else if state_enum == NetworkingConnectionState::ClosedByPeer
                        || state_enum == NetworkingConnectionState::ProblemDetectedLocally
                    {
                        let err_msg = steam_utils::state_to_string(state_enum);
                        if let Ok(info) = conn.info() {
                            log::error!(
                                "❌ P2P 连接失败详情: 结束原因={:?}",
                                info.end_reason()
                            );
                        }
                        log::error!("❌ P2P 连接失败: {}", err_msg);
                        return Err(AppError::Network(format!("P2P 连接失败: {}", err_msg)));
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }

            if !success {
                log::error!("❌ P2P 连接在 120 秒后超时");
                return Err(AppError::Network("P2P 连接在 120 秒后超时".to_string()));
            }

            log::info!("✓ P2P 连接已验证！启动客户端循环...");

            // 发送握手包
            let handshake = TunnelPacket {
                client_id: "INIT".to_string(),
                msg_type: 0,
                payload: vec![],
            };
            let _ = conn.send_message(&handshake.to_bytes(), SendFlags::RELIABLE);
            log::info!("📤 已发送 P2P 握手包");

            // 将连接存入 HashMap，以远端 SteamId 为 key
            state.connections.lock().insert(host_id, conn);
            log::info!(
                "📝 客户端连接已存入表: host_id={}, 当前连接数={}",
                host_id.raw(),
                state.connections.lock().len()
            );

            let state_clone = state.clone();
            let token_clone = session_token.clone();
            tauri::async_runtime::spawn(async move {
                client_loop(state_clone, token_clone).await;
            });

            Ok(())
        }
        Err(e) => Err(AppError::Network(format!("Failed to connect P2P: {:?}", e))),
    }
}

pub fn start_network_host(state: &AppState) -> AppResult<()> {
    stop_network(state);

    // CRITICAL: Wait for authentication to be ready
    log::info!("⏳ 等待 Steam 认证就绪（最多 10 秒）...");
    let client_clone = state.steam_client.clone();
    let wait_handle = std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            if !steam_utils::wait_for_auth_ready(&client_clone, 10).await {
                log::warn!("⚠️ 10 秒后认证仍未就绪 - 继续尝试连接");
            }
        })
    });

    wait_handle.join().expect("Auth wait thread panicked");
    log::info!("✅ 认证已确认，开始主机设置...");

    let session_token = state.cancel_token.lock().child_token();
    let networking = state.steam_client.networking_sockets();

    let host_options = vec![
        NetworkingConfigEntry::new_int32(NetworkingConfigValue::IPAllowWithoutAuth, 1),
        NetworkingConfigEntry::new_int32(NetworkingConfigValue::TimeoutInitial, 60000),
    ];

    match networking.create_listen_socket_p2p(0, host_options) {
        Ok(socket) => {
            log::info!("🖥️ 已启动主机 P2P 监听套接字");

            let state_clone = state.clone();
            tauri::async_runtime::spawn(async move {
                host_loop(state_clone, socket, session_token).await;
            });
            Ok(())
        }
        Err(e) => Err(AppError::Network(format!(
            "Failed to start hosting: {:?}",
            e
        ))),
    }
}

// --- Host 逻辑 ---
struct HostOutgoingPacket {
    target_steam_id: SteamId,
    packet: TunnelPacket,
}

async fn host_loop(state: AppState, listen_socket: ListenSocket, session_token: CancellationToken) {
    type TcpSender = mpsc::UnboundedSender<Vec<u8>>;
    let socket_map: Arc<Mutex<HashMap<String, TcpSender>>> = Arc::new(Mutex::new(HashMap::new()));
    let (tx_p2p, mut rx_p2p) = mpsc::unbounded_channel::<HostOutgoingPacket>();
    let local_port = *state.local_game_port.lock();
    log::info!("🖥️ 主机循环已启动，目标本地游戏端口: {}", local_port);

    let mut dead_ids: Vec<SteamId> = Vec::with_capacity(10);

    loop {
        while let Some(event) = listen_socket.try_receive_event() {
            match event {
                ListenSocketEvent::Connecting(request) => {
                    let remote = request.remote();
                    log::info!("📨 收到来自 {:?} 的 P2P 请求", remote);
                    if let Err(e) = request.accept() {
                        log::error!("❌ 接受连接失败: {:?}", e);
                    } else {
                        log::info!("✅ 已接受来自 {:?} 的连接请求，正在完成握手...", remote);
                    }
                }
                ListenSocketEvent::Connected(connected) => {
                    log::info!("🤝 与 {:?} 的 P2P 握手完成！连接已建立", connected.remote());
                    let conn = connected.take_connection();
                    // 通过官方 API 获取远端 SteamId 并存入 HashMap
                    let sockets = state.steam_client.networking_sockets();
                    if let Ok(info) = sockets.get_connection_info(&conn) {
                        if let Some(remote_id) = info.identity_remote().and_then(|id| id.steam_id()) {
                            let prev = state.connections.lock().insert(remote_id, conn);
                            log::info!(
                                "📝 连接已存入表: remote_id={}, 是否覆盖旧连接={}",
                                remote_id.raw(),
                                prev.is_some()
                            );
                        } else {
                            log::warn!("⚠️ Connected 事件中无法解析远端 SteamId");
                        }
                    } else {
                        log::error!("❌ 无法获取已连接的对端信息");
                    }
                }
                ListenSocketEvent::Disconnected(disconnected) => {
                    if let Some(remote_id) = disconnected.remote().steam_id() {
                        log::warn!("⚠️ P2P 客户端已断开: {:?}", remote_id);
                        let was_removed = state.connections.lock().remove(&remote_id).is_some();
                        log::info!(
                            "✅ 已从活动列表中清理: SteamId={}, 实际移除={}, 剩余连接数={}",
                            remote_id.raw(),
                            was_removed,
                            state.connections.lock().len()
                        );
                    }
                }
            }
        }

        tokio::select! {
            Some(out) = rx_p2p.recv() => {
                let data = out.packet.to_bytes();
                let mut conns_guard = state.connections.lock();
                if let Some(conn) = conns_guard.get_mut(&out.target_steam_id) {
                    let _ = conn.send_message(&data, SendFlags::RELIABLE);
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(50)) => {
                // 收集所有远端的 SteamId，避免在迭代期间持有锁
                let remote_ids: Vec<SteamId> = {
                    state.connections.lock().keys().cloned().collect()
                };
                dead_ids.clear();
                let sockets = state.steam_client.networking_sockets();

                for remote_id in &remote_ids {
                    let mut conns_guard = state.connections.lock();
                    if let Some(conn) = conns_guard.get_mut(remote_id) {
                        match conn.receive_messages(100) {
                            Ok(messages) => {
                                if !messages.is_empty() {
                                    log::debug!("📥 主机收到 {} 条 P2P 消息（来自 SteamId={}）", messages.len(), remote_id.raw());
                                }
                                for msg in messages {
                                    if let (Some(packet), Some(info_remote_id)) = (
                                        TunnelPacket::from_bytes(msg.data()),
                                        sockets.get_connection_info(conn).ok()
                                            .and_then(|info| info.identity_remote().and_then(|id| id.steam_id()))
                                    ) {
                                        let client_id = packet.client_id.clone();
                                        let mut map_guard = socket_map.lock();

                                        log::debug!("主机 P2P 包: 客户端 ID={}, 类型={}, 大小={} 字节, 来自={:?}", client_id, packet.msg_type, packet.payload.len(), info_remote_id);

                                        // 过滤掉握手 ID "INIT"
                                        if client_id != "INIT" && !map_guard.contains_key(&client_id) && packet.msg_type == 0 {
                                            log::info!("🌉 为客户端 {} 创建新的 TCP 桥接，端口 {}", client_id, local_port);
                                            spawn_local_bridge_host(client_id.clone(), local_port, info_remote_id, tx_p2p.clone(), &mut map_guard, session_token.clone());
                                        }
                                        if let Some(sender) = map_guard.get(&client_id) {
                                            if sender.send(packet.payload).is_err() {
                                                log::warn!("Failed to send data to TCP bridge for {}", client_id);
                                            }
                                        }
                                        if packet.msg_type == 1 {
                                            log::info!("🔌 来自客户端 {} 的 TCP 桥接关闭", client_id);
                                            map_guard.remove(&client_id);
                                        }
                                    }
                                }
                            },
                            Err(_) => {
                                log::warn!("⚠️ 主机 receive_messages 失败: SteamId={}, 标记为 dead", remote_id.raw());
                                dead_ids.push(*remote_id);
                            }
                        }
                    }
                }
                // 清理已断开的连接
                if !dead_ids.is_empty() {
                    log::info!("🧹 清理 {} 个已断开的连接", dead_ids.len());
                }
                for dead_id in &dead_ids {
                    state.connections.lock().remove(dead_id);
                }
            }
            _ = session_token.cancelled() => { break; }
        }
    }
    log::info!("⛔ 主机循环已关闭");
}

fn spawn_local_bridge_host(
    client_id: String,
    local_port: u16,
    target_steam_id: SteamId,
    tx_p2p: mpsc::UnboundedSender<HostOutgoingPacket>,
    map: &mut HashMap<String, mpsc::UnboundedSender<Vec<u8>>>,
    session_token: CancellationToken,
) {
    let (tx_tcp, mut rx_tcp) = mpsc::unbounded_channel::<Vec<u8>>();
    map.insert(client_id.clone(), tx_tcp);

    tauri::async_runtime::spawn(async move {
        let connect_future = TcpStream::connect(("127.0.0.1", local_port));
        let stream = tokio::select! {
            res = connect_future => res,
            _ = tokio::time::sleep(std::time::Duration::from_secs(5)) => {
                Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "TCP connect timed out"))
            }
            _ = session_token.cancelled() => {
                return;
            }
        };

        match stream {
            Ok(stream) => {
                log::info!("✅ TCP 桥接已建立: 端口 {}", local_port);
                let (mut rd, mut wr) = stream.into_split();
                let id_clone_read = client_id.clone();
                let tx_p2p_read = tx_p2p.clone();
                let token_clone = session_token.clone();

                tokio::spawn(async move {
                    let mut buf = vec![0u8; 8192];
                    loop {
                        tokio::select! {
                            res = rd.read(&mut buf) => {
                                match res {
                                    Ok(0) | Err(_) => break,
                                    Ok(n) => {
                                        let p = TunnelPacket {
                                            client_id: id_clone_read.clone(),
                                            msg_type: 0,
                                            payload: buf[0..n].to_vec(),
                                        };
                                        if tx_p2p_read.send(HostOutgoingPacket { target_steam_id, packet: p }).is_err() {
                                            break;
                                        }
                                    }
                                }
                            }
                            _ = token_clone.cancelled() => break,
                        }
                    }
                    let p_disconnect = TunnelPacket {
                        client_id: id_clone_read,
                        msg_type: 1,
                        payload: vec![],
                    };
                    let _ = tx_p2p_read.send(HostOutgoingPacket {
                        target_steam_id,
                        packet: p_disconnect,
                    });
                });

                loop {
                    tokio::select! {
                        Some(data) = rx_tcp.recv() => {
                            if wr.write_all(&data).await.is_err() {
                                break;
                            }
                        }
                        _ = session_token.cancelled() => break,
                    }
                }
            }
            Err(e) => {
                log::error!("❌ TCP 桥接失败: 端口 {}: {:?}", local_port, e);
                let p_disconnect = TunnelPacket {
                    client_id: client_id,
                    msg_type: 1,
                    payload: vec![],
                };
                let _ = tx_p2p.send(HostOutgoingPacket {
                    target_steam_id,
                    packet: p_disconnect,
                });
            }
        }
    });
}

// --- Client 逻辑 ---
async fn client_loop(state: AppState, session_token: CancellationToken) {
    let local_port = *state.local_game_port.lock();
    let listener = match TcpListener::bind(("127.0.0.1", local_port)).await {
        Ok(l) => {
            log::info!("👂 客户端监听: 127.0.0.1:{}", local_port);
            l
        }
        Err(e) => {
            log::error!("❌ 无法绑定客户端监听: 端口 {}: {:?}", local_port, e);
            return;
        }
    };
    let socket_map: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Vec<u8>>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let (tx_p2p, mut rx_p2p) = mpsc::channel::<TunnelPacket>(100);

    loop {
        tokio::select! {
            res = listener.accept() => {
                match res {
                    Ok((socket, addr)) => {
                        log::info!("🎮 本地游戏客户端已连接: {:?}", addr);
                        let id = nanoid::nanoid!(6);
                        let (mut rd, mut wr) = socket.into_split();
                        let (tx_socket, mut rx_socket) = mpsc::unbounded_channel::<Vec<u8>>();
                        socket_map.lock().insert(id.clone(), tx_socket);

                        let tx_p2p_clone = tx_p2p.clone();
                        let id_clone_read = id.clone();
                        let map_clone_read = socket_map.clone();
                        let token_clone = session_token.clone();

                        tokio::spawn(async move {
                            let mut buf = vec![0u8; 8192];
                            loop {
                                tokio::select! {
                                    res = rd.read(&mut buf) => {
                                        match res {
                                            Ok(0) | Err(_) => break,
                                            Ok(n) => {
                                                let packet = TunnelPacket { client_id: id_clone_read.clone(), msg_type: 0, payload: buf[0..n].to_vec() };
                                                if tx_p2p_clone.send(packet).await.is_err() { break; }
                                            }
                                        }
                                    }
                                    _ = token_clone.cancelled() => break,
                                }
                            }
                            let packet = TunnelPacket { client_id: id_clone_read.clone(), msg_type: 1, payload: vec![] };
                            let _ = tx_p2p_clone.send(packet).await;
                            map_clone_read.lock().remove(&id_clone_read);
                        });

                        let token_clone2 = session_token.clone();
                        tokio::spawn(async move {
                            loop {
                                tokio::select! {
                                    Some(data) = rx_socket.recv() => {
                                        if wr.write_all(&data).await.is_err() { break; }
                                    }
                                    _ = token_clone2.cancelled() => break,
                                }
                            }
                        });
                    }
                    Err(e) => log::error!("Accept error: {:?}", e),
                }
            }
            Some(packet) = rx_p2p.recv() => {
                let data = packet.to_bytes();
                let mut conns = state.connections.lock();
                if let Some(conn) = conns.values_mut().next() {
                    log::debug!("客户端发送 P2P 包: 客户端 ID={}, 类型={}, 大小={} 字节", packet.client_id, packet.msg_type, data.len());
                    let _ = conn.send_message(&data, SendFlags::RELIABLE);
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(50)) => {
                let mut conns = state.connections.lock();
                let conn_count = conns.len();
                if let Some(conn) = conns.values_mut().next() {
                    match conn.receive_messages(100) {
                        Ok(messages) => {
                            if !messages.is_empty() {
                                log::debug!("📥 客户端收到 {} 条 P2P 消息 (活动连接数={})", messages.len(), conn_count);
                            }
                            for msg in messages {
                                if let Some(packet) = TunnelPacket::from_bytes(msg.data()) {
                                  log::debug!("客户端 P2P 包: 客户端 ID={}, 类型={}, 大小={} 字节", packet.client_id, packet.msg_type, packet.payload.len());
                                  let mut map = socket_map.lock();
                                  if packet.msg_type == 1 {
                                      log::info!("📨 来自 {} 的断开连接", packet.client_id);
                                      map.remove(&packet.client_id);
                                      continue;
                                  }
                                  if let Some(sender) = map.get(&packet.client_id) {
                                      if sender.send(packet.payload).is_err() {
                                          log::warn!("⚠️ 无法发送数据到套接字: {}", packet.client_id);
                                      }
                                  } else if packet.client_id != "INIT" {
                                      log::warn!("⚠️ 收到未知客户端的包: {}", packet.client_id);
                                  }
                                }
                            }
                        }
                        Err(e) => {
                            log::warn!("⚠️ 客户端 receive_messages 失败: {:?}", e);
                        }
                    }
                }
            }
            _ = session_token.cancelled() => {
                log::info!("⛔ 停止信号已接收，关闭客户端循环");
                break;

            }
        }
    }
}
