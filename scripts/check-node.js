var requiredMajor = 18;
var version = process.versions && process.versions.node ? process.versions.node : "0.0.0";
var major = parseInt(version.split(".")[0], 10);

if (!major || major < requiredMajor) {
  console.error("Reactive requires Node.js " + requiredMajor + " or newer.");
  console.error("Detected Node.js " + version + ".");
  console.error("Install a current Node.js LTS release, then open a new command prompt and run setup.cmd again.");
  process.exit(1);
}

console.log("Node.js " + version + " detected.");
