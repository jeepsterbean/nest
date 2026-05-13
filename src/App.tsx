import { useEffect, useState } from "react";
import Popup from "./Popup";
import WorkPopup from "./WorkPopup";
import Dashboard from "./Dashboard";
import "./App.css";

function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (hash.startsWith("#/popup")) return <Popup />;
  if (hash.startsWith("#/work")) return <WorkPopup />;
  return <Dashboard />;
}

export default App;
