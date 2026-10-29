// One JSON file per feature keeps parallel work free of merge conflicts.
// Add a line here when you create a new namespace file.
import billing from "./billing.json";
import common from "./common.json";

const messages = { ...common, ...billing };

export default messages;
