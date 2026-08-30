import { dispatch, type Registry } from "./cli/router.js";
import { homeCommand, rootHelp } from "./commands/home.js";
import { fileCommand } from "./commands/file.js";
import { nodeCommand } from "./commands/node.js";
import { exportCommand } from "./commands/export.js";
import { componentsCommand, stylesCommand } from "./commands/library.js";
import { commentsCommand } from "./commands/comments.js";
import { variablesCommand } from "./commands/variables.js";

const registry: Registry = {
  tool: "figma-axi",
  root: homeCommand,
  rootHelp,
  commands: {
    file: fileCommand,
    node: nodeCommand,
    export: exportCommand,
    styles: stylesCommand,
    components: componentsCommand,
    comments: commentsCommand,
    variables: variablesCommand,
  },
  aliases: {},
};

const code = await dispatch(registry, process.argv.slice(2));
process.exit(code);
