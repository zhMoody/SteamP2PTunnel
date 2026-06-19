import {invoke} from "@tauri-apps/api/core";
import {Crown, Network, User} from "lucide-react";
import {useEffect, useState} from "react";
import {MemberInfo} from "../types";

export function MemberList() {
	const [members, setMembers] = useState<MemberInfo[]>([]);

	useEffect(() => {
		const fetchMembers = async () => {
			try {
				const res = await invoke<MemberInfo[]>("get_lobby_members");
				setMembers(res);
			} catch (e) {
				console.error(e);
			}
		};

		fetchMembers();
		const interval = setInterval(fetchMembers, 2000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="w-full space-y-2">
			{members.map((member, index) => (
				<div
					key={member.id}
					className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50"
				>
					<div className="flex items-center gap-3 overflow-hidden">
						<div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
							{index === 0 ? (
								<Crown className="w-4 h-4 text-primary" />
							) : (
								<User className="w-4 h-4 text-muted-foreground" />
							)}
						</div>
						<div className="flex flex-col min-w-0">
							<span className="text-sm font-medium text-foreground truncate">
								{member.name}
							</span>
							<span className="text-[10px] text-muted-foreground font-mono">
								ID: {member.id}
							</span>
						</div>
					</div>
					<div className="flex items-center gap-3 shrink-0">
						<div className="flex items-center gap-1 text-xs text-muted-foreground">
							<Network className="w-3 h-3" />
							<span className="font-mono">
								{member.ping < 0
									? "--"
									: member.ping === 0
										? "本机"
										: `${member.ping}ms`}
							</span>
						</div>
						<span className="text-[10px] px-2 py-0.5 rounded bg-muted border border-border text-muted-foreground">
							{member.relay}
						</span>
					</div>
				</div>
			))}
			{members.length === 0 && (
				<div className="text-center py-8 text-muted-foreground text-sm">
					等待成员加入...
				</div>
			)}
		</div>
	);
}
