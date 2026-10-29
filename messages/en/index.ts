// One JSON file per feature keeps parallel work free of merge conflicts.
// Add a line here when you create a new namespace file.
import auth from "./auth.json";
import billing from "./billing.json";
import classes from "./classes.json";
import common from "./common.json";

const messages = { ...common, ...auth, ...classes, ...billing };

export default messages;
