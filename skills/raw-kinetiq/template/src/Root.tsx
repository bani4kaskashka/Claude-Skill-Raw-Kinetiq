import React from "react";
import { Composition } from "remotion";
import { LyricVideo } from "./Video";
import { config, timeline } from "./data";

export const Root: React.FC = () => (
  <Composition
    id="LyricVideo"
    component={LyricVideo}
    durationInFrames={Math.ceil(timeline.duration * config.fps)}
    fps={config.fps}
    width={config.width}
    height={config.height}
  />
);
