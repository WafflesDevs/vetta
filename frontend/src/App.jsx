import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, getToken, setToken } from "./api";
import Logo from "./Logo";
import LandingPage from "./pages/LandingPage";
import FeaturesPage from "./pages/FeaturesPage";
import PricingPage from "./pages/PricingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage, {
  capturePasswordRecoveryFromLocation,
} from "./pages/ResetPasswordPage";
import DashboardLayout from "./pages/dashboard/DashboardLayout";
import OverviewPage from "./pages/dashboard/OverviewPage";
import ChatPage from "./pages/ChatPage";
import HubPage from "./pages/HubPage";
import QuizPage from "./pages/QuizPage";
import SettingsPage from "./pages/SettingsPage";
import ResumePage from "./pages/ResumePage";
import PlansPage from "./pages/PlansPage";
import TryPage from "./pages/TryPage";

function Protected({ user, children }) {
 if (!user) return <Navigate to="/login" replace />;
 return children;
}

export default function App() {
 const [user, setUser] = useState(null);
 const [profile, setProfile] = useState(null);
 const [loading, setLoading] = useState(true);
 const navigate = useNavigate();

 // Capture recovery tokens before the loading screen / Strict Mode remount can drop the hash.
 if (
   typeof window !== "undefined" &&
   window.location.pathname.replace(/\/$/, "") === "/reset-password"
 ) {
   capturePasswordRecoveryFromLocation();
 }

 async function refreshMe() {
 if (!getToken()) {
 setUser(null);
 setProfile(null);
 return null;
 }
 const data = await api("/api/me");
 setUser(data.user);
 // Prefer top-level plan from /api/me so UI never lags a stale profile.plan.
 const nextProfile = data.profile
   ? { ...data.profile, plan: data.plan || data.profile.plan }
   : data.profile;
 setProfile(nextProfile);
 return data;
 }

 useEffect(() => {
 // Recovery link lands with hash tokens; don't race a stale JWT against /api/me.
 if (window.location.pathname.replace(/\/$/, "") === "/reset-password") {
 setLoading(false);
 return;
 }
 refreshMe()
 .catch(() => {
 setToken(null);
 setUser(null);
 })
 .finally(() => setLoading(false));
 }, []);

 async function handleLogout() {
 try {
 await api("/api/auth/logout", { method: "POST" });
 } catch {
 // ignore
 }
 setToken(null);
 setUser(null);
 setProfile(null);
 navigate("/");
 }

 if (loading) {
 return (
 <div className="loading-screen">
 <Logo size={52} />
 <div className="meta">Loading Vetta…</div>
 </div>
 );
 }

 return (
 <Routes>
 <Route path="/" element={<LandingPage user={user} />} />
 <Route path="/try" element={<TryPage user={user} />} />
 <Route path="/take-quiz" element={<Navigate to="/try" replace />} />
 <Route path="/features" element={<FeaturesPage user={user} />} />
 <Route path="/pricing" element={<PricingPage user={user} />} />
 <Route
 path="/login"
 element={
 user ? (
 <Navigate to="/app" replace />
 ) : (
 <LoginPage onAuth={refreshMe} />
 )
 }
 />
      <Route
        path="/signup"
        element={
          user ? (
            <Navigate to="/app" replace />
          ) : (
            <SignupPage onAuth={refreshMe} />
          )
        }
      />
      <Route
        path="/forgot-password"
        element={
          user ? (
            <Navigate to="/app" replace />
          ) : (
            <ForgotPasswordPage />
          )
        }
      />
      <Route
        path="/reset-password"
        element={<ResetPasswordPage onAuth={refreshMe} />}
      />

      <Route
        path="/app"
 element={
 <Protected user={user}>
 <DashboardLayout
 user={user}
 profile={profile}
 onLogout={handleLogout}
 onProfile={setProfile}
 />
 </Protected>
 }
 >
 <Route index element={<OverviewPage profile={profile} />} />
 <Route path="chat" element={<ChatPage profile={profile} />} />
 <Route path="chat/:chatId" element={<ChatPage profile={profile} />} />
 <Route
 path="hub"
 element={<HubPage profile={profile} onProfile={setProfile} />}
 />
 <Route path="quiz" element={<QuizPage />} />
 <Route
 path="resume"
 element={<ResumePage profile={profile} onProfile={setProfile} />}
 />
 <Route
 path="settings"
 element={<SettingsPage profile={profile} onProfile={setProfile} />}
 />
 <Route
 path="plans"
 element={<PlansPage profile={profile} onProfile={setProfile} />}
 />
 </Route>

 <Route path="/auth" element={<Navigate to="/login" replace />} />
 <Route path="/chat" element={<Navigate to="/app/chat" replace />} />
 <Route path="*" element={<Navigate to="/" replace />} />
 </Routes>
 );
}
