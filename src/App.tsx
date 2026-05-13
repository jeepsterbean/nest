import { useEffect, useState } from "react";
import Popup from "./Popup";
import Dashboard from "./Dashboard";
import "./App.css";

function App() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return hash.startsWith("#/popup") ? <Popup /> : <Dashboard />;
}

export default App;
