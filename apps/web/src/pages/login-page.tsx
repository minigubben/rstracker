import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: api.login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      navigate("/characters");
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Login failed");
    },
  });

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#6b2d0e_0%,#0d1219_38%,#07090d_100%)] px-6 py-10 text-white">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(217,119,6,0.1),transparent_45%,rgba(14,165,233,0.08))]" />
      <div className="relative mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <p className="text-sm uppercase tracking-[0.28em] text-amber-200/75">Rune telemetry</p>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              Track OSRS progress with daily snapshots and boss-kill history.
            </h1>
            <p className="max-w-xl text-base text-white/72 sm:text-lg">
              Private login, shared character history, manual refreshes, and charted skill or
              activity trends from the Old School hiscores API.
            </p>
          </section>

          <Card className="backdrop-blur">
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Accounts are created directly in Postgres via the CLI.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setErrorMessage(null);
                  loginMutation.mutate({ username, password });
                }}
              >
                <Input
                  placeholder="Username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {errorMessage ? <p className="text-sm text-red-300">{errorMessage}</p> : null}
                <Button className="w-full" disabled={loginMutation.isPending} type="submit">
                  {loginMutation.isPending ? "Signing in..." : "Login"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
