import Link from "next/link";
import { setPassword } from "../actions";

export default async function SetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto mt-24 w-full max-w-sm rounded-lg border p-6">
      <h1 className="mb-1 text-xl font-semibold">Choose a password</h1>
      <p className="mb-4 text-sm text-gray-500">You are signed in. Set a password so you can also sign in without an email link.</p>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <form action={setPassword} className="flex flex-col gap-3">
        <input name="password" type="password" minLength={10} required placeholder="New password (10+ characters)" className="rounded border p-2" />
        <button className="rounded bg-black p-2 text-white">Save password</button>
      </form>
      <Link href="/contacts" className="mt-3 block text-xs text-gray-500 underline">Skip for now</Link>
    </main>
  );
}
