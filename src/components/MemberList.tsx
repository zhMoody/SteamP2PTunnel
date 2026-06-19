import {invoke} from "@tauri-apps/api/core";
import {Crown, Network, User} from "lucide-react";
import {useEffect, useState} from "react";
import {MemberInfo} from "../types";

const getPingColor = (ping: number) => {
	if (ping < 0) return "text-muted-foreground";
	if (ping === 0) return "text-[rgb(var(--chart-1))]";
	if (ping < 80) return "text-[rgb(var(--chart-1))]";
	if (ping < 200) return "text-[rgb(var(--chart-4))]";
	return "text-destructive";
};

const getRelayStyle = (relay: string) => {
	if (relay.includes("本地") || relay.includes("Local"))
		return "bg-[rgb(var(--chart-1)/0.15)] text-[rgb(var(--chart-1))] border-[rgb(var(--chart-1)/0.25)]";
	if (relay.includes("P2P") || relay.includes("直连"))
		return "bg-[rgb(var(--chart-2)/0.15)] text-[rgb(var(--chart-2))] border-[rgb(var(--chart-2)/0.25)]";
	if (
		relay.includes("中继") ||
		relay.includes("Relay") ||
		relay.includes("SDR")
	)
		return "bg-[rgb(var(--chart-4)/0.15)] text-[rgb(var(--chart-4))] border-[rgb(var(--chart-4)/0.25)]";
	return "bg-muted text-muted-foreground border-border";
};

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
			{members.map((member, index) => {
				const isHost = index === 0;
				return (
					<div
						key={member.id}
						className="flex items-center gap-4 p-4 rounded-xl bg-muted/20 border border-border/50 hover:border-ring/30 transition-colors"
					>
						<div
							className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isHost ? "bg-[rgb(var(--chart-1)/0.15)] ring-1 ring-[rgb(var(--chart-1)/0.3)]" : "bg-muted"}`}
						>
							{isHost ? (
								<Crown className="w-5 h-5 text-[rgb(var(--chart-1))]" />
							) : (
								<User className="w-5 h-5 text-muted-foreground" />
							)}
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-sm font-semibold text-foreground truncate">
									{member.name}
								</span>
								{isHost && (
									<span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[rgb(var(--chart-1)/0.15)] text-[rgb(var(--chart-1))] uppercase tracking-wider">
										房主
									</span>
								)}
							</div>
							<span className="text-[10px] text-muted-foreground font-mono tracking-tight">
								{member.id}
							</span>
						</div>
						<div className="flex items-center gap-4 shrink-0">
							<div
								className={`flex items-center gap-1.5 text-xs font-mono font-semibold ${getPingColor(member.ping)}`}
							>
								<Network className="w-3.5 h-3.5" />
								{member.ping < 0
									? "--"
									: member.ping === 0
										? "本机"
										: `${member.ping}ms`}
							</div>
							<span
								className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${getRelayStyle(member.relay)}`}
							>
								{member.relay}
							</span>
						</div>
					</div>
				);
			})}
			{members.length === 0 && (
				<div className="text-center py-12 text-muted-foreground">
					<User className="w-8 h-8 mx-auto mb-3 opacity-20" />
					<p className="text-sm">等待成员加入...</p>
				</div>
			)}
		</div>
	);
}
