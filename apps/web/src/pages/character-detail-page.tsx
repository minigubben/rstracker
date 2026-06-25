import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFrame } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type DetailViewMode = "focused" | "all";

function numberLabel(value: unknown) {
  if (typeof value === "number") {
    return value.toLocaleString();
  }
  return String(value ?? "");
}

function CompactMetricChart({
  points,
  valueKey,
  stroke,
}: {
  points: Array<Record<string, string | number>>;
  valueKey: string;
  stroke: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points}>
        <Tooltip
          contentStyle={{
            background: "rgba(12,16,22,0.94)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
          }}
          formatter={(value) => numberLabel(value)}
          labelFormatter={(value) => new Date(String(value)).toLocaleString()}
        />
        <Line type="monotone" dataKey={valueKey} stroke={stroke} strokeWidth={2.25} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CharacterDetailPage() {
  const params = useParams();
  const characterId = Number(params.characterId);
  const [viewMode, setViewMode] = useState<DetailViewMode>("all");
  const [skillMetricId, setSkillMetricId] = useState(0);
  const [skillValueField, setSkillValueField] = useState("xp");
  const [activityMetricId, setActivityMetricId] = useState(0);
  const [activityValueField, setActivityValueField] = useState("score");
  const [metricSearch, setMetricSearch] = useState("");
  const deferredMetricSearch = useDeferredValue(metricSearch);

  const detailQuery = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => api.getCharacter(characterId),
    enabled: Number.isFinite(characterId),
  });

  const metricsQuery = useQuery({
    queryKey: ["metrics", characterId],
    queryFn: () => api.getMetrics(characterId),
    enabled: Number.isFinite(characterId),
  });

  const skillSeriesQuery = useQuery({
    queryKey: ["timeseries", characterId, "skill", skillMetricId, skillValueField],
    queryFn: () =>
      api.getTimeseries(characterId, {
        kind: "skill",
        metricId: skillMetricId,
        valueField: skillValueField,
      }),
    enabled: Number.isFinite(characterId),
  });

  const activitySeriesQuery = useQuery({
    queryKey: ["timeseries", characterId, "activity", activityMetricId, activityValueField],
    queryFn: () =>
      api.getTimeseries(characterId, {
        kind: "activity",
        metricId: activityMetricId,
        valueField: activityValueField,
      }),
    enabled: Number.isFinite(characterId),
  });

  const metricsGridQuery = useQuery({
    queryKey: ["metrics-grid", characterId],
    queryFn: () => api.getMetricsGrid(characterId),
    enabled: Number.isFinite(characterId) && viewMode === "all",
  });

  const skillOptions = metricsQuery.data?.skills ?? [];
  const activityOptions = metricsQuery.data?.activities ?? [];

  const filteredGridMetrics = useMemo(() => {
    const search = deferredMetricSearch.trim().toLowerCase();
    const skills = (metricsGridQuery.data?.skills ?? []).filter((metric) =>
      search === "" ? true : metric.name.toLowerCase().includes(search),
    );
    const activities = (metricsGridQuery.data?.activities ?? []).filter((metric) =>
      search === "" ? true : metric.name.toLowerCase().includes(search),
    );

    return { skills, activities };
  }, [deferredMetricSearch, metricsGridQuery.data]);

  useEffect(() => {
    if (skillOptions.length > 0 && skillMetricId === 0) {
      setSkillMetricId(skillOptions[0].id);
    }
    if (activityOptions.length > 0 && activityMetricId === 0) {
      const populated = detailQuery.data?.activities.find((item) => item.score > 0);
      setActivityMetricId(populated?.activityId ?? activityOptions[0].id);
    }
  }, [activityMetricId, activityOptions, detailQuery.data?.activities, skillMetricId, skillOptions]);

  if (detailQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-white">
        <LoaderCircle className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!detailQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-white">
        Character not found.
      </div>
    );
  }

  const { character, skills, activities, syncRuns } = detailQuery.data;
  const overall = skills.find((skill) => skill.skillId === 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#6b2d0e_0%,#0d1219_34%,#07090d_100%)] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-5">
          <Button asChild variant="outline">
            <Link to="/characters">
              <ArrowLeft className="h-4 w-4" />
              Back to roster
            </Link>
          </Button>
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-amber-200/75">Character detail</p>
                <CardTitle className="mt-2 text-4xl">{character.displayName}</CardTitle>
                <CardDescription className="mt-2">
                  Last sync{" "}
                  {character.lastSuccessfulSyncAt
                    ? new Date(character.lastSuccessfulSyncAt).toLocaleString()
                    : "never"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-white/10 bg-black/20 p-1">
                  <button
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      viewMode === "focused"
                        ? "bg-white text-black"
                        : "text-white/70 hover:text-white"
                    }`}
                    onClick={() => setViewMode("focused")}
                    type="button"
                  >
                    Focused charts
                  </button>
                  <button
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      viewMode === "all" ? "bg-white text-black" : "text-white/70 hover:text-white"
                    }`}
                    onClick={() => setViewMode("all")}
                    type="button"
                  >
                    All metrics
                  </button>
                </div>
                <Badge variant={character.syncStatus === "idle" ? "success" : "warning"}>
                  {character.syncStatus}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-white/55">Overall level</p>
                <p className="mt-3 text-3xl font-semibold">{overall?.level ?? "N/A"}</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-white/55">Overall XP</p>
                <p className="mt-3 text-3xl font-semibold">
                  {overall?.xp ? overall.xp.toLocaleString() : "N/A"}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-white/55">Next auto refresh</p>
                <p className="mt-3 text-lg font-medium">
                  {character.nextAutoRefreshAt
                    ? new Date(character.nextAutoRefreshAt).toLocaleString()
                    : "Pending"}
                </p>
              </div>
            </CardContent>
          </Card>
        </header>

        {viewMode === "focused" ? (
          <Card>
            <CardHeader>
              <CardTitle>Historical charts</CardTitle>
              <CardDescription>Switch metrics and value fields without leaving the page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ChartFrame
                title="Skills"
                actions={
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded-full border border-white/12 bg-black/30 px-3 py-2 text-sm"
                      value={skillMetricId}
                      onChange={(event) => setSkillMetricId(Number(event.target.value))}
                    >
                      {skillOptions.map((metric) => (
                        <option key={metric.id} value={metric.id}>
                          {metric.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-full border border-white/12 bg-black/30 px-3 py-2 text-sm"
                      value={skillValueField}
                      onChange={(event) => setSkillValueField(event.target.value)}
                    >
                      <option value="xp">XP</option>
                      <option value="level">Level</option>
                      <option value="rank">Rank</option>
                    </select>
                  </div>
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={skillSeriesQuery.data?.points ?? []}>
                    <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis
                      dataKey="fetchedAt"
                      tickFormatter={(value) => new Date(String(value)).toLocaleDateString()}
                      stroke="rgba(255,255,255,0.45)"
                    />
                    <YAxis
                      tickFormatter={(value) => numberLabel(value)}
                      stroke="rgba(255,255,255,0.45)"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(12,16,22,0.94)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "16px",
                      }}
                      formatter={(value) => numberLabel(value)}
                      labelFormatter={(value) => new Date(String(value)).toLocaleString()}
                    />
                    <Line
                      type="monotone"
                      dataKey={skillValueField}
                      stroke="#f59e0b"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>

              <ChartFrame
                title="Activities"
                actions={
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded-full border border-white/12 bg-black/30 px-3 py-2 text-sm"
                      value={activityMetricId}
                      onChange={(event) => setActivityMetricId(Number(event.target.value))}
                    >
                      {activityOptions.map((metric) => (
                        <option key={metric.id} value={metric.id}>
                          {metric.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded-full border border-white/12 bg-black/30 px-3 py-2 text-sm"
                      value={activityValueField}
                      onChange={(event) => setActivityValueField(event.target.value)}
                    >
                      <option value="score">Score</option>
                      <option value="rank">Rank</option>
                    </select>
                  </div>
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={activitySeriesQuery.data?.points ?? []}>
                    <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis
                      dataKey="fetchedAt"
                      tickFormatter={(value) => new Date(String(value)).toLocaleDateString()}
                      stroke="rgba(255,255,255,0.45)"
                    />
                    <YAxis
                      tickFormatter={(value) => numberLabel(value)}
                      stroke="rgba(255,255,255,0.45)"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(12,16,22,0.94)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "16px",
                      }}
                      formatter={(value) => numberLabel(value)}
                      labelFormatter={(value) => new Date(String(value)).toLocaleString()}
                    />
                    <Line
                      type="monotone"
                      dataKey={activityValueField}
                      stroke="#38bdf8"
                      strokeWidth={3}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>All metrics</CardTitle>
                <CardDescription>
                  Compact graphs for every skill and boss/activity metric. Search to narrow the list.
                </CardDescription>
              </div>
              <Input
                className="sm:max-w-sm"
                placeholder="Search metrics or bosses"
                value={metricSearch}
                onChange={(event) => setMetricSearch(event.target.value)}
              />
            </CardHeader>
            <CardContent className="space-y-8">
              {metricsGridQuery.isLoading ? (
                <div className="flex items-center gap-3 text-white/65">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading compact metric charts...
                </div>
              ) : null}

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm uppercase tracking-[0.24em] text-white/55">Skills</h3>
                  <p className="mt-1 text-sm text-white/55">
                    Showing XP trends with latest level and rank.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredGridMetrics.skills.map((metric) => (
                    <div
                      key={`skill-${metric.id}`}
                      className="rounded-[20px] border border-white/8 bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{metric.name}</p>
                          <p className="mt-1 text-xs text-white/55">
                            Level {metric.latestLevel} • Rank {numberLabel(metric.latestRank)}
                          </p>
                        </div>
                        <p className="text-xs uppercase tracking-[0.24em] text-amber-200/80">XP</p>
                      </div>
                      <p className="mt-3 text-lg font-semibold text-white">
                        {numberLabel(metric.latestXp)}
                      </p>
                      <div className="mt-3 h-20">
                        <CompactMetricChart
                          points={metric.points}
                          valueKey="xp"
                          stroke="#f59e0b"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm uppercase tracking-[0.24em] text-white/55">Activities</h3>
                  <p className="mt-1 text-sm text-white/55">
                    Showing score trends with the latest rank.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredGridMetrics.activities.map((metric) => (
                    <div
                      key={`activity-${metric.id}`}
                      className="rounded-[20px] border border-white/8 bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{metric.name}</p>
                          <p className="mt-1 text-xs text-white/55">
                            Rank {numberLabel(metric.latestRank)}
                          </p>
                        </div>
                        <p className="text-xs uppercase tracking-[0.24em] text-sky-200/80">Score</p>
                      </div>
                      <p className="mt-3 text-lg font-semibold text-white">
                        {numberLabel(metric.latestScore)}
                      </p>
                      <div className="mt-3 h-20">
                        <CompactMetricChart
                          points={metric.points}
                          valueKey="score"
                          stroke="#38bdf8"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {!metricsGridQuery.isLoading &&
              filteredGridMetrics.skills.length === 0 &&
              filteredGridMetrics.activities.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-white/12 bg-black/20 p-10 text-center text-white/60">
                  No metrics matched that search.
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent sync runs</CardTitle>
            <CardDescription>Most recent manual and automatic fetch attempts.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-white/55">
                <tr>
                  <th className="pb-3">Started</th>
                  <th className="pb-3">Trigger</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {syncRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="py-3">{new Date(run.createdAt).toLocaleString()}</td>
                    <td className="py-3">{run.triggerType}</td>
                    <td className="py-3">{run.status}</td>
                    <td className="py-3 text-white/60">{run.errorMessage ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
