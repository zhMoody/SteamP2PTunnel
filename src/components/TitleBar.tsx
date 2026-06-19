import {getCurrentWindow} from "@tauri-apps/api/window";
import {Check, Minus, X} from "lucide-react";
import {useEffect, useState} from "react";

const isTauri =
	typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
const appWindow = isTauri ? getCurrentWindow() : null;

async function isMainWindow() {
	try {
		const win = await getCurrentWindow();
		const label = (win as any).label ?? "";
		return label === "main" || !label;
	} catch {
		return true;
	}
}

export function TitleBar() {
	const [showDialog, setShowDialog] = useState(false);
	const [mainWin, setMainWin] = useState(true);
	const [rememberChoice, setRememberChoice] = useState(false);

	useEffect(() => {
		isMainWindow().then(setMainWin);
		// 监听托盘菜单触发的 localStorage 变化
		const onStorage = () => {
			setRememberChoice(localStorage.getItem("close_action") !== null);
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	const handleMinimize = () => {
		const action = localStorage.getItem("minimize_action");
		if (mainWin && action === "tray") {
			appWindow?.hide();
		} else {
			appWindow?.minimize();
		}
	};

	const handleClose = () => {
		if (!mainWin) {
			appWindow?.close();
			return;
		}
		const action = localStorage.getItem("close_action");
		if (action === "tray") {
			appWindow?.hide();
			return;
		}
		if (action === "quit") {
			appWindow?.close();
			return;
		}
		setShowDialog(true);
	};

	return (
		<>
			<div className="h-10 bg-background border-b border-border/50 flex items-center justify-between select-none shrink-0 z-[100] relative">
				<div
					data-tauri-drag-region
					className="absolute inset-0 z-0 cursor-default"
				></div>

				<div className="flex items-center gap-2 px-4 pointer-events-none relative z-10">
					<div className="w-4 h-4 rounded bg-primary flex items-center justify-center">
						<div className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse"></div>
					</div>
					<span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
						Steam P2P Tunnel
					</span>
				</div>

				<div className="flex items-center h-full relative z-20">
					<button
						onClick={handleMinimize}
						className="h-full px-4 text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
					>
						<Minus size={14} />
					</button>
					<button
						onClick={handleClose}
						className="h-full px-4 text-muted-foreground hover:text-foreground hover:bg-destructive/10 transition-colors"
					>
						<X size={14} />
					</button>
				</div>
			</div>

			{/* 关闭确认弹窗 */}
			{showDialog && (
				<div className="fixed inset-0 z-[300] flex items-center justify-center bg-background/70 backdrop-blur-md">
					<div className="w-80 p-6 rounded-3xl bg-card border border-border shadow-2xl space-y-4">
						<div className="text-center space-y-2">
							<h3 className="text-lg font-black text-foreground">关闭窗口</h3>
							<p className="text-xs text-muted-foreground">
								Steam P2P Tunnel 仍在后台运行，连接不会中断。
							</p>
						</div>
						<div className="flex flex-col gap-2">
							<button
								onClick={() => {
									if (rememberChoice)
										localStorage.setItem("close_action", "tray");
									setShowDialog(false);
									appWindow?.hide();
								}}
								className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors active:scale-[0.98] text-sm"
							>
								缩小到托盘
							</button>
							<button
								onClick={() => {
									if (rememberChoice)
										localStorage.setItem("close_action", "quit");
									setShowDialog(false);
									appWindow?.close();
								}}
								className="w-full h-12 rounded-xl border border-destructive/30 text-destructive font-bold hover:bg-destructive/10 transition-colors active:scale-[0.98] text-sm"
							>
								完全关闭
							</button>
						</div>
						<div
							onClick={() => {
								const nv = !rememberChoice;
								setRememberChoice(nv);
								if (!nv) localStorage.removeItem("close_action");
							}}
							className="flex items-center gap-3 cursor-pointer select-none justify-center py-2 hover:bg-muted/50 rounded-xl transition-colors"
						>
							<div
								className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
									rememberChoice
										? "bg-primary text-primary-foreground"
										: "border-2 border-muted-foreground/30"
								}`}
							>
								{rememberChoice && <Check className="w-3.5 h-3.5" />}
							</div>
							<span className="text-xs text-muted-foreground">
								记住选择，下次不询问
							</span>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
