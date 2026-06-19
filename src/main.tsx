import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import {AppProvider} from "./AppContext";
import {LogPanel} from "./components/LogPanel";
import {TrayMenuView} from "./components/TrayMenuView";

const search = window.location.search;
const params = new URLSearchParams(search);
const view = params.get("view");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		{view === "logs" ? (
			<div className="h-screen w-screen bg-background">
				<LogPanel isOpen={true} onClose={() => window.close()} />
			</div>
		) : view === "tray-menu" ? (
			<TrayMenuView />
		) : (
			<AppProvider>
				<App />
			</AppProvider>
		)}
	</React.StrictMode>
);
