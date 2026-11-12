import { login, requestLink } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const { error, sent } = await searchParams;
  return (
    <main className="mx-auto mt-16 w-full max-w-sm rounded-lg border p-6">
      <div className="mb-5 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded bg-[#1f3a5f] font-semibold text-white">K</span><h1 className="text-xl font-semibold">Kydos CRM</h1></div>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {sent && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">If that email has access, a link is on its way. Check your inbox and spam.</p>}
      <form action={requestLink} className="mb-5 flex flex-col gap-2">
        <p className="text-sm font-medium">No password? Get a sign-in link</p>
        <input name="email" type="email" placeholder="Email" required className="rounded border p-2" />
        <div className="flex gap-2">
          <button name="kind" value="login" className="flex-1 rounded bg-black p-2 text-white">Email me a sign-in link</button>
          <button name="kind" value="reset" className="rounded border p-2 text-sm">Set or reset password</button>
        </div>
      </form>
      <details>
        <summary className="cursor-pointer text-sm text-gray-600">Sign in with a password</summary>
        <form action={login} className="mt-2 flex flex-col gap-3">
          <input name="email" type="email" placeholder="Email" required className="rounded border p-2" />
          <input name="password" type="password" placeholder="Password" required className="rounded border p-2" />
          <button className="rounded border p-2">Sign in</button>
        </form>
      </details>
      <p className="mt-4 text-xs text-gray-500">New here? <a href="/signup" className="underline">Request access</a>.</p>
    </main>
  );
}
