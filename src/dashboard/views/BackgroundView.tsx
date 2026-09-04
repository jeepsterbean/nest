import { useState } from "react";
import { AmbientVisualizer } from "../components/AmbientVisualizer";
import { ViewToggle } from "../components/ViewToggle";
import {
  BACKGROUND_STYLES,
  readBackgroundStyle,
  writeBackgroundStyle,
  type BackgroundStyle,
} from "../lib/backgroundStyle";
import {
  INTENSITY_RANGE,
  readBackgroundTuning,
  SPEED_RANGE,
  writeBackgroundTuning,
  type BackgroundTuning,
} from "../lib/backgroundTuning";
import "./BackgroundView.css";

export function BackgroundView() {
  const [savedStyle, setSavedStyle] = useState<BackgroundStyle>(readBackgroundStyle);
  const [savedTuning, setSavedTuning] = useState<BackgroundTuning>(readBackgroundTuning);
  const [draftStyle, setDraftStyle] = useState<BackgroundStyle>(savedStyle);
  const [draftTuning, setDraftTuning] = useState<BackgroundTuning>(savedTuning);

  const isDirty =
    draftStyle !== savedStyle ||
    draftTuning.speed !== savedTuning.speed ||
    draftTuning.intensity !== savedTuning.intensity;

  const apply = () => {
    writeBackgroundStyle(draftStyle);
    writeBackgroundTuning(draftTuning);
    setSavedStyle(draftStyle);
    setSavedTuning(draftTuning);
  };

  return (
    <div className="settings-pane settings-pane--background background-settings">
      <div className="background-settings__preview">
        <AmbientVisualizer active style={draftStyle} tuning={draftTuning} />
      </div>

      <ViewToggle
        value={draftStyle}
        options={BACKGROUND_STYLES}
        label="Background style"
        onChange={setDraftStyle}
      />
      <p className="background-settings__hint">
        Preview a style and adjust the sliders, then apply it below. Shown
        behind the dashboard and popup while your phase is Doing.
      </p>

      <div className="background-settings__sliders">
        <label className="background-settings__slider">
          <span>Speed</span>
          <input
            type="range"
            min={SPEED_RANGE.min}
            max={SPEED_RANGE.max}
            step={SPEED_RANGE.step}
            value={draftTuning.speed}
            onChange={(e) =>
              setDraftTuning((current) => ({
                ...current,
                speed: Number(e.target.value),
              }))
            }
          />
        </label>
        <label className="background-settings__slider">
          <span>Intensity</span>
          <input
            type="range"
            min={INTENSITY_RANGE.min}
            max={INTENSITY_RANGE.max}
            step={INTENSITY_RANGE.step}
            value={draftTuning.intensity}
            onChange={(e) =>
              setDraftTuning((current) => ({
                ...current,
                intensity: Number(e.target.value),
              }))
            }
          />
        </label>
      </div>

      <button
        type="button"
        className="background-settings__apply"
        disabled={!isDirty}
        onClick={apply}
      >
        {isDirty ? "Set background" : "Background set"}
      </button>
    </div>
  );
}
