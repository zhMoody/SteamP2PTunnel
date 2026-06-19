import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import {AppProvider} from "./AppContext";
import {LogPanel} from "./components/LogPanel";

const search = window.location.search;
const params = new URLSearchParams(search);
const isLogView = params.get("view") === "logs";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		{isLogView ? (
			<div className="h-screen w-screen bg-background">
				<LogPanel isOpen={true} onClose={() => window.close()} />
			</div>
		) : (
			<AppProvider>
				<App />
			</AppProvider>
		)}
	</React.StrictMode>
);
