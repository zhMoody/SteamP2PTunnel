import {invoke} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {ExternalLink, Minus, X} from "lucide-react";
import {useEffect, useState} from "react";

function save(key: string, value: string) {
	localStorage.setItem(key, value);
	window.dispatchEvent(new StorageEvent("storage", {key, newValue: value}));
}

export function TrayMenuView() {
	const [minAction, setMinAction] = useState(
		() => localStorage.getItem("minimize_action") || ""
	);
	const [closeAction, setCloseAction] = useState(
		() => localStorage.getItem("close_action") || ""
	);

	useEffect(() => {
		document.documentElement.classList.add("dark");
		document.body.style.background = "transparent";
		document.documentElement.style.background = "transparent";
	}, []);

	const showWindow = async () => {
		await invoke("show_main_window");
		await getCurrentWindow().close();
	};

	const quit = async () => {
		await getCurrentWindow().close();
		await invoke("quit_app", {}).catch(() => {});
	};

	return (
		<div className="h-screen w-screen bg-transparent flex items-start justify-center p-0 select-none">
			<div className="mt-2 w-[230px] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
				<div className="px-4 py-3 border-b border-border">
					<p className="text-xs font-bold text-foreground">Steam P2P Tunnel</p>
					<p className="text-[10px] text-muted-foreground">正在后台运行</p>
				</div>

				<button
					onClick={showWindow}
					className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-left"
				>
					<ExternalLink className="w-4 h-4 text-muted-foreground" />
					显示窗口
				</button>

				<div className="border-t border-border" />

				{/* 快捷设置 */}
				<div className="px-4 py-2 space-y-0.5">
					<p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold pb-1">
						按钮行为
					</p>
					<Row
						icon={<Minus className="w-3 h-3 text-muted-foreground" />}
						label="缩小 → 托盘"
						active={minAction === "tray"}
						onToggle={() => {
							const v = minAction === "tray" ? "" : "tray";
							setMinAction(v);
							save("minimize_action", v);
						}}
					/>
					<Row
						icon={<Minus className="w-3 h-3 text-muted-foreground" />}
						label="关闭 → 托盘"
						active={closeAction === "tray"}
						onToggle={() => {
							const v = closeAction === "tray" ? "" : "tray";
							setCloseAction(v);
							save("close_action", v);
						}}
					/>
					<Row
						icon={<X className="w-3 h-3 text-destructive" />}
						label="关闭 → 退出程序"
						active={closeAction === "quit"}
						danger
						onToggle={() => {
							const v = closeAction === "quit" ? "" : "quit";
							setCloseAction(v);
							save("close_action", v);
						}}
					/>
				</div>

				<div className="border-t border-border" />

				<button
					onClick={quit}
					className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
				>
					<X className="w-4 h-4" />
					完全关闭程序
				</button>
			</div>
		</div>
	);
}

function Row({
	icon,
	label,
	active,
	danger,
	onToggle
}: {
	icon: React.ReactNode;
	label: string;
	active: boolean;
	danger?: boolean;
	onToggle: () => void;
}) {
	return (
		<div
			className="flex items-center justify-between py-1.5 px-0.5 cursor-pointer hover:bg-muted/50 rounded-md"
			onClick={onToggle}
		>
			<div className="flex items-center gap-2.5">
				{icon}
				<span
					className={`text-xs ${danger ? "text-destructive" : "text-foreground"}`}
				>
					{label}
				</span>
			</div>
			<div
				className={`w-8 h-5 rounded-full transition-colors relative shrink-0 ${
					active
						? danger
							? "bg-destructive"
							: "bg-primary"
						: "bg-muted-foreground/20"
				}`}
			>
				<div
					className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
						active ? "translate-x-3.5" : "translate-x-0.5"
					}`}
				/>
			</div>
		</div>
	);
}
