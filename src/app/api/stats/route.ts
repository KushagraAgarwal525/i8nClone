import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { UsageStats } from "@/lib/types";

export async function GET() {
  const supabase = getSupabase();

  if (!supabase) {
    const stats: UsageStats = { totalEngines: 0, last24h: 0, topCompany: null, topLocale: null };
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  }

  const [totalResult, last24hResult, topCompanyResult, topLocaleResult] =
    await Promise.all([
      supabase.from("engine_runs").select("*", { count: "exact", head: true }),
      supabase
        .from("engine_runs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
      supabase.rpc("get_top_company"),
      supabase.rpc("get_top_locale"),
    ]);

  const topCompany = topCompanyResult.data?.[0] || null;
  const topLocale = topLocaleResult.data?.[0] || null;

  const stats: UsageStats = {
    totalEngines: totalResult.count || 0,
    last24h: last24hResult.count || 0,
    topCompany: topCompany ? { name: topCompany.name, count: Number(topCompany.count) } : null,
    topLocale: topLocale ? { locale: topLocale.locale, count: Number(topLocale.count) } : null,
  };

  return NextResponse.json(stats, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
