import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";

/**
 * Root — registers the single <Composition id="Main"> that the Go server's
 * RunPod render payload targets (composition: "Main"). Every animation type is
 * dispatched inside Main via props.animationType, so one bundle renders all 10.
 *
 * defaultProps are the server's animationDefaultProps() contract for the
 * concept_reveal type (see cmd/server/main.go). The studio preview and any
 * `--props`-less render use these.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        component={Main}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          animationType: "concept_reveal",
          title: "Claude is an AI assistant",
          subtitle: "Foundations · Architecture Overview",
          sentence: "Claude is an AI assistant",
          sentenceType: "hook",
          module: "Foundations",
          video: "Architecture Overview",
          fps: 30,
          durationInFrames: 150,
          brandColor: "#8b5cf6",
          secondaryColor: "#3b82f6",
          bgColor: "#030712",
        }}
      />
    </>
  );
};
