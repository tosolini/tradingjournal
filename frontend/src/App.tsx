import type { JSX } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { getMe } from "./lib/api";
import { AccountsPage } from "./pages/AccountsPage";
import { AssetsPage } from "./pages/AssetsPage";
import { BrokersPage } from "./pages/BrokersPage";
import { CalendarPage } from "./pages/CalendarPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { NotesPage } from "./pages/NotesPage";
import { PerformancePage } from "./pages/PerformancePage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { HoldingDetailPage } from "./pages/HoldingDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TradeDetailPage } from "./pages/TradeDetailPage";
import { TradeEditPage } from "./pages/TradeEditPage";
import { TradeImagesPage } from "./pages/TradeImagesPage";
import { TradesPage } from "./pages/TradesPage";
import TickersPage from "./pages/TickersPage";
import HelpPage from "./pages/HelpPage";

function Protected({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem("token");
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function OnboardingGate({ children }: { children: JSX.Element }) {
  const { data: me, isLoading, isError } = useQuery({ queryKey: ["me"], queryFn: getMe });
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-400">…</p>
      </div>
    );
  }
  if (isError || !me) {
    return <Navigate to="/login" replace />;
  }
  if (me.must_change_password) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <Protected>
            <OnboardingPage />
          </Protected>
        }
      />
      <Route
        path="/*"
        element={
          <Protected>
            <OnboardingGate>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/portfolio/holdings/:holdingId" element={<HoldingDetailPage />} />
                <Route path="/portfolio/:holdingId" element={<HoldingDetailPage />} />
                <Route path="/performance" element={<PerformancePage />} />
                <Route path="/assets" element={<AssetsPage />} />
                <Route path="/trades" element={<TradesPage />} />
                <Route path="/trades/:tradeId" element={<TradeDetailPage />} />
                <Route path="/trades/:tradeId/edit" element={<TradeEditPage />} />
                <Route path="/trades/:tradeId/images" element={<TradeImagesPage />} />
                <Route path="/stats" element={<DashboardPage />} />
                <Route path="/notes" element={<NotesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/brokers" element={<BrokersPage />} />
                <Route path="/settings/brokers" element={<BrokersPage />} />
                <Route path="/tickers" element={<TickersPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/help/:section" element={<HelpPage />} />
              </Routes>
            </Layout>
            </OnboardingGate>
          </Protected>
        }
      />
    </Routes>
  );
}
