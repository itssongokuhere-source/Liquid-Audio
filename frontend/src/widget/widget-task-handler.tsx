import { Linking, Platform } from "react-native";
import { requestWidgetUpdate, type WidgetTaskHandlerProps } from "react-native-android-widget";

import { storage } from "@/src/utils/storage";
import { NowPlayingWidget, WIDGET_NAME, type WidgetState } from "./now-playing-widget";

export type WidgetCommand = "toggle" | "next" | "prev";

const STATE_KEY = "liquidaudio.widgetState";

// The running app (AudioProvider) registers here; when the process is dead the handler is null and
// button presses can only open the app.
let commandHandler: ((cmd: WidgetCommand) => void) | null = null;
let lastState: WidgetState | null = null;

export function setWidgetCommandHandler(handler: ((cmd: WidgetCommand) => void) | null) {
  commandHandler = handler;
}

async function loadState(): Promise<WidgetState | null> {
  if (lastState) return lastState;
  const raw = await storage.getItem<string>(STATE_KEY, "");
  return raw ? (JSON.parse(raw) as WidgetState) : null;
}

/** Push the current playback snapshot to every Now Playing widget on the home screen. */
export function updateNowPlayingWidget(state: Omit<WidgetState, "alive">) {
  if (Platform.OS !== "android") return;
  const full: WidgetState = { ...state, alive: true };
  lastState = full;
  storage.setItem(STATE_KEY, JSON.stringify(full)).catch(() => {});
  try {
    requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => <NowPlayingWidget state={full} /> });
  } catch {
    // Expo Go / dev client without the native module
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const alive = !!commandHandler;
  if (props.widgetAction === "WIDGET_CLICK") {
    const cmd = props.clickAction as WidgetCommand | undefined;
    if (alive && cmd) {
      commandHandler?.(cmd);
      return; // AudioProvider re-renders the widget from its own state change
    }
    // Process was not running: bring the app up and re-render with open-app buttons.
    Linking.openURL("frontend://").catch(() => {});
  }
  const saved = await loadState();
  props.renderWidget(<NowPlayingWidget state={saved ? { ...saved, alive, playing: alive && saved.playing } : null} />);
}
