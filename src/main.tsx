import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const rootEl = document.getElementById("root");

function showBootError(error: unknown) {
	if (!rootEl) return;
	const message = error instanceof Error ? error.stack || error.message : String(error);
	rootEl.innerHTML = `<div style="min-height:100dvh;display:grid;place-items:center;padding:24px;background:#f3eee6;color:#1a1612;font-family:system-ui,sans-serif">
		<div style="max-width:520px">
			<h1 style="margin:0 0 8px">The house did not open</h1>
			<pre style="white-space:pre-wrap;color:#6a5f53;font-size:13px"></pre>
			<p><button type="button" style="border:0;border-radius:999px;padding:10px 16px;background:#1a1612;color:#f3eee6">Reload</button></p>
		</div>
	</div>`;
	const pre = rootEl.querySelector("pre");
	if (pre) pre.textContent = message;
	rootEl.querySelector("button")?.addEventListener("click", () => window.location.reload());
}

window.addEventListener("unhandledrejection", (event) => {
	if (rootEl?.getAttribute("data-booted") === "1") return;
	showBootError(event.reason);
});

import("./App.tsx")
	.then(({ default: App }) => {
		if (!rootEl) throw new Error("Missing #root");
		createRoot(rootEl).render(
			<StrictMode>
				<App />
			</StrictMode>,
		);
		rootEl.setAttribute("data-booted", "1");
	})
	.catch(showBootError);
