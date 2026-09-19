import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

import { UserProvider } from "./context/UserContext";
import DevPanel from "./components/DevPanel";
import FreelancerProfilePage from "./pages/FreelancerProfilePage";
import HomePage from "./pages/HomePage";
import ProfileRedirect from "./pages/ProfileRedirect";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";


const LuluApp = lazy(() => import("./lulu/LuluApp"));
const LuluDeveloperPage = lazy(() => import("./lulu/LuluDeveloperPage"));
const RestaurantAccess = lazy(() => import("./resto/RestaurantAccess"));
const RestoPage = lazy(() => import("./resto/RestoPage"));
const RestoListPage = lazy(() => import("./resto/RestoListPage"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminAccountPage = lazy(() => import("./pages/AdminAccountPage"));
const ClientDashboardPage = lazy(() => import("./pages/ClientDashboardPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));

const Loading = () => <p role="status" className="p-8 text-center text-sm text-eb-secondary">Chargement…</p>;

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || "no-google-oauth"}>
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
          <Route path="/profile" element={<Suspense fallback={<Loading />}><ProfileRedirect /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<Loading />}><AdminDashboardPage /></Suspense>} />
          <Route path="/admin/accounts/:id" element={<Suspense fallback={<Loading />}><AdminAccountPage /></Suspense>} />
          <Route path="/client" element={<Suspense fallback={<Loading />}><ClientDashboardPage /></Suspense>} />
          <Route
            path="/resto"
            element={<Suspense fallback={<Loading />}><RestoListPage /></Suspense>}
          />
          <Route
            path="/resto/:slug"
            element={<Suspense fallback={<Loading />}><RestoPage /></Suspense>}
          />
          <Route path="/resto/:slug/acces" element={<Suspense fallback={<Loading />}><RestaurantAccess /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {import.meta.env.DEV && <DevPanel />}
      </BrowserRouter>
    </UserProvider>
    </GoogleOAuthProvider>
  );
}
