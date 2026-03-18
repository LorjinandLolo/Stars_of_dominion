'use client';
import { choose } from '@/app/actions/state';
export default function EventCard({ event }: { event?: any }) {
  if (!event) return <div className="opacity-70">No event today.</div>;
  return (
    <div className="space-y-2">
      <div className="font-semibold">{event.title}</div>
      <p className="opacity-90">{event.body}</p>
      <div className="flex gap-2 flex-wrap">
        {event.choices?.map((c: any) => (
          <form key={c.id} action={choose.bind(null, event.id, c.id)}>
            <button className="bg-neutral-700 hover:bg-neutral-600 px-2 py-1 rounded text-sm">{c.text}</button>
          </form>
        ))}
      </div>
    </div>
  )
}
