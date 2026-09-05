// Side-effect module: registers the Android widget headless task at bundle load (also when the
// widget wakes the app process without a UI). Imported once from app/_layout.tsx.
import { Platform } from "react-native";
import { registerWidgetTaskHandler } from "react-native-android-widget";

import { widgetTaskHandler } from "./widget-task-handler";

if (Platform.OS === "android") {
  registerWidgetTaskHandler(widgetTaskHandler);
}
