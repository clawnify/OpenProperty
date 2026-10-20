import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

createRoot(document.getElementById("app")!).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("KodiTrack could not register its service worker.", error);
    });
  });
}
