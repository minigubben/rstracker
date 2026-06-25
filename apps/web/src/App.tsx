import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { api } from "./lib/api";
import { CharacterDetailPage } from "./pages/character-detail-page";
import { CharactersPage } from "./pages/characters-page";
import { LoginPage } from "./pages/login-page";

function ProtectedLayout() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: api.me,
    retry: false,
  });

  if (sessionQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-white">
        Loading...
      </div>
    );
  }

  if (sessionQuery.isError) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function LoginLayout() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: api.me,
    retry: false,
  });

  if (sessionQuery.isSuccess) {
    return <Navigate to="/characters" replace />;
  }

  return <LoginPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginLayout />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to="/characters" replace />} />
        <Route path="/characters" element={<CharactersPage />} />
        <Route path="/characters/:characterId" element={<CharacterDetailPage />} />
      </Route>
    </Routes>
  );
}
