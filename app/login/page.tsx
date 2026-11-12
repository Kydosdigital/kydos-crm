import { login } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto mt-24 w-full max-w-sm rounded-lg border p-6">
      <div className="mb-5 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded bg-[#1f3a5f] font-semibold text-white">K</span><h1 className="text-xl font-semibold">Kydos CRM</h1></div>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <form action={login} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="Email" required className="rounded border p-2" />
        <input name="password" type="password" placeholder="Password" required className="rounded border p-2" />
        <button className="rounded bg-black p-2 text-white">Sign in</button>
      </form>
      <p className="mt-3 text-xs text-gray-500">Create your user in Supabase Auth (Authentication, Users, Add user).</p>
    </main>
  );
}
