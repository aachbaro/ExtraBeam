import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

import { UserProvider } from "./context/UserContext";
import FreelancerProfilePage from "./pages/FreelancerProfilePage";
import HomePage from "./pages/HomePage";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

function MaybeGoogleProvider({ children }: { children: ReactNode }) {
  if (!GOOGLE_CLIENT_ID) return <>{children}</>;
  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{children}</GoogleOAuthProvider>;
}

const LuluApp = lazy(() => import("./lulu/LuluApp"));
const LuluDeveloperPage = lazy(() => import("./lulu/LuluDeveloperPage"));
const RestoPage = lazy(() => import("./resto/RestoPage"));
const RestoListPage = lazy(() => import("./resto/RestoListPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));

const Loading = () => <p role="status" className="p-8 text-center text-sm text-eb-secondary">Chargement…</p>;

export default function App() {
  return (
    <MaybeGoogleProvider>
    <UserProvider>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/login"
            element={<Suspense fallback={<Loading />}><LoginPage /></Suspense>}
          />
          <Route
            path="/register"
            element={<Suspense fallback={<Loading />}><RegisterPage /></Suspense>}
          />
          <Route
            path="/auth/callback"
            element={<Suspense fallback={<Loading />}><AuthCallbackPage /></Suspense>}
          />
          <Route
            path="/lulu/admin"
            element={
              <Suspense fallback={<Loading />}>
                <LuluDeveloperPage />
              </Suspense>
            }
          />
          <Route
            path="/lulu/*"
            element={
              <Suspense fallback={<Loading />}>
                <LuluApp />
              </Suspense>
            }
          />
          <Route path="/extras/:slug" element={<FreelancerProfilePage />} />
          <Route
            path="/resto"
            element={<Suspense fallback={<Loading />}><RestoListPage /></Suspense>}
          />
          <Route
            path="/resto/:slug"
            element={<Suspense fallback={<Loading />}><RestoPage /></Suspense>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </UserProvider>
    </MaybeGoogleProvider>
  );
}
