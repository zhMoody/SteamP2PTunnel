import {invoke} from "@tauri-apps/api/core";
import {Search, User, UserPlus, X} from "lucide-react";
import {useEffect, useState} from "react";
import {toast} from "react-hot-toast";
import {FriendInfo} from "../types";

interface Props {
	isOpen: boolean;
	onClose: () => void;
}

export function FriendList({isOpen, onClose}: Props) {
	const [friends, setFriends] = useState<FriendInfo[]>([]);
	const [filter, setFilter] = useState("");

	useEffect(() => {
		if (!isOpen) return;
		invoke<FriendInfo[]>("get_friends").then(setFriends).catch(console.error);
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

	return (
		<>
			{/* Backdrop */}
			{isOpen && (
				<div
					className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[150]"
					onClick={onClose}
				/>
			)}

			{/* Drawer */}
			<div
				className={`fixed top-0 right-0 h-full w-[320px] max-w-[85vw] bg-card border-l border-border shadow-2xl z-[160] transform transition-transform duration-300 ease-out ${
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
						{filteredFriends.map((friend) => (
							<div
								key={friend.id}
								className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-colors group"
							>
								<div className="flex items-center gap-3 overflow-hidden">
									<div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
										<User className="w-4 h-4 text-muted-foreground" />
									</div>
									<span className="text-sm font-medium text-foreground truncate">
										{friend.name}
									</span>
								</div>
								<button
									onClick={() => handleInvite(friend.id, friend.name)}
									className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors opacity-0 group-hover:opacity-100"
								>
									<UserPlus className="w-4 h-4" />
								</button>
							</div>
						))}
						{filteredFriends.length === 0 && (
							<div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
								<User className="w-8 h-8 opacity-30" />
								<p className="text-xs">未找到匹配好友</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
