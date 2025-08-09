import { cn } from "@/lib/utils";

type TimelineLegendProps = {
  className?: string;
};

export function TimelineLegend({ className }: TimelineLegendProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-4 text-xs text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <div className="h-2 w-4 rounded-sm bg-motion_review"></div>
        <span>Motion detected</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 w-4 rounded-sm bg-gray-400"></div>
        <span>No motion (recordings available)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative h-2 w-4 rounded-sm border-l-2 border-dashed border-gray-500/60 bg-gray-300/30">
          <div className="absolute bottom-0 left-0 top-0 w-0.5 bg-gray-500/80"></div>
        </div>
        <span>No recordings available</span>
      </div>
    </div>
  );
}
