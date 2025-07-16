import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { FiRotateCcw } from "react-icons/fi";
import { LuWand } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

export interface VideoEffects {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
}

const defaultEffects: VideoEffects = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
};

type VideoEffectsControlProps = {
  className?: string;
  onEffectsChange: (effects: VideoEffects) => void;
  disabled?: boolean;
};

export const VideoEffectsControl = ({
  className,
  onEffectsChange,
  disabled = false,
}: VideoEffectsControlProps) => {
  const [effects, setEffects] = useState<VideoEffects>(defaultEffects);
  const [isOpen, setIsOpen] = useState(false);

  const handleEffectChange = useCallback(
    (effectName: keyof VideoEffects, value: number[]) => {
      const newValue = value[0];
      setEffects((prevEffects) => {
        const newEffects = {
          ...prevEffects,
          [effectName]: newValue,
        };
        onEffectsChange(newEffects);
        return newEffects;
      });
    },
    [onEffectsChange],
  );

  const handleReset = useCallback(() => {
    setEffects(defaultEffects);
    onEffectsChange(defaultEffects);
  }, [onEffectsChange]);

  const hasActiveEffects =
    effects.brightness !== 100 ||
    effects.contrast !== 100 ||
    effects.saturation !== 100 ||
    effects.hue !== 0 ||
    effects.blur !== 0;

  const EffectSlider = useCallback(
    ({
      label,
      value,
      min,
      max,
      step = 1,
      unit = "",
      effectKey,
    }: {
      label: string;
      value: number;
      min: number;
      max: number;
      step?: number;
      unit?: string;
      effectKey: keyof VideoEffects;
    }) => (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">
            {value}
            {unit}
          </span>
        </div>
        <Slider
          value={[value]}
          onValueChange={(val) => handleEffectChange(effectKey, val)}
          min={min}
          max={max}
          step={step}
          className="w-full"
        />
      </div>
    ),
    [handleEffectChange],
  );

  return (
    <div className={cn("absolute bottom-4 right-4 z-50", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className={cn(
              "h-10 w-10 rounded-full bg-black/50 p-0 text-white backdrop-blur-sm hover:scale-110 hover:bg-black/70",
              "transition-all duration-200 ease-in-out",
              hasActiveEffects &&
                "bg-selected/50 text-selected hover:bg-selected/70",
            )}
            aria-label="Video effects"
            onClick={(e) => e.stopPropagation()}
          >
            <LuWand className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-4"
          align="end"
          side="top"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-foreground">Video Effects</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={!hasActiveEffects}
                className="h-8 w-8 p-0"
                aria-label="Reset effects"
              >
                <FiRotateCcw className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <EffectSlider
                label="Brightness"
                value={effects.brightness}
                min={0}
                max={200}
                unit="%"
                effectKey="brightness"
              />

              <EffectSlider
                label="Contrast"
                value={effects.contrast}
                min={0}
                max={200}
                unit="%"
                effectKey="contrast"
              />

              <EffectSlider
                label="Saturation"
                value={effects.saturation}
                min={0}
                max={200}
                unit="%"
                effectKey="saturation"
              />

              <EffectSlider
                label="Hue"
                value={effects.hue}
                min={-180}
                max={180}
                unit="°"
                effectKey="hue"
              />

              <EffectSlider
                label="Blur"
                value={effects.blur}
                min={0}
                max={10}
                step={0.1}
                unit="px"
                effectKey="blur"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
