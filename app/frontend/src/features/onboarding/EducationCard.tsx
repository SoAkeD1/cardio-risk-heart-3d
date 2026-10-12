import { useQuery } from "@tanstack/react-query";
import { BookOpenText, ExternalLink, X } from "lucide-react";
import { api } from "../../api/client";
import { useStore } from "../../state/store";

/** Optional general-population education (OFF by default). Content from /api/education. Never patient-specific,
 * never changes the 3D heart, never marks a location; not included in the PDF report. */
export function EducationCard() {
  const on = useStore((s) => s.view.education);
  const setView = useStore((s) => s.setView);
  const { data } = useQuery({ queryKey: ["education"], queryFn: api.education, enabled: on, staleTime: Infinity });
  if (!on) return null;
  return (
    <aside
      data-testid="education-card"
      aria-label="Educational content"
      className="pointer-events-auto absolute left-3 top-[60px] z-20 max-h-[calc(100%-200px)] w-[min(320px,calc(100%-24px))] overflow-auto rounded-md border border-[rgb(var(--info)/0.5)] bg-s1/95 p-3 text-xs text-t2 shadow-soft backdrop-blur"
    >
      <div className="flex items-start gap-2">
        <BookOpenText aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-t1">{data?.title ?? "Educational content"}</div>
          <div className="mt-0.5 font-medium text-info">{data?.label}</div>
        </div>
        <button aria-label="Close educational content" onClick={() => setView({ education: false })} className="rounded p-1 text-t3 hover:bg-s2 hover:text-t1">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 leading-snug">{data?.note}</p>
      <ul className="mt-2 space-y-2.5">
        {data?.items.map((it) => (
          <li key={it.key}>
            <div className="font-semibold text-t1">{it.title}</div>
            <p className="mt-0.5 leading-snug">{it.text}</p>
            <a href={it.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-info hover:underline">
              {it.source} <ExternalLink aria-hidden className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
