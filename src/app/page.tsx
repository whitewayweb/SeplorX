import { Button } from "@/components/ui/button";
import { auth } from "@/auth";
import { logoutAction } from "@/app/actions/auth";

export default async function Home() {
  const session = await auth();

  if (!session) {
    // This should rarely happen due to middleware, but handle it gracefully
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-extrabold tracking-tight">SeplorX</h1>
          <p className="text-muted-foreground text-xl">Please log in to continue</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-extrabold tracking-tight">SeplorX</h1>
        <p className="text-muted-foreground text-xl">
          Welcome back, <span className="font-semibold text-foreground">{session.user?.name || session.user?.email}</span>
        </p>
        <p className="text-sm px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded-full inline-block">
          Role: <span className="capitalize">{session.user?.role}</span>
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
        <Button className="flex-1 shadow-md transition-all active:scale-95">Go to Dashboard</Button>
        <form action={logoutAction} className="flex-1">
          <Button variant="outline" className="w-full border-zinc-300 dark:border-zinc-700 transition-all active:scale-95">
            Log Out
          </Button>
        </form>
      </div>
    </div>
  );
}
