import { useEffect, useState } from "react";
import Popup from "./popup/Popup";
import Dashboard from "./dashboard/Dashboard";
import "./App.css";

function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (hash.startsWith("#/popup")) return <Popup />;
  return <Dashboard />;
}

export default App;
