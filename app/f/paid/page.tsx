export default async function Paid({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const { cancelled } = await searchParams;
  return <div className="mx-auto my-20 max-w-md text-center text-lg">{cancelled ? "Payment cancelled. You can use the link in your email to try again." : "Thank you, your payment has been received."}</div>;
}
