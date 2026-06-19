export interface FriendInfo {
	id: string;
	name: string;
	state: string; // "在线", "离开", "忙碌", "离线" 等
	game_id: number; // 正在玩的游戏 AppId，0=没在玩，480=本应用
	state_priority: number; // 0=在线/游戏中, 1=离开/交易中, 2=忙碌, 3=隐身, 4=离线
	in_this_game: boolean; // 是否也在玩本应用 (AppId 480)
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
	lobbyId: string | null;
}

export interface JoinLobbyResult {
	lobby_id: string;
	host_id: string;
}
