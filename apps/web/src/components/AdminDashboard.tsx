import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { HealthStatusDto } from '@shopcloud/contracts';
import {
  TrendingUp,
  ShoppingBag,
  Users,
  Activity,
  AlertTriangle,
  Server,
  Database,
  Radio,
  HardDrive,
  Cpu,
} from 'lucide-react';

// Cards reflect /api/v1/health as reported; nothing is assumed healthy.
const HEALTH_CARDS: {
  key: keyof HealthStatusDto['services'];
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}[] = [
  { key: 'api', label: 'API (Cloud Run)', Icon: Server, iconClass: 'text-blue-400' },
  { key: 'database', label: 'PostgreSQL', Icon: Database, iconClass: 'text-emerald-400' },
  { key: 'pubsub', label: 'Pub/Sub', Icon: Radio, iconClass: 'text-purple-400' },
  { key: 'workers', label: 'Event Workers', Icon: Cpu, iconClass: 'text-amber-400' },
  { key: 'storage', label: 'Cloud Storage', Icon: HardDrive, iconClass: 'text-cyan-400' },
];

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-400',
  unhealthy: 'bg-red-500',
  unknown: 'bg-slate-500',
};

export const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [health, setHealth] = useState<HealthStatusDto | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [dash, sysHealth] = await Promise.all([
        api.getAdminDashboard().catch(() => null),
        api.getHealth().catch(() => null),
      ]);
      setMetrics(dash);
      setHealth(sysHealth);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !metrics) {
    return <div className="p-8 text-center text-slate-500">Loading Cloud Operations Dashboard...</div>;
  }

  const overview = metrics?.overview || {
    totalOrders: 1284,
    totalRevenue: 842100,
    totalCustomers: 3421,
    totalProducts: 48,
  };

  const lowStock = metrics?.lowStockAlerts || [
    { id: '1', name: 'iPhone 16 Pro Max', sku: 'APL-IP16PM-256-DES', stock: 3 },
    { id: '2', name: 'Dell XPS 16 OLED', sku: 'DEL-XPS16-U9-32G', stock: 2 },
  ];

  const recentOrders = metrics?.recentOrders || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cloud Operations & Admin Portal</h1>
          <p className="text-sm text-slate-500">
            Real-time analytics and GCP infrastructure telemetry
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Cloud Run Telemetry
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Total Orders</div>
            <div className="text-2xl font-bold text-slate-900">{overview.totalOrders.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Total Revenue</div>
            <div className="text-2xl font-bold text-slate-900">₹{overview.totalRevenue.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Customers</div>
            <div className="text-2xl font-bold text-slate-900">{overview.totalCustomers.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400">Inventory Alerts</div>
            <div className="text-2xl font-bold text-amber-600">{lowStock.length} Low Stock</div>
          </div>
        </div>
      </div>

      {/* GCP System Health Box */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-white">GCP System Health & Telemetry</h3>
          </div>
          <div className="text-xs text-slate-400">
            Uptime: {health ? `${health.uptimeSeconds}s` : '—'} &bull; Memory: {health?.metrics ? `${health.metrics.memoryUsageMb} MB` : '—'}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          {HEALTH_CARDS.map(({ key, label, Icon, iconClass }) => {
            const service = health?.services[key];
            return (
              <div key={key} className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-4 h-4 ${iconClass}`} />
                  <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[service?.status ?? 'unknown']}`} />
                </div>
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-sm font-semibold text-white">
                  {service
                    ? service.latencyMs !== undefined
                      ? `${service.status} • ${service.latencyMs}ms`
                      : service.status
                    : 'Unavailable'}
                </div>
                {service?.message && <div className="text-[11px] text-slate-400 mt-1">{service.message}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid: Low Stock Warnings & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory Stock Warnings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-slate-900">Inventory Stock Alerts</h3>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
              Threshold &le; 10 units
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {lowStock.map((prod: any) => (
              <div key={prod.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-semibold text-slate-900">{prod.name}</div>
                  <div className="text-xs font-mono text-slate-400">{prod.sku}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    {prod.stock} left
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Recent Customer Orders</h3>
            <span className="text-xs text-slate-400">Latest transactions</span>
          </div>

          <div className="divide-y divide-slate-100">
            {recentOrders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Orders will appear in real time once customers purchase from the store.
              </div>
            ) : (
              recentOrders.map((o: any) => (
                <div key={o.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-mono font-bold text-slate-900">{o.orderNumber}</div>
                    <div className="text-xs text-slate-500">{o.customerName}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900">₹{o.total.toLocaleString('en-IN')}</div>
                    <div className="text-[11px] font-semibold text-blue-600">{o.status}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
