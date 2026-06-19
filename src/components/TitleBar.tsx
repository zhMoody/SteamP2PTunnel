import {getCurrentWindow} from "@tauri-apps/api/window";
import {Minus, X} from "lucide-react";
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

	useEffect(() => {
		isMainWindow().then(setMainWin);
	}, []);

	const handleClose = () => {
		if (mainWin) {
			setShowDialog(true);
		} else {
			appWindow?.close();
		}
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
						onClick={() => appWindow?.minimize()}
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
					<div className="w-80 p-6 rounded-3xl bg-card border border-border shadow-2xl space-y-5">
						<div className="text-center space-y-2">
							<h3 className="text-lg font-black text-foreground">退出?</h3>
							<p className="text-xs text-muted-foreground">
								Steam P2P Tunnel 仍在后台运行，连接不会中断。
							</p>
						</div>
						<div className="flex flex-col gap-2">
							<button
								onClick={() => {
									setShowDialog(false);
									appWindow?.hide();
								}}
								className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors active:scale-[0.98] text-sm"
							>
								缩小到托盘
							</button>
							<button
								onClick={() => {
									setShowDialog(false);
									appWindow?.close();
								}}
								className="w-full h-11 rounded-xl border border-destructive/30 text-destructive font-bold hover:bg-destructive/10 transition-colors active:scale-[0.98] text-sm"
							>
								完全关闭
							</button>
							<button
								onClick={() => setShowDialog(false)}
								className="w-full h-11 rounded-xl border border-border text-muted-foreground font-bold hover:bg-muted transition-colors active:scale-[0.98] text-sm"
							>
								取消
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
