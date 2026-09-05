import { FlexWidget, ImageWidget, SvgWidget, TextWidget } from "react-native-android-widget";

/** Snapshot of playback shown on the Android home-screen widget (persisted for cold starts). */
export type WidgetState = {
  title: string;
  artist: string;
  artwork?: string | null;
  playing: boolean;
  /** true while the app process is alive and can act on button presses */
  alive: boolean;
};

export const WIDGET_NAME = "NowPlaying";

const WHITE = "#FFFFFF";
const DIM = "#FFFFFFA6";
const GLASS = "#FFFFFF1F";
// Brand accent is fixed on the widget (no theme hooks in RemoteViews).
const BRAND = "#F43F5E";

const ICONS = {
  prev: "M6 6h2v12H6zm3.5 6l8.5 6V6z",
  next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
};

function svg(path: string, color = WHITE) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}"><path d="${path}"/></svg>`;
}

function Button({ icon, action, primary, alive }: { icon: keyof typeof ICONS; action: string; primary?: boolean; alive: boolean }) {
  const size = primary ? 52 : 44;
  return (
    <FlexWidget
      clickAction={alive ? action : "OPEN_APP"}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: primary ? BRAND : GLASS,
        alignItems: "center",
        justifyContent: "center",
        marginHorizontal: 5,
      }}
    >
      <SvgWidget svg={svg(ICONS[icon])} style={{ width: primary ? 28 : 22, height: primary ? 28 : 22 }} />
    </FlexWidget>
  );
}

export function NowPlayingWidget({ state }: { state: WidgetState | null }) {
  const s = state ?? { title: "LiquidAudio", artist: "Tap to start listening", artwork: null, playing: false, alive: false };
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: "match_parent",
        height: "match_parent",
        borderRadius: 28,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        backgroundGradient: { from: "#1C1022F2", to: "#0B0B10F2", orientation: "TL_BR" },
      }}
    >
      {s.artwork?.startsWith("http") ? (
        <ImageWidget image={s.artwork as `https:${string}`} imageWidth={84} imageHeight={84} radius={18} resizeMode="cover" />
      ) : (
        <FlexWidget style={{ width: 84, height: 84, borderRadius: 18, backgroundColor: GLASS, alignItems: "center", justifyContent: "center" }}>
          <SvgWidget svg={svg("M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z", DIM)} style={{ width: 34, height: 34 }} />
        </FlexWidget>
      )}
      <FlexWidget style={{ flex: 1, flexDirection: "column", marginLeft: 14, justifyContent: "center" }}>
        <TextWidget
          text={s.title}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 16, fontFamily: "Inter-Bold", color: WHITE }}
        />
        <TextWidget
          text={s.artist}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 13, fontFamily: "Inter-Medium", color: DIM, marginTop: 2 }}
        />
        <FlexWidget style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
          <Button icon="prev" action="prev" alive={s.alive} />
          <Button icon={s.playing ? "pause" : "play"} action="toggle" primary alive={s.alive} />
          <Button icon="next" action="next" alive={s.alive} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
