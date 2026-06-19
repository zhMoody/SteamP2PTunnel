import {listen} from "@tauri-apps/api/event";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {Minimize2, X} from "lucide-react";
import {useEffect, useState} from "react";

const appWindow =
	typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__
		? getCurrentWindow()
		: null;

export function TrayMenu() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const unlisten = listen("tray-context-menu", () => {
			setOpen((prev) => !prev);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	useEffect(() => {
		if (!open) return;
		const handler = () => setOpen(false);
		window.addEventListener("click", handler);
		return () => window.removeEventListener("click", handler);
	}, [open]);

	if (!open) return null;

	return (
		<div className="fixed z-[9999] bottom-0 right-2">
			<div
				className="w-52 rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
				style={{transform: "translateY(-48px)"}}
			>
				<div className="px-4 py-3 border-b border-border">
					<p className="text-xs font-bold text-foreground">Steam P2P Tunnel</p>
					<p className="text-[10px] text-muted-foreground">正在后台运行</p>
				</div>
				<button
					onClick={() => {
						setOpen(false);
						appWindow?.show();
						appWindow?.setFocus();
					}}
					className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors text-left"
				>
					<Minimize2 className="w-4 h-4 text-muted-foreground" />
					显示窗口
				</button>
				<div className="border-t border-border" />
				<button
					onClick={() => {
						setOpen(false);
						appWindow?.close();
					}}
					className="w-full flex items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
				>
					<X className="w-4 h-4" />
					完全关闭
				</button>
			</div>
		</div>
	);
}
