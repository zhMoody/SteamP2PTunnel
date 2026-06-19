import {invoke} from "@tauri-apps/api/core";
import {Gamepad2, Search, User, UserPlus, Wifi, X} from "lucide-react";
import {useEffect, useState} from "react";
import {toast} from "react-hot-toast";
import {FriendInfo} from "../types";

interface Props {
	isOpen: boolean;
	onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
	在线: "bg-emerald-500",
	离开: "bg-amber-500",
	忙碌: "bg-red-500",
	游戏中: "bg-blue-500",
	交易中: "bg-purple-500",
	隐身: "bg-slate-500",
	离线: "bg-muted-foreground/40"
};

export function FriendList({isOpen, onClose}: Props) {
	const [friends, setFriends] = useState<FriendInfo[]>([]);
	const [filter, setFilter] = useState("");
	const [gameNames, setGameNames] = useState<Record<number, string>>({});
	useEffect(() => {
		if (!isOpen) return;
		invoke<FriendInfo[]>("get_friends")
			.then((fs) => {
				setFriends(fs);
				// 逐个通过后端代理请求游戏名，避免 CORS
				for (const f of fs) {
					if (f.game_id && f.game_id !== 480) {
						invoke<string | null>("resolve_game_name", {appId: f.game_id})
							.then((name) => {
								setGameNames((prev) => ({
									...prev,
									[f.game_id]: name ?? `App ${f.game_id}`
								}));
							})
							.catch(() => {
								setGameNames((prev) => ({
									...prev,
									[f.game_id]: `App ${f.game_id}`
								}));
							});
					}
				}
			})
			.catch(console.error);
	}, [isOpen]);

	const handleInvite = async (id: string, name: string) => {
		try {
			await invoke("send_invite", {friendIdStr: id});
			toast.success(`已向 ${name} 发送邀请`);
		} catch (e) {
			toast.error(`邀请失败: ${e}`);
		}
	};

	const filteredFriends = friends.filter((f) =>
		f.name.toLowerCase().includes(filter.toLowerCase())
	);

	// 分组：在线(priority 0) → 离开/忙碌(priority 1-3) → 离线(priority 4)
	const onlineGroup = filteredFriends.filter((f) => f.state_priority === 0);
	const midGroup = filteredFriends.filter(
		(f) => f.state_priority >= 1 && f.state_priority <= 3
	);
	const offlineGroup = filteredFriends.filter((f) => f.state_priority >= 4);

	const renderFriend = (friend: FriendInfo) => (
		<div
			key={friend.id}
			className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors group"
		>
			<div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
				<div className="relative shrink-0">
					<div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
						<User className="w-4 h-4 text-muted-foreground" />
					</div>
					<div
						className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${STATUS_COLORS[friend.state] || "bg-slate-500"}`}
					/>
				</div>
				<div className="flex flex-col min-w-0 flex-1">
					<span className="text-sm font-medium text-foreground truncate">
						{friend.name}
					</span>
					{friend.game_id && friend.game_id !== 480 ? (
						<span className="text-[10px] text-[rgb(var(--chart-1))] truncate flex items-center gap-1">
							<Gamepad2 className="w-3 h-3 shrink-0" />
							{gameNames[friend.game_id] !== undefined
								? gameNames[friend.game_id]
								: "..."}
						</span>
					) : friend.in_this_game ? (
						<span className="text-[10px] text-[rgb(var(--chart-1))] truncate flex items-center gap-1">
							<Wifi className="w-3 h-3 shrink-0" />
							Steam P2P Tunnel
						</span>
					) : (
						<span className="text-[10px] text-muted-foreground">
							{friend.state}
						</span>
					)}
				</div>
			</div>
			<button
				onClick={() => handleInvite(friend.id, friend.name)}
				className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors opacity-0 group-hover:opacity-100 shrink-0"
			>
				<UserPlus className="w-4 h-4" />
			</button>
		</div>
	);

	const SectionHeader = ({
		label,
		count,
		color
	}: {
		label: string;
		count: number;
		color: string;
	}) => (
		<div className="flex items-center gap-2 px-1 py-2">
			<div className={`w-1.5 h-1.5 rounded-full ${color}`} />
			<span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.15em]">
				{label}
			</span>
			<span className="text-[10px] text-muted-foreground/50 ml-auto">
				{count}
			</span>
		</div>
	);

	return (
		<>
			{isOpen && (
				<div
					className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[150]"
					onClick={onClose}
				/>
			)}
			<div
				className={`fixed top-0 right-0 h-full w-[380px] max-w-[90vw] bg-card border-l border-border shadow-2xl z-[160] transform transition-transform duration-300 ease-out ${
					isOpen ? "translate-x-0" : "translate-x-full"
				}`}
			>
				<div className="h-full flex flex-col">
					<div className="flex items-center justify-between p-4 border-b border-border">
						<div className="flex items-center gap-2">
							<UserPlus className="w-5 h-5 text-primary" />
							<h2 className="font-bold text-foreground">邀请好友</h2>
						</div>
						<button
							onClick={onClose}
							className="p-2 rounded-lg hover:bg-muted transition-colors"
						>
							<X className="w-4 h-4 text-muted-foreground" />
						</button>
					</div>
					<div className="p-4 border-b border-border">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
							<input
								type="text"
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
								placeholder="搜索好友..."
								className="w-full h-10 pl-10 pr-3 text-sm bg-muted/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							/>
						</div>
					</div>
					<div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
						{filteredFriends.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
								<User className="w-8 h-8 opacity-30" />
								<p className="text-xs">未找到匹配好友</p>
							</div>
						) : (
							<>
								{onlineGroup.length > 0 && (
									<>
										<SectionHeader
											label="在线"
											count={onlineGroup.length}
											color="bg-emerald-500"
										/>
										{onlineGroup.map(renderFriend)}
									</>
								)}
								{midGroup.length > 0 && (
									<>
										<div className="h-3" />
										<SectionHeader
											label="离开 / 忙碌"
											count={midGroup.length}
											color="bg-amber-500"
										/>
										{midGroup.map(renderFriend)}
									</>
								)}
								{offlineGroup.length > 0 && (
									<>
										<div className="h-3" />
										<SectionHeader
											label="离线"
											count={offlineGroup.length}
											color="bg-muted-foreground/40"
										/>
										{offlineGroup.map(renderFriend)}
									</>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
