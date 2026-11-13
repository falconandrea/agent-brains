const fs = require("node:fs");
const content = fs.readFileSync("hello.txt", "utf8");
if (content !== "hello\n") {
  console.error(`hello.txt content mismatch: ${JSON.stringify(content)}`);
  process.exit(1);
}
console.log("ok");
