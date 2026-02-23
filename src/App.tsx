import { BrowserRouter, Routes, Route } from "react-router";
import HomePage from "./pages/HomePage";
import ReaderPage from "./pages/ReaderPage";
import TextReaderPage from "./pages/TextReaderPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/read" element={<ReaderPage />} />
        <Route path="/read-text" element={<TextReaderPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
