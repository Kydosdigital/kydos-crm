import Link from "next/link";
import { requestAccess } from "../actions";

export default async function Signup({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <main className="mx-auto mt-16 w-full max-w-sm rounded-lg border p-6">
      <div className="mb-5 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded bg-[#1f3a5f] font-semibold text-white">K</span><h1 className="text-xl font-semibold">Request access</h1></div>
      {sent ? <p className="rounded bg-green-50 p-3 text-sm text-green-700">Thanks. We have let the team know. Once you are approved you will get an invite email with a link to sign in.</p> : (
        <form action={requestAccess} className="flex flex-col gap-3">
          <input name="name" placeholder="Your name" required className="rounded border p-2" />
          <input name="email" type="email" placeholder="Email" required className="rounded border p-2" />
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <button className="rounded bg-black p-2 text-white">Request access</button>
        </form>
      )}
      <p className="mt-4 text-xs text-gray-500">Already invited? <Link href="/login" className="underline">Sign in with an email link</Link>.</p>
    </main>
  );
}
