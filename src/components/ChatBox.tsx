import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {MessageCircle, Send} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";
import {Virtuoso} from "react-virtuoso";

interface ChatMessage {
	sender_id: string;
	sender_name: string;
	text: string;
	timestamp: string;
}

export function ChatBox() {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [myId, setMyId] = useState<string | null>(null);
	const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
	const virtuosoRef = useRef<any>(null);

	useEffect(() => {
		invoke<string>("get_local_user_id").then(setMyId).catch(console.error);
		invoke<ChatMessage[]>("get_chat_history")
			.then((history) =>
				setMessages(
					history.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
				)
			)
			.catch(console.error);
	}, []);

	useEffect(() => {
		const unlisten = listen<ChatMessage>("chat-message", (event) => {
			setMessages((prev) => {
				const next = [...prev, event.payload];
				next.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
				return next;
			});
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	const send = async () => {
		const text = input.trim();
		if (!text) return;
		try {
			await invoke("send_chat_message", {text});
			setInput("");
		} catch (e) {
			console.error("发送消息失败", e);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	};

	const isSelf = (id: string) => myId !== null && id === myId;

	const itemContent = useCallback(
		(_index: number, msg: ChatMessage) => {
			const self = isSelf(msg.sender_id);
			return (
				<div
					className={`flex flex-col px-6 py-1.5 ${self ? "items-end" : "items-start"}`}
				>
					<span
						className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold mb-1 ${
							self
								? "bg-primary/15 text-foreground/60"
								: "bg-muted-foreground/10 text-muted-foreground"
						}`}
					>
						{self ? "我" : msg.sender_name}
						<span className="ml-1.5 font-normal opacity-50">
							{msg.timestamp}
						</span>
					</span>
					<div
						className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
							self
								? "bg-primary/20 text-foreground rounded-br-md"
								: "bg-muted rounded-bl-md"
						}`}
					>
						<p className="text-sm break-words">{msg.text}</p>
					</div>
				</div>
			);
		},
		[myId]
	);

	return (
		<div className="rounded-2xl bg-muted/30 border border-border overflow-hidden flex flex-col relative">
			{/* Disclaimer modal - 仅首次 */}
			{!disclaimerAccepted && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-2xl p-6">
					<div className="text-center space-y-4 max-w-xs">
						<div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 flex items-center justify-center">
							<MessageCircle className="w-6 h-6 text-amber-500" />
						</div>
						<div>
							<h3 className="text-sm font-bold text-foreground mb-1">
								大厅聊天须知
							</h3>
							<p className="text-xs text-muted-foreground leading-relaxed">
								Steam 聊天消息通过服务器广播，
								<b className="text-foreground">同房间所有人都能看到</b>。
								<br />
								<br />
								本聊天仅用于联机沟通，请自觉遵守：
								<br />
								· 不发送密码等敏感信息
								<br />
								· 不讨论政治、黄赌毒等敏感内容
								<br />· 发表内容需自行承担后果
							</p>
						</div>
						<button
							onClick={() => {
								setDisclaimerAccepted(true);
							}}
							className="h-10 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors active:scale-95"
						>
							知道了
						</button>
					</div>
				</div>
			)}

			{/* Header */}
			<div className="flex items-center gap-2 px-6 pt-4 pb-3 text-xs text-muted-foreground uppercase tracking-wider font-bold">
				<MessageCircle className="w-4 h-4" />
				大厅聊天
			</div>

			{/* Messages (虚拟列表) */}
			{messages.length === 0 ? (
				<div className="flex items-center justify-center h-[300px] text-xs text-muted-foreground/60 italic">
					暂无消息
				</div>
			) : (
				<Virtuoso
					ref={virtuosoRef}
					data={messages}
					itemContent={itemContent}
					className="custom-scrollbar"
					style={{height: "400px"}}
					followOutput={"smooth"}
					increaseViewportBy={{top: 200, bottom: 200}}
				/>
			)}

			{/* Input */}
			<div className="flex items-center gap-2 px-6 py-3 border-t border-border">
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="输入消息..."
					className="flex-1 h-10 px-4 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors"
				/>
				<button
					onClick={send}
					disabled={!input.trim()}
					className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shrink-0"
				>
					<Send className="w-4 h-4" />
				</button>
			</div>
		</div>
	);
}
