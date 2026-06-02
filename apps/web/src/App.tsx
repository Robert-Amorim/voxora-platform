import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleProtectedRoute from "./components/RoleProtectedRoute";
import Spinner from "./components/common/Spinner";

const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminTicketDetailPage = lazy(() => import("./pages/AdminTicketDetailPage"));
const AdminTicketsPage = lazy(() => import("./pages/AdminTicketsPage"));
const AdminUserDetailPage = lazy(() => import("./pages/AdminUserDetailPage"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const CarteiraPage = lazy(() => import("./pages/CarteiraPage"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const NewTranscriptionPage = lazy(() => import("./pages/NewTranscriptionPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const SupportPage = lazy(() => import("./pages/SupportPage"));
const TranscricaoDetailPage = lazy(() => import("./pages/TranscriptionDetailPage"));
const TranscricaoResultPage = lazy(() => import("./pages/TranscriptionResultPage"));
const TranscricoesPage = lazy(() => import("./pages/TranscricoesPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));

function RouteFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background-dark px-4 text-slate-100">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 px-5 py-4 shadow-2xl">
        <Spinner size="sm" className="text-primary" />
        <span className="font-body text-sm text-slate-300">Carregando experiência...</span>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <div id="main-content" tabIndex={-1}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/contato" element={<ContactPage />} />
            <Route path="/verificar-email" element={<VerifyEmailPage />} />
            <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/perfil" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/suporte" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
            <Route path="/transcricoes" element={<ProtectedRoute><TranscricoesPage /></ProtectedRoute>} />
            <Route path="/transcricoes/nova" element={<ProtectedRoute><NewTranscriptionPage /></ProtectedRoute>} />
            <Route path="/transcricoes/:id" element={<ProtectedRoute><TranscricaoDetailPage /></ProtectedRoute>} />
            <Route path="/transcricoes/:id/resultado" element={<ProtectedRoute><TranscricaoResultPage /></ProtectedRoute>} />
            <Route path="/carteira" element={<ProtectedRoute><CarteiraPage /></ProtectedRoute>} />
            <Route path="/admin" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminDashboardPage /></RoleProtectedRoute>} />
            <Route path="/admin/tickets" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminTicketsPage /></RoleProtectedRoute>} />
            <Route path="/admin/tickets/:id" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminTicketDetailPage /></RoleProtectedRoute>} />
            <Route path="/admin/users" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminUsersPage /></RoleProtectedRoute>} />
            <Route path="/admin/users/:id" element={<RoleProtectedRoute roles={["support", "admin"]}><AdminUserDetailPage /></RoleProtectedRoute>} />
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}
