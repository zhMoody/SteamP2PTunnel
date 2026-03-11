export interface FriendInfo {
    id: string;
    name: string;
}

export interface LobbyInfo {
    id: string;
    name: string;
    member_count: number;
    max_members: number;
}

export interface MemberInfo {
    id: string;
    name: string;
    ping: number;
    relay: string;
}

export interface NetworkStatus {
    isHost: boolean;
    isConnected: boolean;
    tcpClientCount: number;
    statusMessage: string;
    ping: number;
    connectionType: string;
}

export interface JoinLobbyResult {
    lobby_id: string;
    host_id: string;
}