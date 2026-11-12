// Skeleton shown while a page's data loads. Mirrors the standard page header and a card of rows.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-8 pt-7" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-7 w-48" />
      <div className="skeleton mt-2.5 h-4 w-96 max-w-full" />
      <div className="mt-7 grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
      </div>
      <div className="card mt-6 p-5">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton mb-3 h-9 last:mb-0" />)}
      </div>
    </div>
  );
}
