import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {
	Activity,
	AlertTriangle,
	Cpu,
	Database,
	Info,
	Shield,
	Terminal,
	Trash2,
	XCircle
} from "lucide-react";
import React, {useEffect, useRef, useState} from "react";
import {TitleBar} from "./TitleBar";

interface LogEntry {
	message: string;
	level: string;
	timestamp: string;
}

interface LogPanelProps {
	isOpen?: boolean;
	onClose?: () => void;
}

export const LogPanel: React.FC<LogPanelProps> = () => {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [filter, setFilter] = useState<string>("全部");
	const [memoryUsage, setMemoryUsage] = useState<string>("计算中...");
	const scrollRef = useRef<HTMLDivElement>(null);

	const filterMap: {[key: string]: string} = {
		全部: "ALL",
		信息: "INFO",
		警告: "WARN",
		錯誤: "ERROR"
	};

	useEffect(() => {
		const fetchHistory = async () => {
			try {
				const history = await invoke<LogEntry[]>("get_log_history");
				setLogs(history.reverse());
			} catch (e) {
				console.error("Failed to fetch log history:", e);
			}
		};

		fetchHistory();

		const unlisten = listen<{message: string; level: string}>(
			"log-event",
			(event) => {
				const newLog: LogEntry = {
					message: event.payload.message,
					level: event.payload.level,
					timestamp: new Date().toLocaleTimeString()
				};
				setLogs((prev) => [...prev.slice(-999), newLog]);
			}
		);

		const memoryInterval = setInterval(async () => {
			try {
				const usage = await invoke<string>("get_memory_usage");
				setMemoryUsage(usage);
			} catch (e) {
				console.error("Failed to fetch memory usage:", e);
				setMemoryUsage("Error");
			}
		}, 2000);

		return () => {
			unlisten.then((f) => f());
			clearInterval(memoryInterval);
		};
	}, []);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [logs, filter]);

	const getLevelStyle = (level: string) => {
		switch (level.toUpperCase()) {
			case "ERROR":
				return {
					text: "text-destructive",
					bg: "bg-destructive/10",
					border: "border-destructive/20",
					icon: <XCircle size={12} className="text-destructive" />
				};
			case "WARN":
				return {
					text: "text-accent-foreground",
					bg: "bg-accent/10",
					border: "border-accent/20",
					icon: <AlertTriangle size={12} className="text-accent-foreground" />
				};
			case "DEBUG":
				return {
					text: "text-primary",
					bg: "bg-primary/10",
					border: "border-primary/20",
					icon: <Terminal size={12} className="text-primary" />
				};
			default:
				return {
					text: "text-primary",
					bg: "bg-primary/10",
					border: "border-primary/20",
					icon: <Info size={12} className="text-primary" />
				};
		}
	};

	const displayLevel = (level: string) => {
		switch (level.toUpperCase()) {
			case "ERROR":
				return "CRITICAL";
			case "WARN":
				return "WARNING";
			case "INFO":
				return "SYSTEM";
			case "DEBUG":
				return "DEBUG";
			default:
				return level;
		}
	};

	const filteredLogs =
		filter === "全部"
			? logs
			: logs.filter((l) => l.level.toUpperCase() === filterMap[filter]);

	return (
		<div className="h-screen w-screen flex flex-col bg-background text-foreground font-mono select-text overflow-hidden border border-border shadow-2xl">
			<TitleBar />

			<header className="h-16 border-b border-border/50 flex items-center justify-between px-6 bg-card/40 backdrop-blur-xl shrink-0 z-20 relative">
				<div
					data-tauri-drag-region
					className="absolute inset-0 z-0 cursor-default"
				></div>

				<div className="flex items-center gap-6 pointer-events-none relative z-10">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
							<Terminal size={18} className="text-primary" />
						</div>
						<div>
							<h1 className="text-sm font-black text-foreground tracking-widest uppercase italic text-nowrap">
								Console
								<span className="text-primary not-italic ml-1">Kernel</span>
							</h1>
							<div className="flex items-center gap-2">
								<span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
								<span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-nowrap">
									Live Logs Streaming
								</span>
							</div>
						</div>
					</div>

					<div className="h-8 w-[1px] bg-border/50 mx-2"></div>

					<div className="flex bg-background/40 p-1 rounded-xl border border-border/50 shadow-inner pointer-events-auto">
						{["全部", "信息", "警告", "錯誤"].map((f) => (
							<button
								key={f}
								onClick={() => setFilter(f)}
								className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-300 uppercase tracking-wider ${
									filter === f
										? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-primary/20"
										: "text-muted-foreground hover:text-foreground hover:bg-primary/5"
								}`}
							>
								{f}
							</button>
						))}
					</div>
				</div>

				<div className="flex items-center gap-4 pointer-events-auto relative z-10">
					<button
						onClick={() => setLogs([])}
						className="flex items-center gap-2 px-3 py-2 bg-destructive/5 hover:bg-destructive/10 border border-destructive/10 rounded-xl group transition-all active:scale-95"
						title="清空控制台"
					>
						<Trash2
							size={16}
							className="text-destructive/50 group-hover:text-destructive"
						/>
						<span className="text-[10px] font-bold text-destructive/50 group-hover:text-destructive uppercase tracking-wider hidden sm:block">
							Clear
						</span>
					</button>
				</div>
			</header>

			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar bg-[radial-gradient(at_50%_0%,rgba(76,175,80,0.05)_0px,transparent_50%)]"
			>
				{filteredLogs.length === 0 ? (
					<div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-40 animate-pulse">
						<div className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center">
							<Database size={32} strokeWidth={1.5} />
						</div>
						<div className="text-center">
							<p className="text-xs font-black uppercase tracking-[0.3em]">
								Buffer Empty
							</p>
							<p className="text-[10px] italic mt-1 font-medium">
								Waiting for system kernel events...
							</p>
						</div>
					</div>
				) : (
					filteredLogs.map((log, i) => {
						const style = getLevelStyle(log.level);
						return (
							<div
								key={i}
								className="flex gap-4 items-start group hover:bg-primary/[0.03] transition-all rounded-xl p-3 -mx-2 border border-transparent hover:border-border/50 hover:shadow-xl relative overflow-hidden"
							>
								<div className="flex flex-col items-center shrink-0 w-20 pt-1">
									<span className="text-[10px] font-bold text-muted-foreground tabular-nums font-mono tracking-tighter">
										{log.timestamp}
									</span>
								</div>

								<div
									className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[9px] font-black shrink-0 w-24 justify-center uppercase tracking-wider shadow-inner ${style.bg} ${style.text} ${style.border}`}
								>
									{style.icon}
									{displayLevel(log.level)}
								</div>

								<div className="flex-1 text-[13px] leading-relaxed break-all text-foreground font-medium font-mono group-hover:text-foreground transition-colors">
									{log.message}
								</div>

								<div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
									<div className="w-1.5 h-1.5 rounded-full bg-primary/20"></div>
								</div>
							</div>
						);
					})
				)}
			</div>

			<footer className="h-10 border-t border-border/50 bg-card/60 backdrop-blur-xl px-6 flex items-center justify-between text-[10px] font-bold text-muted-foreground shrink-0 uppercase tracking-widest">
				<div className="flex items-center gap-6">
					<div className="flex items-center gap-2">
						<Shield size={12} className="text-primary" />
						<span>
							Kernel <span className="text-foreground">Active</span>
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Activity size={12} className="text-primary" />
						<span>
							Buffer{" "}
							<span className="text-foreground">{logs.length} Lines</span>
						</span>
					</div>
				</div>

				<div className="flex items-center gap-6">
					<div className="flex items-center gap-2">
						<Cpu size={12} className="text-purple-500" />
						<span>
							MEM{" "}
							<span className="text-foreground font-mono tracking-tight">
								{memoryUsage}
							</span>
						</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(76,175,80,0.5)]"></div>
						<span className="text-primary">Node Ready</span>
					</div>
				</div>
			</footer>

			<style
				dangerouslySetInnerHTML={{
					__html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
            `
				}}
			/>
		</div>
	);
};
