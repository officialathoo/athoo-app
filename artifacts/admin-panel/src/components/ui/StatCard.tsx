import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: string;
  trendUp?: boolean;
  to?: string;
}

export function StatCard({ label, value, icon: Icon, iconColor = "text-blue-600", iconBg = "bg-blue-50", trend, trendUp, to }: StatCardProps) {
  const inner = (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow${to ? " cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 group" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {trend && (
            <p className={`text-xs mt-1 font-medium ${trendUp ? "text-green-600" : "text-red-500"}`}>
              {trend}
            </p>
          )}
        </div>
        <div className={`${iconBg} p-2.5 rounded-lg shrink-0`}>
          <Icon size={20} className={iconColor} />
        </div>
      </div>
    </div>
  );

  if (to) {
    return <Link href={to} className="block no-underline">{inner}</Link>;
  }
  return inner;
}

