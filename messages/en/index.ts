// One JSON file per feature keeps parallel work free of merge conflicts.
// Add a line here when you create a new namespace file.
import classes from "./classes.json";
import common from "./common.json";

const messages = { ...common, ...classes };

export default messages;
