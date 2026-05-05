import { Search } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";

const PAGE_TITLES: Record<string, [string, string]> = {
  "/": ["Dashboard", "Live overview of users, bookings, revenue, and platform health"],
  "/users": ["Users", "Manage customer and provider accounts"],
  "/providers": ["Providers", "Control dues, commission limits, verification, and account status"],
  "/bookings": ["Bookings", "Track jobs, status flow, and platform revenue"],
  "/verification": ["Verification", "Review and approve provider verification requests"],
  "/requests": ["Broadcast Requests", "Open broadcast jobs from customers seeking providers"],
  "/live-jobs": ["Live Jobs Monitor", "Real-time view of active and in-progress bookings"],
  "/finance": ["Finance", "Platform revenue, provider dues, and commission analytics"],
  "/commission": ["Commission Payments", "Track and manage provider commission dues"],
  "/withdrawals": ["Withdrawals", "Review and process provider wallet withdrawal requests"],
  "/refunds": ["Refunds", "Process customer refund requests and disputes"],
  "/payment-accounts": ["Payment Accounts", "Manage provider payout bank and mobile wallet accounts"],
  "/broadcasts": ["Broadcasts", "Send platform-wide notices to customers, providers, or everyone"],
  "/marketing": ["Banners & Announcements", "Manage home screen banners and popup announcements"],
  "/promotions": ["Promotions", "Manage discount codes and promotional campaigns"],
  "/faqs": ["Help & FAQs", "Manage FAQ content shown to customers and providers"],
  "/complaints": ["Complaints & Support", "Manage support tickets and resolve customer/provider issues"],
  "/reported-issues": ["Reported Issues", "Review and action in-app content and behavior reports"],
  "/rate-requests": ["Rate Requests", "Provider requests to update their hourly or service rates"],
  "/categories": ["Service Categories", "Configure available service types and categories"],
  "/plans": ["Premium Plans", "Define subscription plans for customers and providers"],
  "/emergency-contacts": ["Emergency Contacts", "Manage emergency contact numbers shown in the app"],
  "/notification-templates": ["Notification Templates", "Edit automated push, SMS, and email message templates"],
  "/reports": ["Reports & Analytics", "Platform-wide performance metrics and CSV exports"],
  "/audit-log": ["Audit Log", "Complete history of all admin actions for accountability"],
  "/login-history": ["Login History", "Security log of all admin authentication events"],
  "/admin-users": ["Admin Users", "Manage admin accounts, roles, and permission sets"],
  "/settings": ["Settings", "Configure commission rates and platform rules"],
};

interface HeaderProps {
  pathname: string;
}

export function Header({ pathname }: HeaderProps) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const key = pathname.replace(base, "") || "/";
  const [title, subtitle] = PAGE_TITLES[key] || ["Admin Panel", "Athoo Operations Hub"];

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 hidden sm:block">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1">
        <button className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
          <Search size={18} />
        </button>
        <NotificationBell />
      </div>
    </header>
  );
}
