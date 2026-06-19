import {getCurrentWindow} from "@tauri-apps/api/window";
import {Copy, Minus, Square, X} from "lucide-react";
import {useEffect, useState} from "react";

const isTauri =
	typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
const appWindow = isTauri ? getCurrentWindow() : null;

export function TitleBar() {
	const [isMaximized, setIsMaximized] = useState(false);

	useEffect(() => {
		if (!appWindow) return;
		const updateMaximized = async () => {
			const maximized = await appWindow.isMaximized();
			setIsMaximized(maximized);
		};

		const unlisten = appWindow.onResized(() => {
			updateMaximized();
		});

		return () => {
			unlisten.then((f) => f());
		};
	}, []);

	return (
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
					onClick={() => appWindow?.toggleMaximize()}
					className="h-full px-4 text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-colors"
				>
					{isMaximized ? (
						<Copy size={12} className="rotate-180" />
					) : (
						<Square size={12} />
					)}
				</button>
				<button
					onClick={() => appWindow?.close()}
					className="h-full px-4 text-muted-foreground hover:text-foreground hover:bg-destructive transition-colors rounded-none"
				>
					<X size={16} />
				</button>
			</div>
		</div>
	);
}
