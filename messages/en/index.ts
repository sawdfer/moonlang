// One JSON file per feature keeps parallel work free of merge conflicts.
// Add a line here when you create a new namespace file.
import common from "./common.json";
import notifications from "./notifications.json";

const messages = { ...common, ...notifications };

export default messages;
