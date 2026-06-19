import {invoke} from "@tauri-apps/api/core";
import {Search, ShieldCheck, User, UserPlus} from "lucide-react";
import {useEffect, useState} from "react";
import {toast} from "react-hot-toast";
import {FriendInfo} from "../types";

export function FriendList() {
	const [friends, setFriends] = useState<FriendInfo[]>([]);
	const [filter, setFilter] = useState("");

	useEffect(() => {
		invoke<FriendInfo[]>("get_friends").then(setFriends).catch(console.error);
	}, []);

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
		<div
			className="flex flex-col h-full bg-transparent overflow-hidden"
			style={{overscrollBehavior: "contain"}}
		>
			<div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-primary/[0.02] shrink-0 gap-4">
				<div className="flex items-center gap-2 shrink-0">
					<ShieldCheck size={18} className="text-primary" />
					<h2 className="text-sm font-bold text-foreground uppercase tracking-widest whitespace-nowrap">
						邀请好友
					</h2>
				</div>

				<div className="relative flex-1 max-w-[160px]">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
					<input
						type="text"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="快速搜索..."
						className="w-full bg-background/50 border border-border rounded-xl pl-9 pr-3 py-2 text-[11px] text-foreground focus:outline-none focus:border-primary/50 focus:bg-background/80 transition-all placeholder:text-muted-foreground shadow-inner"
					/>
				</div>
			</div>

			{/* Friends List */}
			<div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1 min-h-0">
				{filteredFriends.map((friend) => (
					<div
						key={friend.id}
						className="flex items-center justify-between p-3 rounded-xl hover:bg-primary/[0.03] transition-all group border border-transparent hover:border-border/50 hover:shadow-lg"
					>
						<div className="flex items-center gap-4 overflow-hidden">
							<div className="w-10 h-10 rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center shrink-0 group-hover:border-primary/30 group-hover:bg-muted transition-all shadow-inner">
								<User
									size={16}
									className="text-muted-foreground group-hover:text-primary"
								/>
							</div>
							<div className="flex flex-col overflow-hidden">
								<span className="text-foreground text-sm truncate font-semibold group-hover:text-foreground transition-colors">
									{friend.name}
								</span>
								<span className="text-[10px] text-muted-foreground font-mono tracking-tighter">
									OFFLINE / READY
								</span>
							</div>
						</div>
						<button
							onClick={() => handleInvite(friend.id, friend.name)}
							className="bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground p-2.5 rounded-xl transition-all opacity-0 group-hover:opacity-100 shadow-lg border border-primary/20 active:scale-90"
							title="邀请加入"
						>
							<UserPlus size={18} />
						</button>
					</div>
				))}
				{filteredFriends.length === 0 && (
					<div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
						<div className="w-12 h-12 rounded-full border border-dashed border-border flex items-center justify-center">
							<Search size={20} className="text-muted-foreground" />
						</div>
						<p className="text-[11px] font-bold uppercase tracking-widest italic">
							未找到匹配的好友
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
