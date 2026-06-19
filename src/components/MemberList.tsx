import {invoke} from "@tauri-apps/api/core";
import {Crown, Network, User} from "lucide-react";
import {useEffect, useState} from "react";
import {MemberInfo} from "../types";

const getPingColor = (ping: number) => {
	if (ping < 0) return "text-muted-foreground";
	if (ping === 0) return "text-[rgb(var(--chart-1))]";
	if (ping < 60) return "text-[rgb(var(--chart-5))]";
	if (ping < 120) return "text-[rgb(var(--chart-1))]";
	return "text-destructive";
};

const getRelayStyle = (relay: string) => {
	if (relay.includes("本地") || relay.includes("Local"))
		return "bg-[rgb(var(--chart-1)/0.15)] text-[rgb(var(--chart-1))] border-[rgb(var(--chart-1)/0.3)] font-bold";
	if (relay.includes("P2P") || relay.includes("直连"))
		return "bg-[rgb(var(--chart-5)/0.15)] text-[rgb(var(--chart-5))] border-[rgb(var(--chart-5)/0.3)] font-bold";
	if (
		relay.includes("中继") ||
		relay.includes("Relay") ||
		relay.includes("SDR")
	)
		return "bg-[rgb(var(--chart-2)/0.3)] text-[rgb(var(--chart-1))] border-[rgb(var(--chart-2)/0.5)] font-bold";
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
						className="flex items-center gap-3 p-4 rounded-2xl bg-muted/30 border-border"
					>
						<div
							className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isHost ? "bg-[rgb(var(--chart-1)/0.15)] ring-1 ring-[rgb(var(--chart-1)/0.3)]" : "bg-card border border-border"}`}
						>
							{isHost ? (
								<Crown className="w-4 h-4 text-[rgb(var(--chart-1))]" />
							) : (
								<User className="w-4 h-4 text-muted-foreground" />
							)}
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-sm font-semibold text-foreground truncate">
									{member.name}
								</span>
								{isHost && (
									<span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgb(var(--chart-1)/0.15)] text-[rgb(var(--chart-1))] uppercase tracking-wider">
										房主
									</span>
								)}
							</div>
						</div>
						<div className="flex items-center gap-3 shrink-0">
							<div
								className={`flex items-center gap-1 text-xs font-mono font-semibold w-14 justify-end ${getPingColor(member.ping)}`}
							>
								<Network className="w-3.5 h-3.5" />
								{member.ping < 0
									? "--"
									: member.ping === 0
										? "本机"
										: `${member.ping}ms`}
							</div>
							<span
								className={`text-[10px] font-bold px-2 py-1 rounded-lg border w-28 text-center ${getRelayStyle(member.relay)}`}
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
