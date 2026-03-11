use crate::app_state::AppState;
use crate::error::{AppError, AppResult};
use crate::steam_utils;
use bytes::{Buf, BufMut, BytesMut};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use steamworks::{
    networking_sockets::ListenSocket,
    networking_types::{ListenSocketEvent, NetworkingConnectionState, SendFlags},
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
    state.active_handles.lock().clear();
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
    log::info!("NetworkingIdentity 创建完成");

    match networking.connect_p2p(net_identity, 0, None) {
        Ok(conn) => {
            log::info!("✅ connect_p2p() 返回成功，连接对象已创建");
            log::info!("🔌 P2P 连接已启动，目标主机: {:?}", host_id);

            // 配置 P2P 连接参数
            steam_utils::set_connection_config_value_int32(
                &conn,
                steamworks_sys::ESteamNetworkingConfigValue::k_ESteamNetworkingConfig_P2P_Transport_ICE_Enable,
                0,
            );

            steam_utils::set_connection_config_value_int32(
                &conn,
                steamworks_sys::ESteamNetworkingConfigValue::k_ESteamNetworkingConfig_TimeoutInitial,
                120000,
            );

            steam_utils::set_connection_config_value_int32(
                &conn,
                steamworks_sys::ESteamNetworkingConfigValue::k_ESteamNetworkingConfig_TimeoutConnected,
                120000,
            );

            // 诊断: 打印连接信息
            let handle = steam_utils::get_connection_handle(&conn);
            log::info!(
                "🔍 连接句柄: {} (0x{:X}), 已配置手超时 120 秒",
                handle,
                handle
            );

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
                        let handles = state.active_handles.lock();
                        for &h in handles.iter() {
                            if let Some(stats) = steam_utils::get_stats_from_handle(h) {
                                log::info!(
                                    "📊 状态: {} | 延迟: {}ms | 类型: {}",
                                    steam_utils::state_to_string(stats.state),
                                    stats.ping,
                                    stats.connection_type
                                );
                            }
                        }
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
                        if let Some(info) = steam_utils::get_connection_info(&conn) {
                            log::error!(
                                "❌ P2P 连接失败详情: 结束原因={}, 消息={:?}",
                                info.m_eEndReason,
                                unsafe { std::ffi::CStr::from_ptr(info.m_szEndDebug.as_ptr()) }
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

            // 添加连接到状态
            {
                let handle = steam_utils::get_connection_handle(&conn);
                let mut handles = state.active_handles.lock();
                if !handles.contains(&handle) {
                    handles.push(handle);
                }
                state.connections.lock().push(conn);
            }

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

    match networking.create_listen_socket_p2p(0, None) {
        Ok(socket) => {
            log::info!("🖥️ 已启动主机 P2P 监听套接字");

            steam_utils::set_listen_socket_config_value_int32(
                &socket,
                steamworks_sys::ESteamNetworkingConfigValue::k_ESteamNetworkingConfig_TimeoutInitial,
                60000,
            );

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

    let mut dead_indices = Vec::with_capacity(10);

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
                    let handle = steam_utils::get_connection_handle(&conn);
                    {
                        let mut handles = state.active_handles.lock();
                        if !handles.contains(&handle) {
                            handles.push(handle);
                        }
                    }
                    state.connections.lock().push(conn);
                }
                ListenSocketEvent::Disconnected(disconnected) => {
                    let remote_id = disconnected.remote().steam_id();
                    log::warn!("⚠️ P2P 客户端已断开: {:?}", remote_id);

                    let mut conns = state.connections.lock();
                    let mut handles = state.active_handles.lock();
                    
                    if let Some(pos) = conns.iter().position(|c| {
                        state
                            .steam_client
                            .networking_sockets()
                            .get_connection_info(c)
                            .ok()
                            .and_then(|info| info.identity_remote().and_then(|id| id.steam_id()))
                            == remote_id
                    }) {
                        let conn = &conns[pos];
                        let handle = steam_utils::get_connection_handle(conn);
                        if let Some(h_pos) = handles.iter().position(|&h| h == handle) {
                            handles.remove(h_pos);
                        }
                        conns.remove(pos);
                        log::info!("✅ 已从活动列表中清理断开的连接: {:?}", remote_id);
                    }
                }
            }
        }

        tokio::select! {
            Some(out) = rx_p2p.recv() => {
                let data = out.packet.to_bytes();
                let mut conns_guard = state.connections.lock();
                let sockets = state.steam_client.networking_sockets();
                if let Some(conn) = conns_guard.iter_mut().find(|c| {
                    sockets.get_connection_info(c).ok()
                        .and_then(|info| info.identity_remote().and_then(|id| id.steam_id())) == Some(out.target_steam_id)
                }) {
                    let _ = conn.send_message(&data, SendFlags::RELIABLE);
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(1)) => {
                let mut conns_guard = state.connections.lock();
                dead_indices.clear();
                let sockets = state.steam_client.networking_sockets();

                for (i, conn) in conns_guard.iter_mut().enumerate() {
                    match conn.receive_messages(100) {
                        Ok(messages) => {
                            if !messages.is_empty() {
                                log::debug!("主机收到 {} 条 P2P 消息（连接 {}）", messages.len(), i);
                            }
                            for msg in messages {
                                if let Ok(info) = sockets.get_connection_info(conn) {
                                    if let (Some(packet), Some(remote_id)) = (TunnelPacket::from_bytes(msg.data()), info.identity_remote().and_then(|id| id.steam_id())) {
                                        let client_id = packet.client_id.clone();
                                        let mut map_guard = socket_map.lock();

                                        log::debug!("主机 P2P 包: 客户端 ID={}, 类型={}, 大小={} 字节, 来自={:?}", client_id, packet.msg_type, packet.payload.len(), remote_id);

                                        // 关键修改：过滤掉握手 ID "INIT"
                                        if client_id != "INIT" && !map_guard.contains_key(&client_id) && packet.msg_type == 0 {
                                            log::info!("🌉 为客户端 {} 创建新的 TCP 桥接，端口 {}", client_id, local_port);
                                            spawn_local_bridge_host(client_id.clone(), local_port, remote_id, tx_p2p.clone(), &mut map_guard, session_token.clone());
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
                            }
                        },
                        Err(_) => { dead_indices.push(i); }
                    }
                }
                for i in dead_indices.iter().rev() { conns_guard.remove(*i); }
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
                if let Some(conn) = conns.iter_mut().next() {
                    log::debug!("客户端发送 P2P 包: 客户端 ID={}, 类型={}, 大小={} 字节", packet.client_id, packet.msg_type, data.len());
                    let _ = conn.send_message(&data, SendFlags::RELIABLE);
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(1)) => {
                let mut conns = state.connections.lock();
                if let Some(conn) = conns.iter_mut().next() {
                    if let Ok(messages) = conn.receive_messages(100) {
                        if !messages.is_empty() {
                            log::debug!("客户端收到 {} 条 P2P 消息", messages.len());
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
                }
            }
            _ = session_token.cancelled() => {
                log::info!("⛔ 停止信号已接收，关闭客户端循环");
                break;
            }
        }
    }
}
