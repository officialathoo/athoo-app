import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { UsersPage } from "@/pages/UsersPage";
import { ProvidersPage } from "@/pages/ProvidersPage";
import { BookingsPage } from "@/pages/BookingsPage";
import { VerificationPage } from "@/pages/VerificationPage";
import { FinancePage } from "@/pages/FinancePage";
import { BroadcastsPage } from "@/pages/BroadcastsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ComplaintsPage } from "@/pages/ComplaintsPage";
import { AdminUsersPage } from "@/pages/AdminUsersPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { AuditLogPage } from "@/pages/AuditLogPage";
import { PromotionsPage } from "@/pages/PromotionsPage";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { PaymentAccountsPage } from "@/pages/PaymentAccountsPage";
import { CommissionPaymentsPage } from "@/pages/CommissionPaymentsPage";
import { SubscriptionPlansPage } from "@/pages/SubscriptionPlansPage";
import { RequestsPage } from "@/pages/RequestsPage";
import { WithdrawalsPage } from "@/pages/WithdrawalsPage";
import { RefundsPage } from "@/pages/RefundsPage";
import { MarketingPage } from "@/pages/MarketingPage";
import { FaqsPage } from "@/pages/FaqsPage";
import { LiveJobsPage } from "@/pages/LiveJobsPage";
import { ReportedIssuesPage } from "@/pages/ReportedIssuesPage";
import { RateRequestsPage } from "@/pages/RateRequestsPage";
import { EmergencyContactsPage } from "@/pages/EmergencyContactsPage";
import { NotificationTemplatesPage } from "@/pages/NotificationTemplatesPage";
import { LoginHistoryPage } from "@/pages/LoginHistoryPage";
import { BlacklistPage } from "@/pages/BlacklistPage";
import { InvoicesPage } from "@/pages/InvoicesPage";
import { SearchPage } from "@/pages/SearchPage";
import { UserActivityPage } from "@/pages/UserActivityPage";
import { useAdmin } from "@/hooks/useAdmin";
import { Loader2, Lock } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Lock size={28} className="text-slate-400" />
      </div>
      <h2 className="text-lg font-semibold text-slate-700">Access Restricted</h2>
      <p className="text-sm text-slate-400 mt-1 max-w-xs">
        You don't have permission to view this page. Contact your super admin to request access.
      </p>
    </div>
  );
}

function AppShell() {
  const { token, admin, loading, login, logout } = useAdmin();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!token) {
    return <LoginPage onLogin={login} />;
  }

  const adminRole = (admin as any)?.adminRole;
  const perms: string[] = (admin as any)?.adminPermissions ?? [];
  const isSuperAdmin = adminRole === "super_admin";

  function can(perm: string) {
    return isSuperAdmin || perms.includes(perm);
  }

  function Guard({ perm, children }: { perm: string; children: React.ReactNode }) {
    if (!can(perm)) return <AccessDenied />;
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar admin={admin} onLogout={logout} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header pathname={location} />
        <main className="flex-1 overflow-y-auto p-6">
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/users">
              <Guard perm="users.read"><UsersPage /></Guard>
            </Route>
            <Route path="/providers">
              <Guard perm="users.read"><ProvidersPage /></Guard>
            </Route>
            <Route path="/bookings">
              <Guard perm="operations.read"><BookingsPage /></Guard>
            </Route>
            <Route path="/verification">
              <Guard perm="providers.write"><VerificationPage /></Guard>
            </Route>
            <Route path="/finance">
              <Guard perm="finance.read"><FinancePage /></Guard>
            </Route>
            <Route path="/commission">
              <Guard perm="finance.read"><CommissionPaymentsPage /></Guard>
            </Route>
            <Route path="/withdrawals">
              <Guard perm="finance.write"><WithdrawalsPage /></Guard>
            </Route>
            <Route path="/refunds">
              <Guard perm="finance.write"><RefundsPage /></Guard>
            </Route>
            <Route path="/requests">
              <Guard perm="operations.read"><RequestsPage /></Guard>
            </Route>
            <Route path="/broadcasts">
              <Guard perm="broadcast.write"><BroadcastsPage /></Guard>
            </Route>
            <Route path="/complaints">
              <Guard perm="support.write"><ComplaintsPage /></Guard>
            </Route>
            <Route path="/marketing">
              <Guard perm="marketing.write"><MarketingPage /></Guard>
            </Route>
            <Route path="/faqs">
              <Guard perm="marketing.write"><FaqsPage /></Guard>
            </Route>
            <Route path="/promotions">
              <Guard perm="promotions.write"><PromotionsPage /></Guard>
            </Route>
            <Route path="/reports">
              <Guard perm="reports.read"><ReportsPage /></Guard>
            </Route>
            <Route path="/audit-log">
              <Guard perm="audit.read"><AuditLogPage /></Guard>
            </Route>
            <Route path="/categories" component={CategoriesPage} />
            <Route path="/payment-accounts">
              <Guard perm="finance.read"><PaymentAccountsPage /></Guard>
            </Route>
            <Route path="/plans" component={SubscriptionPlansPage} />
            <Route path="/admin-users" component={AdminUsersPage} />
            <Route path="/blacklist" component={BlacklistPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/live-jobs">
              <Guard perm="operations.read"><LiveJobsPage /></Guard>
            </Route>
            <Route path="/reported-issues">
              <Guard perm="support.write"><ReportedIssuesPage /></Guard>
            </Route>
            <Route path="/rate-requests">
              <Guard perm="providers.write"><RateRequestsPage /></Guard>
            </Route>
            <Route path="/emergency-contacts" component={EmergencyContactsPage} />
            <Route path="/notification-templates" component={NotificationTemplatesPage} />
            <Route path="/login-history">
              <Guard perm="audit.read"><LoginHistoryPage /></Guard>
            </Route>
            <Route path="/invoices">
              <Guard perm="finance.read"><InvoicesPage /></Guard>
            </Route>
            <Route path="/search">
              <Guard perm="operations.read"><SearchPage /></Guard>
            </Route>
            <Route path="/user-activity">
              <Guard perm="operations.read"><UserActivityPage /></Guard>
            </Route>
          </Switch>
        </main>
      </div>
    </div>
  );
}

function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={base}>
          <AppShell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
