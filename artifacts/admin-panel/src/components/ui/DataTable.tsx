import { Loader2 } from "lucide-react";

interface Column<T> {
  header: string;
  key?: keyof T;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  keyExtractor: (row: T) => string;
}

export function DataTable<T>({ columns, data, loading, emptyMessage = "No data found.", keyExtractor }: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin mr-2" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            {columns.map((col) => (
              <th
                key={col.header}
                className={`text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ${col.width || ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {data.map((row) => (
            <tr key={keyExtractor(row)} className="hover:bg-slate-50/60 transition-colors">
              {columns.map((col) => (
                <td key={col.header} className={`px-4 py-3 text-slate-700 ${col.width || ""}`}>
                  {col.render ? col.render(row) : col.key ? String(row[col.key] ?? "—") : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

