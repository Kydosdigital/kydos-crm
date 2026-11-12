"use client";

/** The stage menu on a pipeline card. Choosing a stage submits the card's existing Move form straight away. */
export function StageSelect({ stages, value }: { stages: { id: string; name: string }[]; value: string }) {
  return (
    <select name="stage_id" defaultValue={value} aria-label="Move to stage" onChange={(e) => e.currentTarget.form?.requestSubmit()} className="select input-sm flex-1">
      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}
