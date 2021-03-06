import React, {
  useLayoutEffect,
  useEffect,
  useState,
  useCallback,
} from "react";
import AudioSpectrum from "react-audio-spectrum";
import IcecastMetadataPlayer from "icecast-metadata-player";
import { ReactComponent as Play } from "./play.svg";
import { ReactComponent as Pause } from "./pause.svg";
import styles from "./Player.module.css";

const SELECT_STATION = "Select a station";
const SELECT_OR_PLAY = "Select a station or press play";
const LOADING = "Loading...";
const VISIT_STATION = "Visit this station at ";
const ICECAST_METADATA_JS_DEMO = "Icecast Metadata JS Demo";

const useMetadataPlayer = (station, onMetadata, audioElement) => {
  const [metadataPlayer, setMetadataPlayer] = useState();

  const toggle = () => (metadataPlayer?.playing ? stop() : play());

  const play = useCallback(() => {
    onMetadata(LOADING);
    metadataPlayer.play();
  }, [onMetadata, metadataPlayer]);

  const stop = useCallback(() => {
    onMetadata(SELECT_OR_PLAY);
    metadataPlayer.stop();
  }, [onMetadata, metadataPlayer]);

  useEffect(() => {
    if (metadataPlayer?.playing) {
      onMetadata(SELECT_OR_PLAY);
      metadataPlayer.stop();
    }

    if (station) {
      const player = new IcecastMetadataPlayer(station.endpoint, {
        onMetadata: (meta) => {
          console.log(meta);
          onMetadata(meta);
        },
        icyDetectionTimeout: 5000,
        metadataTypes: station.metadataTypes,
        audioElement,
      });

      onMetadata(LOADING);
      player.play();

      setMetadataPlayer(player);
    }
  }, [station]);

  useEffect(() => {
    audioElement.addEventListener("pause", stop);
    return () => audioElement.removeEventListener("pause", stop);
  }, [audioElement, stop]);

  return [metadataPlayer?.playing, toggle];
};

const Player = ({ station }) => {
  const [audioElement] = useState(new Audio());
  const [[audioHeight, audioWidth], setSpectrumSize] = useState([0, 0]);
  const [meters, setMeters] = useState(0);

  const [metadata, setMetadata] = useState(SELECT_STATION);
  const [isPlaying, toggle] = useMetadataPlayer(
    station,
    setMetadata,
    audioElement
  );

  useEffect(() => {
    const title = metadata.StreamTitle || metadata.TITLE;
    document.title = title
      ? `${title} | ${ICECAST_METADATA_JS_DEMO}`
      : ICECAST_METADATA_JS_DEMO;
  }, [metadata]);

  useLayoutEffect(() => {
    const updateSize = () => {
      const player = document.getElementById("player");
      setMeters(Math.floor(player.clientWidth / 32));
      setSpectrumSize([player.clientHeight + 6, player.clientWidth]);
    };
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  return (
    <div id={"player"} className={styles.player}>
      <div className={styles.spectrum}>
        <AudioSpectrum
          height={audioHeight}
          width={audioWidth}
          audioEle={audioElement}
          capColor={"red"}
          capHeight={1}
          meterWidth={2}
          meterCount={(meters + 1) * 32}
          meterColor={[
            { stop: 0, color: "#f00" },
            { stop: 0.3, color: "#0CD7FD" },
            { stop: 1, color: "red" },
          ]}
          gap={1}
        />
      </div>
      <button disabled={!station} className={styles.button} onClick={toggle}>
        {isPlaying ? <Pause /> : <Play />}
      </button>
      <div>
        <p className={styles.metadata}>
          {typeof metadata === "object"
            ? metadata.StreamTitle ||
              (metadata.ARTIST
                ? `${metadata.ARTIST} - ${metadata.TITLE}`
                : metadata.TITLE) ||
              metadata.VENDOR_STRING
            : metadata}
        </p>
        {station?.link && (
          <div className={styles.visitStation}>
            {VISIT_STATION}
            <a
              className={styles.link}
              href={station.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {station.name}
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default Player;
