import { BrowserRouter, Routes, Route, useLocation } from "react-router";
import HomePage from "./pages/HomePage";
import ReaderPage from "./pages/ReaderPage";
import TextReaderPage from "./pages/TextReaderPage";

function AppLayout() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <>
      <div style={{ display: isHome ? "block" : "none" }}>
        <HomePage />
      </div>
      <Routes>
        <Route path="/read" element={<ReaderPage />} />
        <Route path="/read-text" element={<TextReaderPage />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
