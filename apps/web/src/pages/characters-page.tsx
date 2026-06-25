import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LoaderCircle, LogOut, Plus, RefreshCw, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

function statusVariant(syncStatus: string) {
  if (syncStatus === "idle") return "success" as const;
  if (syncStatus === "pending" || syncStatus === "syncing") return "warning" as const;
  return "danger" as const;
}

export function CharactersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: api.me,
    retry: false,
  });

  const charactersQuery = useQuery({
    queryKey: ["characters"],
    queryFn: api.listCharacters,
  });

  const addMutation = useMutation({
    mutationFn: api.addCharacter,
    onSuccess: async () => {
      setName("");
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add character");
    },
  });

  const refreshMutation = useMutation({
    mutationFn: api.refreshCharacter,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: api.removeCharacter,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      queryClient.clear();
      navigate("/login");
    },
  });

  const cards = useMemo(() => {
    const items = charactersQuery.data?.items ?? [];
    return [
      {
        label: "Tracked Characters",
        value: items.length,
      },
      {
        label: "Needs Attention",
        value: items.filter((item) => item.syncStatus === "failed").length,
      },
      {
        label: "Queued Refreshes",
        value: items.filter((item) => item.syncStatus === "pending" || item.syncStatus === "syncing")
          .length,
      },
    ];
  }, [charactersQuery.data]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#6b2d0e_0%,#0d1219_34%,#07090d_100%)] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-5 rounded-[32px] border border-white/10 bg-black/20 p-6 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-amber-200/75">Dashboard</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Tracked characters</h1>
            <p className="mt-2 text-white/65">
              Signed in as {sessionQuery.data?.user.username ?? "unknown"}.
            </p>
          </div>
          <div className="flex gap-3">
            <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  Add character
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add an OSRS character</DialogTitle>
                  <DialogDescription>
                    The app validates the name against the hiscores API and stores the first snapshot
                    immediately.
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="mt-6 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setErrorMessage(null);
                    addMutation.mutate({ name });
                  }}
                >
                  <Input
                    placeholder="Character name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
                  <Button className="w-full" disabled={addMutation.isPending} type="submit">
                    {addMutation.isPending ? "Adding..." : "Track character"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardContent className="pt-6">
                <p className="text-sm uppercase tracking-[0.24em] text-white/55">{card.label}</p>
                <p className="mt-3 text-4xl font-semibold">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Roster</CardTitle>
            <CardDescription>Shared characters are stored once and subscribed per user.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {charactersQuery.isLoading ? (
              <div className="flex items-center gap-3 text-white/65">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading tracked characters...
              </div>
            ) : null}

            {(charactersQuery.data?.items ?? []).map((character) => (
              <div
                key={character.id}
                className="group grid cursor-pointer gap-4 rounded-[24px] border border-white/8 bg-black/20 p-4 transition-colors hover:border-white/16 hover:bg-black/30 md:grid-cols-[1.2fr_0.7fr_0.7fr_auto]"
                onClick={() => navigate(`/characters/${character.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/characters/${character.id}`);
                  }
                }}
                role="link"
                tabIndex={0}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-semibold text-white transition-colors group-hover:text-amber-200">
                      {character.displayName}
                    </span>
                    <Badge variant={statusVariant(character.syncStatus)}>{character.syncStatus}</Badge>
                  </div>
                  <p className="text-sm text-white/60">
                    {character.latestOverallLevel
                      ? `Overall level ${character.latestOverallLevel} • XP ${character.latestOverallXp?.toLocaleString()}`
                      : "No snapshot data yet"}
                  </p>
                  {character.lastSyncError ? (
                    <p className="text-sm text-red-300">{character.lastSyncError}</p>
                  ) : null}
                </div>

                <div className="text-sm text-white/60">
                  <p className="uppercase tracking-[0.2em]">Last sync</p>
                  <p className="mt-2 text-white">
                    {character.lastSuccessfulSyncAt
                      ? new Date(character.lastSuccessfulSyncAt).toLocaleString()
                      : "Never"}
                  </p>
                </div>

                <div className="text-sm text-white/60">
                  <p className="uppercase tracking-[0.2em]">Next auto</p>
                  <p className="mt-2 text-white">
                    {character.nextAutoRefreshAt
                      ? new Date(character.nextAutoRefreshAt).toLocaleString()
                      : "Pending"}
                  </p>
                </div>

                <div
                  className="flex items-center gap-2 md:justify-end"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={refreshMutation.isPending}
                    onClick={() => refreshMutation.mutate(character.id)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removeMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Stop tracking ${character.displayName}? This removes it from your roster.`,
                        )
                      ) {
                        removeMutation.mutate(character.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}

            {!charactersQuery.isLoading && (charactersQuery.data?.items.length ?? 0) === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/12 bg-black/20 p-10 text-center text-white/60">
                No characters tracked yet.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
